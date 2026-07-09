# Phase 4: CPU Profile Analysis — Design Spec

**Date:** 2026-07-09
**Status:** Approved
**Approach:** Mirrored Heap Pipeline (Approach A)

## Overview

Add full CPU profile analysis to PerfLens: V8 `.cpuprofile` parsing, interactive flame chart visualization, hot function detection, and 8 analysis rules with actionable fix suggestions. Supports single-profile analysis and 2-profile comparison for regression detection.

The format detector already recognizes CPU profiles (`"nodes"` + `"startTime"` keys). This phase builds the parsing pipeline, analysis rules, visualization components, and dashboard integration.

## Architecture

```
Upload (.cpuprofile)
  → FormatDetectorService (already detects 'cpu-profile')
  → TraceStoreService (stores raw content)
  → Dashboard (routes to CPU pipeline)
      → CpuProfileParserService
          → Web Worker (cpu-profile.worker.ts)
              → Parse JSON
              → Build call tree (DFS, self/total times)
              → Generate flat profile
              → Extract deopt events
          → Fallback: main thread
      → RuleEngineService.analyzeCpuProfile()
          → 8 CpuAnalysisRules → ActionItems + MetricScores
      → Visualization
          → CpuFlamechartComponent (canvas)
          → CpuHotFunctionsComponent (table)
```

## Data Models

### New file: `src/app/core/models/cpu-profile.model.ts`

#### Raw V8 CPU Profile (input format)

```typescript
export interface CpuProfileRaw {
  nodes: CpuProfileNodeRaw[];
  startTime: number;      // microseconds
  endTime: number;        // microseconds
  samples: number[];      // node IDs sampled at each tick
  timeDeltas: number[];   // microsecond deltas between samples
}

export interface CpuProfileNodeRaw {
  id: number;
  callFrame: CallFrame;
  hitCount: number;
  children?: number[];
  deoptReason?: string;
  positionTicks?: PositionTick[];
}

export interface CallFrame {
  functionName: string;
  scriptId: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
}

export interface PositionTick {
  line: number;
  ticks: number;
}
```

#### Processed output

```typescript
export interface ParsedCpuProfile {
  fileName: string;
  totalTime: number;               // ms
  root: CallTreeNode;              // top-down call tree
  flatProfile: FlatProfileEntry[]; // sorted by self time desc
  samples: SampleTick[];           // time-series sample data
  deoptEvents: DeoptEvent[];       // nodes with deopt reasons
}

export interface CallTreeNode {
  id: number;
  callFrame: CallFrame;
  selfTime: number;      // ms
  totalTime: number;     // ms
  children: CallTreeNode[];
  depth: number;
}

export interface FlatProfileEntry {
  callFrame: CallFrame;
  selfTime: number;      // ms
  totalTime: number;     // ms
  selfPercent: number;   // 0-100
  totalPercent: number;  // 0-100
  hitCount: number;
  deoptReason?: string;
}

export interface SampleTick {
  nodeId: number;
  timestamp: number;     // ms from profile start
  delta: number;         // ms since previous sample
}

export interface DeoptEvent {
  callFrame: CallFrame;
  reason: string;
  hitCount: number;
  selfTime: number;
}

export interface CpuProfileComparison {
  baseline: ParsedCpuProfile;
  current: ParsedCpuProfile;
  added: FlatProfileEntry[];      // functions only in current
  removed: FlatProfileEntry[];    // functions only in baseline
  changed: CpuProfileDiff[];      // functions in both with time deltas
}

export interface CpuProfileDiff {
  callFrame: CallFrame;
  baselineSelfTime: number;
  currentSelfTime: number;
  selfTimeDelta: number;          // current - baseline (positive = regression)
  baselineTotalTime: number;
  currentTotalTime: number;
  totalTimeDelta: number;
}
```

#### MetricTag update

Add `'CPU'` to the existing `MetricTag` union type in `action-item.model.ts`.

#### CpuAnalysisResult

```typescript
export interface CpuAnalysisResult {
  actionItems: ActionItem[];
  metrics: MetricScore[];
  profile: ParsedCpuProfile;
  comparison?: CpuProfileComparison;
}
```

Add `cpuResult?: CpuAnalysisResult` to the existing `AnalysisResult` interface.

## Parser & Worker Pipeline

### `src/app/core/parsers/cpu-profile.worker.ts`

Web Worker that receives a raw JSON string and posts back a `ParsedCpuProfile` with progress updates.

**Message protocol** (same pattern as `heap-snapshot.worker.ts`):
- Input: `{ type: 'parse', data: string }`
- Output progress: `{ type: 'progress', phase: string, percent: number }`
- Output result: `{ type: 'result', data: ParsedCpuProfile }`
- Output error: `{ type: 'error', message: string }`

**Processing phases:**
1. **Parsing JSON** (0-20%) — `JSON.parse` the raw string
2. **Building call tree** (20-60%) — DFS from root node, wire parent-child relationships
3. **Computing times** (60-80%) — Walk `samples` + `timeDeltas` to accumulate self times per node, then DFS to compute total times
4. **Generating flat profile** (80-90%) — Aggregate by callFrame (functionName + url + lineNumber), compute percentages, sort by self time
5. **Extracting deopt events** (90-100%) — Collect nodes with non-empty `deoptReason`

### `src/app/core/services/cpu-profile-parser.service.ts`

Angular service with signal-based state (mirrors `HeapSnapshotParserService`):

```typescript
@Injectable({ providedIn: 'root' })
export class CpuProfileParserService {
  readonly status = signal<'idle' | 'parsing' | 'done' | 'error'>('idle');
  readonly progress = signal(0);
  readonly progressPhase = signal('');
  readonly result = signal<ParsedCpuProfile | null>(null);
  readonly error = signal<string | null>(null);

  async parse(file: File): Promise<void>;
  reset(): void;
}
```

- Tries `new Worker()` first; falls back to main-thread parsing if Workers unavailable
- Resets state before each parse
- Updates progress signals from Worker messages

### Call tree construction algorithm

1. Build a `Map<number, CpuProfileNodeRaw>` from the `nodes` array
2. Create `CallTreeNode` for each raw node, wire children via `children` IDs
3. Walk `samples` array paired with `timeDeltas`:
   - For each sample index `i`, the sampled node ID is `samples[i]`
   - The time spent is `timeDeltas[i]` microseconds (convert to ms)
   - Add this delta to the sampled node's `selfTime`
4. DFS from root: each node's `totalTime` = `selfTime` + sum of children's `totalTime`

### Bottom-up view construction

Inverted call tree for the flame chart's bottom-up mode:
1. For each leaf-to-root path in the call tree, reverse it
2. Merge nodes with the same `callFrame` at the same depth
3. Accumulate self/total times during merge

This is computed on-demand in the flame chart component, not in the parser.

### 2-Profile comparison

The parser service accepts an optional second file for comparison:

```typescript
async parseComparison(baseline: File, current: File): Promise<void>;
```

After parsing both profiles, it computes `CpuProfileComparison`:
- Match functions by `callFrame` identity (functionName + url + lineNumber)
- `added`: functions in current but not baseline
- `removed`: functions in baseline but not current
- `changed`: functions in both, with time deltas

## Analysis Rules

### New interface: `CpuAnalysisRule`

```typescript
export interface CpuAnalysisRule {
  readonly name: string;
  analyze(
    profile: ParsedCpuProfile,
    comparison?: CpuProfileComparison
  ): CpuRuleResult;
}

export interface CpuRuleResult {
  actionItems: ActionItem[];
  metrics: MetricScore[];
}
```

### Rule 1: Hot Functions (`hot-functions`)

- **Detects:** Functions with self time >5% of total profile time
- **Severity:** critical if >15%, warning if >5%
- **Metric:** `CPU` — "Top Function Self Time" with thresholds: good <5%, needs-improvement <15%, poor ≥15%
- **Fix:** Suggests optimization strategies (memoization, algorithm improvement, Web Worker offload)
- **Comparison mode:** Flags functions whose self time increased by >2% between profiles

### Rule 2: Deep Call Stacks (`deep-call-stacks`)

- **Detects:** Maximum call stack depth exceeding 30 frames
- **Severity:** critical if >50 frames, warning if >30
- **Metric:** `CPU` — "Max Stack Depth"
- **Fix:** Suggests flattening recursion, using iteration, or trampolining

### Rule 3: GC Pressure (`gc-pressure`)

- **Detects:** GC-related functions (`(garbage collector)`, `MinorGC`, `MajorGC`, `Scavenge`) taking >5% total time
- **Severity:** critical if >15%, warning if >5%
- **Metric:** `MEMORY` — "GC Time %" with thresholds: good <5%, needs-improvement <15%, poor ≥15%
- **Fix:** Suggests reducing allocations, object pooling, avoiding short-lived objects

### Rule 4: Recursive Calls (`recursive-calls`)

- **Detects:** Functions appearing multiple times in the same call stack path (direct or mutual recursion)
- **Severity:** warning always
- **Metric:** None (informational)
- **Fix:** Suggests converting to iteration, adding memoization, or using tail-call optimization

### Rule 5: Idle Time Analysis (`idle-time`)

- **Detects:** `(idle)` node percentage — flags when CPU is busy >50% of profile (not idle enough)
- **Severity:** info when CPU busy >50%, warning when >80%
- **Metric:** `CPU` — "CPU Busy %" with thresholds: good <50%, needs-improvement <80%, poor ≥80%
- **Fix:** Suggests deferring work, using `requestIdleCallback`, breaking up computation

### Rule 6: Deopt Markers (`deopt-markers`)

- **Detects:** Nodes with non-empty `deoptReason` field
- **Severity:** critical if the deopt'd function is also hot (>5% self time), warning otherwise
- **Metric:** `V8` — "Deoptimizations" (count)
- **Fix:** Includes the specific deopt reason and suggests type-stable code patterns

### Rule 7: Module Aggregation (`module-aggregation`)

- **Detects:** Groups functions by script URL, flags modules consuming >20% total time
- **Severity:** warning per hot module
- **Metric:** `CPU` — "Hottest Module %" 
- **Fix:** Suggests code-splitting, lazy loading, or moving heavy computation to a Worker
- **Comparison mode:** Shows module-level time changes between profiles

### Rule 8: Async Gap Detection (`async-gaps`)

- **Detects:** Gaps >10ms between consecutive samples (suggests event loop blockage or long synchronous work)
- **Severity:** warning if gap >10ms, critical if >50ms
- **Metric:** `INP` — "Max Async Gap" with thresholds: good <10ms, needs-improvement <50ms, poor ≥50ms
- **Fix:** Suggests breaking up synchronous work with `scheduler.yield()` or `setTimeout`

### RuleEngine integration

Add `analyzeCpuProfile(profile: ParsedCpuProfile, comparison?: CpuProfileComparison): CpuAnalysisResult` to `RuleEngineService`. Follows the same pattern as `analyzeHeapSnapshot`.

## Visualization Components

### `src/app/features/dashboard/cpu-flamechart.component.ts`

Canvas-based interactive flame chart (follows `heap-treemap.component.ts` pattern):

**Inputs:**
- `profile: InputSignal<ParsedCpuProfile>` — required
- `comparison: InputSignal<CpuProfileComparison | undefined>` — optional

**Features:**
- **Rendering:** Canvas 2D, draws stacked rectangles. X-axis = time (proportional to totalTime), Y-axis = stack depth (top-down) or inverted (bottom-up)
- **View toggle:** Top-down / Bottom-up button. Bottom-up inverts the call tree to show heavy callers
- **Zoom:** Mouse wheel zooms horizontally (time axis). Double-click resets zoom
- **Pan:** Click-drag pans horizontally when zoomed
- **Search:** Text input filters/highlights frames matching the query. Non-matching frames dim
- **Hover tooltip:** Shows function name, script URL:line, self time (ms + %), total time (ms + %)
- **Click:** Zooms into the clicked frame's subtree
- **Color coding:** Hash function URL to assign consistent colors per script/module. GC frames in red, idle in gray, (program) in dark gray

**Responsive:** Uses `ResizeObserver` to redraw on container resize. `afterNextRender` for initial sizing.

### `src/app/features/dashboard/cpu-hot-functions.component.ts`

Sortable HTML table of functions by time:

**Inputs:**
- `profile: InputSignal<ParsedCpuProfile>` — required
- `comparison: InputSignal<CpuProfileComparison | undefined>` — optional

**Columns:**
| Column | Default Sort | Description |
|--------|-------------|-------------|
| Function | — | `functionName` (or `(anonymous)`) |
| Script | — | URL basename + line number |
| Self Time | ✅ desc | ms |
| Total Time | — | ms |
| Self % | — | percentage bar |
| Total % | — | percentage bar |
| Hits | — | sample hit count |

**Features:**
- Click column header to sort (asc/desc toggle)
- Deopt badge (⚠️) on functions with `deoptReason`, tooltip shows reason
- In comparison mode: additional "Δ Self Time" and "Δ Total Time" columns with red (regression) / green (improvement) color coding
- Click row emits event (for future flame chart cross-highlighting)

### `src/app/features/dashboard/cpu-deopt-list.component.ts`

Table of V8 deoptimization events for the V8 Internals tab:

**Inputs:**
- `deoptEvents: InputSignal<DeoptEvent[]>` — required

**Columns:** Function, Script, Reason, Self Time, Hits
**Features:** Sortable, links deopt reason to V8 documentation categories

## Dashboard Integration

### Tab changes

Update `dashboardTabs` computed signal:

```typescript
{ id: 'cpu-profile', label: 'CPU Profile', icon: '⚡', disabled: !isCpuProfile },
{ id: 'v8-internals', label: 'V8 Internals', icon: '⚙️', disabled: !isCpuProfile || !hasDeoptEvents },
```

The `action-items` tab remains enabled for CPU profiles (shows analysis rule results).

### Dashboard flow for CPU profiles

1. `format === 'cpu-profile'` detected
2. Set placeholder `AnalysisResult` with empty metrics/actionItems
3. Call `CpuProfileParserService.parse(file)` (background Worker)
4. `effect()` watches `cpuParser.result()`:
   - When done, run `ruleEngine.analyzeCpuProfile(result)`
   - Update `result` signal with CPU metrics and action items
   - Set `cpuResult` on `AnalysisResult`
5. If exactly two files are uploaded and both have format `cpu-profile`, trigger comparison mode: the first file is the baseline, the second is the current. Call `cpuParser.parseComparison(file1, file2)`. The comparison data flows to rules and visualization components via the `cpuResult.comparison` signal.

### Score cards for CPU profiles

Display these metrics:
- **Total CPU Time** — total profile duration
- **CPU Busy %** — (1 - idle%) × 100
- **Top Function** — hottest function's self time %
- **GC Time** — if GC pressure rule fires

### Upload component changes

Remove the "cpu-profile not supported" error. Route CPU profiles through the same `TraceStoreService.store()` → dashboard flow. For comparison, accept 2 CPU profile files.

## Testing Strategy

### Test fixtures

Create `src/test-fixtures/sample-cpu-profile.json` — a synthetic V8 CPU profile (~20 nodes) containing:
- A hot function (>15% self time)
- GC node with notable time
- A recursive call chain (depth > 30)
- A node with `deoptReason: "not a Smi"`
- An `(idle)` node
- Gaps in timeDeltas (>10ms) for async gap detection
- Multiple scripts/URLs for module aggregation

Create `src/test-fixtures/sample-cpu-profile-2.json` — a second profile for comparison testing with shifted times.

### Test files

| Test File | Tests |
|-----------|-------|
| `cpu-profile-parser.service.spec.ts` | Parses fixture, verifies tree structure, self/total times, flat profile order |
| `cpu-profile.worker.spec.ts` | Worker message protocol, progress updates, error handling |
| `hot-functions.rule.spec.ts` | Detects hot functions, correct severity thresholds |
| `deep-call-stacks.rule.spec.ts` | Detects deep stacks, correct depth calculation |
| `gc-pressure.rule.spec.ts` | Detects GC nodes, time percentage |
| `recursive-calls.rule.spec.ts` | Detects direct and mutual recursion |
| `idle-time.rule.spec.ts` | Computes busy %, correct thresholds |
| `deopt-markers.rule.spec.ts` | Finds deopt nodes, hot+deopt = critical |
| `module-aggregation.rule.spec.ts` | Groups by URL, flags hot modules |
| `async-gaps.rule.spec.ts` | Detects gaps in timeDeltas |
| `cpu-flamechart.component.spec.ts` | Canvas renders, view toggle works |
| `cpu-hot-functions.component.spec.ts` | Table renders rows, sorting works |
| `cpu-deopt-list.component.spec.ts` | Table renders deopt events |
| `cpu-profile-comparison.spec.ts` | 2-profile diff produces correct added/removed/changed |
| `dashboard.component.spec.ts` (extend) | CPU profile tab enabled, action items populated |

### Running tests

All tests run with `ng test` (Vitest). Target: all new tests pass alongside existing 157 tests.

## File Summary

### New files (18)

| Path | Purpose |
|------|---------|
| `src/app/core/models/cpu-profile.model.ts` | Data interfaces |
| `src/app/core/parsers/cpu-profile.worker.ts` | Web Worker |
| `src/app/core/parsers/cpu-profile-parser.ts` | Call tree builder (pure functions) |
| `src/app/core/services/cpu-profile-parser.service.ts` | Angular service |
| `src/app/core/analysis/cpu-analysis-rule.ts` | Rule interface |
| `src/app/core/analysis/rules/hot-functions.rule.ts` | Rule 1 |
| `src/app/core/analysis/rules/deep-call-stacks.rule.ts` | Rule 2 |
| `src/app/core/analysis/rules/gc-pressure.rule.ts` | Rule 3 |
| `src/app/core/analysis/rules/recursive-calls.rule.ts` | Rule 4 |
| `src/app/core/analysis/rules/idle-time.rule.ts` | Rule 5 |
| `src/app/core/analysis/rules/deopt-markers.rule.ts` | Rule 6 |
| `src/app/core/analysis/rules/module-aggregation.rule.ts` | Rule 7 |
| `src/app/core/analysis/rules/async-gaps.rule.ts` | Rule 8 |
| `src/app/features/dashboard/cpu-flamechart.component.ts` | Flame chart |
| `src/app/features/dashboard/cpu-hot-functions.component.ts` | Hot functions table |
| `src/app/features/dashboard/cpu-deopt-list.component.ts` | Deopt list |
| `src/test-fixtures/sample-cpu-profile.json` | Test fixture |
| `src/test-fixtures/sample-cpu-profile-2.json` | Comparison fixture |

### Modified files (5)

| Path | Change |
|------|--------|
| `src/app/core/models/action-item.model.ts` | Add `'CPU'` to `MetricTag` |
| `src/app/core/models/trace-event.model.ts` | Add `cpuResult?: CpuAnalysisResult` to `AnalysisResult` |
| `src/app/core/analysis/rule-engine.service.ts` | Add `analyzeCpuProfile()` method |
| `src/app/features/dashboard/dashboard.component.ts` | CPU tab, parser integration, comparison mode |
| `src/app/features/upload/upload.component.ts` | Remove CPU profile "not supported" error |
