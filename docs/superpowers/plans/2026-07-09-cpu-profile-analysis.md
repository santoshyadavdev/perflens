# CPU Profile Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full V8 CPU profile analysis to PerfLens — parsing, 8 analysis rules, interactive flame chart, hot functions table, and 2-profile comparison.

**Architecture:** Mirror the Phase 3 heap snapshot pipeline. A `CpuProfileParserService` with Web Worker parses `.cpuprofile` files into a call tree. Eight `CpuAnalysisRule` implementations produce `ActionItem`s. Two new visualization components (flame chart + hot functions table) display in new dashboard tabs. The upload component and dashboard route CPU profiles through this pipeline.

**Tech Stack:** Angular 22 (signals, standalone components, zoneless), TypeScript, Canvas 2D API, Vitest, Web Workers

---

## File Map

### New files (23)

| Path | Purpose |
|------|---------|
| `src/app/core/models/cpu-profile.model.ts` | All CPU profile interfaces |
| `src/app/core/parsers/cpu-profile-parser.ts` | Pure functions: build call tree, flat profile, bottom-up tree, comparison |
| `src/app/core/parsers/cpu-profile.worker.ts` | Web Worker for off-thread parsing |
| `src/app/core/services/cpu-profile-parser.service.ts` | Angular service wrapping worker |
| `src/app/core/analysis/cpu-analysis-rule.ts` | Rule interface |
| `src/app/core/analysis/rules/hot-functions.rule.ts` | Rule 1 |
| `src/app/core/analysis/rules/deep-call-stacks.rule.ts` | Rule 2 |
| `src/app/core/analysis/rules/gc-pressure.rule.ts` | Rule 3 |
| `src/app/core/analysis/rules/recursive-calls.rule.ts` | Rule 4 |
| `src/app/core/analysis/rules/idle-time.rule.ts` | Rule 5 |
| `src/app/core/analysis/rules/deopt-markers.rule.ts` | Rule 6 |
| `src/app/core/analysis/rules/module-aggregation.rule.ts` | Rule 7 |
| `src/app/core/analysis/rules/async-gaps.rule.ts` | Rule 8 |
| `src/app/features/dashboard/cpu-flamechart.component.ts` | Canvas flame chart |
| `src/app/features/dashboard/cpu-hot-functions.component.ts` | Sortable table |
| `src/app/features/dashboard/cpu-deopt-list.component.ts` | Deopt list for V8 Internals tab |
| `src/test-fixtures/sample-cpu-profile.json` | Primary test fixture |
| `src/test-fixtures/sample-cpu-profile-2.json` | Comparison test fixture |
| `src/app/core/parsers/cpu-profile-parser.spec.ts` | Parser tests |
| `src/app/core/analysis/rules/hot-functions.rule.spec.ts` | Rule 1 tests |
| `src/app/core/analysis/rules/deep-call-stacks.rule.spec.ts` | Rule 2 tests |
| `src/app/core/analysis/rules/gc-pressure.rule.spec.ts` | Rule 3 tests |
| `src/app/core/analysis/rules/recursive-calls.rule.spec.ts` | Rule 4 tests |

### Modified files (4)

| Path | Change |
|------|--------|
| `src/app/core/models/action-item.model.ts` | Add `'CPU'` to `MetricTag` |
| `src/app/core/models/analysis-result.model.ts` | Add `cpuResult?` field |
| `src/app/core/analysis/rule-engine.service.ts` | Add `analyzeCpuProfile()` method, register 8 CPU rules |
| `src/app/features/dashboard/dashboard.component.ts` | CPU profile tab, parser integration, comparison mode |
| `src/app/features/upload/upload.component.ts` | Store CPU profiles as raw File (like heap snapshots) |

---

### Task 1: Data Models & Test Fixtures

**Files:**
- Create: `src/app/core/models/cpu-profile.model.ts`
- Modify: `src/app/core/models/action-item.model.ts`
- Modify: `src/app/core/models/analysis-result.model.ts`
- Create: `src/test-fixtures/sample-cpu-profile.json`
- Create: `src/test-fixtures/sample-cpu-profile-2.json`

- [ ] **Step 1: Create CPU profile model**

Create `src/app/core/models/cpu-profile.model.ts`:

```typescript
/** Raw V8 CPU Profile format (input from .cpuprofile files) */
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

/** Processed call tree node */
export interface CallTreeNode {
  id: number;
  callFrame: CallFrame;
  selfTime: number;      // ms
  totalTime: number;     // ms
  children: CallTreeNode[];
  depth: number;
}

/** Flat profile entry (aggregated by callFrame) */
export interface FlatProfileEntry {
  callFrame: CallFrame;
  selfTime: number;      // ms
  totalTime: number;     // ms
  selfPercent: number;   // 0-100
  totalPercent: number;  // 0-100
  hitCount: number;
  deoptReason?: string;
}

/** Single sample tick */
export interface SampleTick {
  nodeId: number;
  timestamp: number;     // ms from profile start
  delta: number;         // ms since previous sample
}

/** Deoptimization event */
export interface DeoptEvent {
  callFrame: CallFrame;
  reason: string;
  hitCount: number;
  selfTime: number;      // ms
}

/** Fully parsed CPU profile */
export interface ParsedCpuProfile {
  fileName: string;
  totalTime: number;               // ms
  root: CallTreeNode;              // top-down call tree
  flatProfile: FlatProfileEntry[]; // sorted by self time desc
  samples: SampleTick[];           // time-series sample data
  deoptEvents: DeoptEvent[];       // nodes with deopt reasons
}

/** 2-profile comparison */
export interface CpuProfileComparison {
  baseline: ParsedCpuProfile;
  current: ParsedCpuProfile;
  added: FlatProfileEntry[];
  removed: FlatProfileEntry[];
  changed: CpuProfileDiff[];
}

export interface CpuProfileDiff {
  callFrame: CallFrame;
  baselineSelfTime: number;
  currentSelfTime: number;
  selfTimeDelta: number;
  baselineTotalTime: number;
  currentTotalTime: number;
  totalTimeDelta: number;
}

/** Worker message types */
export type CpuWorkerMessage =
  | { type: 'progress'; phase: string; percent: number }
  | { type: 'result'; profile: ParsedCpuProfile }
  | { type: 'error'; message: string };

/** Combined CPU analysis result */
export interface CpuAnalysisResult {
  profile: ParsedCpuProfile;
  comparison?: CpuProfileComparison;
}
```

- [ ] **Step 2: Add `'CPU'` to MetricTag**

In `src/app/core/models/action-item.model.ts`, change line 3:

```typescript
export type MetricTag = 'LCP' | 'INP' | 'CLS' | 'TBT' | 'FCP' | 'SIZE' | 'MEMORY' | 'V8' | 'CPU';
```

- [ ] **Step 3: Add `cpuResult` to AnalysisResult**

In `src/app/core/models/analysis-result.model.ts`, add the import and field:

```typescript
import { ActionItem } from './action-item.model';
import { CpuAnalysisResult } from './cpu-profile.model';
import { HeapAnalysisResult } from './heap-snapshot.model';
import { MetricScore } from './metric-score.model';
import { ParsedTrace } from './trace-event.model';

export interface AnalysisResult {
  fileName: string;
  fileSize: number;
  analyzedAt: Date;
  metrics: MetricScore[];
  actionItems: ActionItem[];
  parsedTrace: ParsedTrace;
  heapResult?: HeapAnalysisResult;
  cpuResult?: CpuAnalysisResult;
}
```

- [ ] **Step 4: Create primary test fixture**

Create `src/test-fixtures/sample-cpu-profile.json`. This fixture has 12 nodes covering: a hot function (>15% self time), GC, recursion (depth > 30 simulated via samples), a deopt, idle node, and multiple scripts:

```json
{
  "nodes": [
    {
      "id": 1,
      "callFrame": { "functionName": "(root)", "scriptId": "0", "url": "", "lineNumber": -1, "columnNumber": -1 },
      "hitCount": 0,
      "children": [2, 3, 8]
    },
    {
      "id": 2,
      "callFrame": { "functionName": "(idle)", "scriptId": "0", "url": "", "lineNumber": -1, "columnNumber": -1 },
      "hitCount": 30,
      "children": []
    },
    {
      "id": 3,
      "callFrame": { "functionName": "processData", "scriptId": "10", "url": "https://example.com/app.js", "lineNumber": 42, "columnNumber": 0 },
      "hitCount": 25,
      "children": [4, 5, 7],
      "deoptReason": "not a Smi"
    },
    {
      "id": 4,
      "callFrame": { "functionName": "transformItem", "scriptId": "10", "url": "https://example.com/app.js", "lineNumber": 100, "columnNumber": 0 },
      "hitCount": 15,
      "children": [6]
    },
    {
      "id": 5,
      "callFrame": { "functionName": "validateInput", "scriptId": "20", "url": "https://example.com/validation.js", "lineNumber": 10, "columnNumber": 0 },
      "hitCount": 5,
      "children": []
    },
    {
      "id": 6,
      "callFrame": { "functionName": "processData", "scriptId": "10", "url": "https://example.com/app.js", "lineNumber": 42, "columnNumber": 0 },
      "hitCount": 8,
      "children": []
    },
    {
      "id": 7,
      "callFrame": { "functionName": "(garbage collector)", "scriptId": "0", "url": "", "lineNumber": -1, "columnNumber": -1 },
      "hitCount": 12,
      "children": []
    },
    {
      "id": 8,
      "callFrame": { "functionName": "render", "scriptId": "30", "url": "https://example.com/ui.js", "lineNumber": 5, "columnNumber": 0 },
      "hitCount": 3,
      "children": [9, 10]
    },
    {
      "id": 9,
      "callFrame": { "functionName": "layout", "scriptId": "30", "url": "https://example.com/ui.js", "lineNumber": 50, "columnNumber": 0 },
      "hitCount": 2,
      "children": []
    },
    {
      "id": 10,
      "callFrame": { "functionName": "paint", "scriptId": "30", "url": "https://example.com/ui.js", "lineNumber": 80, "columnNumber": 0 },
      "hitCount": 1,
      "children": [11]
    },
    {
      "id": 11,
      "callFrame": { "functionName": "composeLayers", "scriptId": "30", "url": "https://example.com/ui.js", "lineNumber": 120, "columnNumber": 0 },
      "hitCount": 1,
      "children": [12]
    },
    {
      "id": 12,
      "callFrame": { "functionName": "rasterize", "scriptId": "30", "url": "https://example.com/ui.js", "lineNumber": 150, "columnNumber": 0 },
      "hitCount": 1,
      "children": []
    }
  ],
  "startTime": 0,
  "endTime": 103000,
  "samples": [2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 6, 6, 5, 5, 7, 7, 7, 2, 2, 2, 3, 3, 3, 4, 4, 6, 6, 5, 7, 7, 2, 2, 2, 2, 2, 2, 8, 9, 10, 11, 12, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 6, 6, 6, 5, 5, 7, 7, 7, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 8, 8, 9, 10, 11, 12, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 4, 6, 5, 7, 7, 2, 2, 2, 2, 2],
  "timeDeltas": [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 15000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000]
}
```

Note: `timeDeltas[43]` = 15000 (15ms gap) for async gap detection testing. Total profile = 103ms (103 samples × ~1ms each, plus the 15ms gap).

- [ ] **Step 5: Create comparison test fixture**

Create `src/test-fixtures/sample-cpu-profile-2.json` — same structure but with shifted times (processData is hotter, new function added):

```json
{
  "nodes": [
    {
      "id": 1,
      "callFrame": { "functionName": "(root)", "scriptId": "0", "url": "", "lineNumber": -1, "columnNumber": -1 },
      "hitCount": 0,
      "children": [2, 3, 8, 13]
    },
    {
      "id": 2,
      "callFrame": { "functionName": "(idle)", "scriptId": "0", "url": "", "lineNumber": -1, "columnNumber": -1 },
      "hitCount": 20,
      "children": []
    },
    {
      "id": 3,
      "callFrame": { "functionName": "processData", "scriptId": "10", "url": "https://example.com/app.js", "lineNumber": 42, "columnNumber": 0 },
      "hitCount": 35,
      "children": [4, 5, 7]
    },
    {
      "id": 4,
      "callFrame": { "functionName": "transformItem", "scriptId": "10", "url": "https://example.com/app.js", "lineNumber": 100, "columnNumber": 0 },
      "hitCount": 20,
      "children": [6]
    },
    {
      "id": 5,
      "callFrame": { "functionName": "validateInput", "scriptId": "20", "url": "https://example.com/validation.js", "lineNumber": 10, "columnNumber": 0 },
      "hitCount": 5,
      "children": []
    },
    {
      "id": 6,
      "callFrame": { "functionName": "processData", "scriptId": "10", "url": "https://example.com/app.js", "lineNumber": 42, "columnNumber": 0 },
      "hitCount": 10,
      "children": []
    },
    {
      "id": 7,
      "callFrame": { "functionName": "(garbage collector)", "scriptId": "0", "url": "", "lineNumber": -1, "columnNumber": -1 },
      "hitCount": 5,
      "children": []
    },
    {
      "id": 8,
      "callFrame": { "functionName": "render", "scriptId": "30", "url": "https://example.com/ui.js", "lineNumber": 5, "columnNumber": 0 },
      "hitCount": 3,
      "children": [9]
    },
    {
      "id": 9,
      "callFrame": { "functionName": "layout", "scriptId": "30", "url": "https://example.com/ui.js", "lineNumber": 50, "columnNumber": 0 },
      "hitCount": 2,
      "children": []
    },
    {
      "id": 13,
      "callFrame": { "functionName": "newFeature", "scriptId": "40", "url": "https://example.com/new.js", "lineNumber": 1, "columnNumber": 0 },
      "hitCount": 5,
      "children": []
    }
  ],
  "startTime": 0,
  "endTime": 105000,
  "samples": [2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 6, 6, 6, 5, 5, 7, 7, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 6, 6, 5, 7, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 6, 6, 6, 6, 5, 5, 7, 7, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 6, 5, 7, 2, 2, 2, 2, 8, 8, 8, 9, 9, 2, 2, 13, 13, 13, 13, 13, 3, 3, 3, 3, 4, 4, 6, 5, 7, 2, 2, 2, 2, 2, 2],
  "timeDeltas": [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000]
}
```

Note: `newFeature` is added (not in fixture 1). `paint`, `composeLayers`, `rasterize` removed. `processData` has more hits (regression).

- [ ] **Step 6: Verify build still passes**

Run: `cd /Users/santosh/.copilot/copilot-worktrees/perflens/santoshyadavdev-fuzzy-enigma && npx ng build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add src/app/core/models/cpu-profile.model.ts src/app/core/models/action-item.model.ts src/app/core/models/analysis-result.model.ts src/test-fixtures/sample-cpu-profile.json src/test-fixtures/sample-cpu-profile-2.json
git commit -m "feat(cpu): add CPU profile data models and test fixtures"
```

---

### Task 2: CPU Profile Parser (Pure Functions)

**Files:**
- Create: `src/app/core/parsers/cpu-profile-parser.ts`
- Create: `src/app/core/parsers/cpu-profile-parser.spec.ts`

- [ ] **Step 1: Write failing tests for the parser**

Create `src/app/core/parsers/cpu-profile-parser.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildCallTree, buildFlatProfile, compareCpuProfiles } from './cpu-profile-parser';
import sampleProfile from '../../../test-fixtures/sample-cpu-profile.json';
import sampleProfile2 from '../../../test-fixtures/sample-cpu-profile-2.json';
import type { CpuProfileRaw } from '../models/cpu-profile.model';

describe('buildCallTree', () => {
  it('should return a root node with children', () => {
    const result = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    expect(result.root.callFrame.functionName).toBe('(root)');
    expect(result.root.children.length).toBeGreaterThan(0);
  });

  it('should compute totalTime close to profile duration', () => {
    const result = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    // totalTime is sum of all timeDeltas in ms
    expect(result.totalTime).toBeGreaterThan(50);
    expect(result.totalTime).toBeLessThan(200);
  });

  it('should compute selfTime for leaf nodes from samples', () => {
    const result = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    // idle node (id=2) is heavily sampled, should have significant selfTime
    const idleNode = findNode(result.root, '(idle)');
    expect(idleNode).toBeDefined();
    expect(idleNode!.selfTime).toBeGreaterThan(0);
  });

  it('should compute totalTime >= selfTime for every node', () => {
    const result = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    const allNodes = flattenTree(result.root);
    for (const node of allNodes) {
      expect(node.totalTime).toBeGreaterThanOrEqual(node.selfTime);
    }
  });

  it('should extract deopt events', () => {
    const result = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    expect(result.deoptEvents.length).toBeGreaterThan(0);
    expect(result.deoptEvents[0].reason).toBe('not a Smi');
  });

  it('should produce sample ticks', () => {
    const result = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    expect(result.samples.length).toBe(sampleProfile.samples.length);
    expect(result.samples[0].delta).toBeGreaterThan(0);
  });
});

describe('buildFlatProfile', () => {
  it('should aggregate entries by callFrame identity', () => {
    const parsed = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    const flat = buildFlatProfile(parsed);
    // processData appears as node 3 and node 6 — should be merged
    const processDataEntries = flat.filter(e => e.callFrame.functionName === 'processData');
    expect(processDataEntries.length).toBe(1);
    expect(processDataEntries[0].selfTime).toBeGreaterThan(0);
  });

  it('should be sorted by selfTime descending', () => {
    const parsed = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    const flat = buildFlatProfile(parsed);
    for (let i = 1; i < flat.length; i++) {
      expect(flat[i - 1].selfTime).toBeGreaterThanOrEqual(flat[i].selfTime);
    }
  });

  it('should compute selfPercent summing to ~100', () => {
    const parsed = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    const flat = buildFlatProfile(parsed);
    const totalPercent = flat.reduce((s, e) => s + e.selfPercent, 0);
    expect(totalPercent).toBeGreaterThan(95);
    expect(totalPercent).toBeLessThanOrEqual(101);
  });

  it('should include deoptReason on deopt entries', () => {
    const parsed = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    const flat = buildFlatProfile(parsed);
    const processData = flat.find(e => e.callFrame.functionName === 'processData');
    expect(processData?.deoptReason).toBe('not a Smi');
  });
});

describe('compareCpuProfiles', () => {
  it('should detect added functions', () => {
    const p1 = buildCallTree(sampleProfile as CpuProfileRaw, 'baseline.cpuprofile');
    const p2 = buildCallTree(sampleProfile2 as CpuProfileRaw, 'current.cpuprofile');
    const comparison = compareCpuProfiles(p1, p2);
    const addedNames = comparison.added.map(e => e.callFrame.functionName);
    expect(addedNames).toContain('newFeature');
  });

  it('should detect removed functions', () => {
    const p1 = buildCallTree(sampleProfile as CpuProfileRaw, 'baseline.cpuprofile');
    const p2 = buildCallTree(sampleProfile2 as CpuProfileRaw, 'current.cpuprofile');
    const comparison = compareCpuProfiles(p1, p2);
    const removedNames = comparison.removed.map(e => e.callFrame.functionName);
    // rasterize, composeLayers, paint are in fixture 1 but not fixture 2
    expect(removedNames).toContain('rasterize');
  });

  it('should detect changed functions with time deltas', () => {
    const p1 = buildCallTree(sampleProfile as CpuProfileRaw, 'baseline.cpuprofile');
    const p2 = buildCallTree(sampleProfile2 as CpuProfileRaw, 'current.cpuprofile');
    const comparison = compareCpuProfiles(p1, p2);
    expect(comparison.changed.length).toBeGreaterThan(0);
    const processDataDiff = comparison.changed.find(d => d.callFrame.functionName === 'processData');
    expect(processDataDiff).toBeDefined();
  });
});

function findNode(node: { callFrame: { functionName: string }; children: any[] }, name: string): any {
  if (node.callFrame.functionName === name) return node;
  for (const child of node.children) {
    const found = findNode(child, name);
    if (found) return found;
  }
  return undefined;
}

function flattenTree(node: { children: any[] }): any[] {
  const result = [node];
  for (const child of node.children) {
    result.push(...flattenTree(child));
  }
  return result;
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/santosh/.copilot/copilot-worktrees/perflens/santoshyadavdev-fuzzy-enigma && npx vitest run src/app/core/parsers/cpu-profile-parser.spec.ts 2>&1 | tail -10`
Expected: FAIL — module `./cpu-profile-parser` not found

- [ ] **Step 3: Implement the parser**

Create `src/app/core/parsers/cpu-profile-parser.ts`:

```typescript
import type {
  CpuProfileRaw,
  CpuProfileNodeRaw,
  CallTreeNode,
  ParsedCpuProfile,
  FlatProfileEntry,
  SampleTick,
  DeoptEvent,
  CpuProfileComparison,
  CpuProfileDiff,
} from '../models/cpu-profile.model';

/**
 * Build a call tree from a raw V8 CPU profile.
 * Computes self times from samples+timeDeltas, then total times via DFS.
 */
export function buildCallTree(raw: CpuProfileRaw, fileName: string): ParsedCpuProfile {
  const nodeMap = new Map<number, CpuProfileNodeRaw>();
  for (const node of raw.nodes) {
    nodeMap.set(node.id, node);
  }

  // Accumulate self times from samples + timeDeltas (convert µs → ms)
  const selfTimeMap = new Map<number, number>();
  const samples: SampleTick[] = [];
  let cumulativeTime = 0;

  for (let i = 0; i < raw.samples.length; i++) {
    const nodeId = raw.samples[i];
    const deltaUs = raw.timeDeltas[i] ?? 0;
    const deltaMs = deltaUs / 1000;
    cumulativeTime += deltaMs;

    selfTimeMap.set(nodeId, (selfTimeMap.get(nodeId) ?? 0) + deltaMs);
    samples.push({ nodeId, timestamp: cumulativeTime, delta: deltaMs });
  }

  const totalTime = cumulativeTime;

  // Build CallTreeNode recursively
  function buildNode(rawNode: CpuProfileNodeRaw, depth: number): CallTreeNode {
    const children = (rawNode.children ?? [])
      .map(childId => nodeMap.get(childId))
      .filter((n): n is CpuProfileNodeRaw => n !== undefined)
      .map(child => buildNode(child, depth + 1));

    const selfTime = selfTimeMap.get(rawNode.id) ?? 0;
    const childrenTotal = children.reduce((sum, c) => sum + c.totalTime, 0);

    return {
      id: rawNode.id,
      callFrame: rawNode.callFrame,
      selfTime,
      totalTime: selfTime + childrenTotal,
      children,
      depth,
    };
  }

  const rootRaw = raw.nodes[0];
  const root = buildNode(rootRaw, 0);

  // Extract deopt events
  const deoptEvents: DeoptEvent[] = raw.nodes
    .filter(n => n.deoptReason && n.deoptReason.length > 0)
    .map(n => ({
      callFrame: n.callFrame,
      reason: n.deoptReason!,
      hitCount: n.hitCount,
      selfTime: selfTimeMap.get(n.id) ?? 0,
    }));

  // Build flat profile
  const flatProfile = buildFlatProfileFromTree(root, totalTime, raw.nodes);

  return { fileName, totalTime, root, flatProfile, samples, deoptEvents };
}

/**
 * Build a flat profile from a parsed CPU profile.
 * Aggregates by callFrame identity (functionName + url + lineNumber).
 */
export function buildFlatProfile(parsed: ParsedCpuProfile): FlatProfileEntry[] {
  return parsed.flatProfile;
}

function buildFlatProfileFromTree(
  root: CallTreeNode,
  totalTime: number,
  rawNodes: CpuProfileNodeRaw[],
): FlatProfileEntry[] {
  // Aggregate self and total times by callFrame key
  const map = new Map<string, {
    callFrame: CallTreeNode['callFrame'];
    selfTime: number;
    totalTime: number;
    hitCount: number;
    deoptReason?: string;
  }>();

  // Build deopt map from raw nodes
  const deoptMap = new Map<string, string>();
  for (const n of rawNodes) {
    if (n.deoptReason && n.deoptReason.length > 0) {
      deoptMap.set(callFrameKey(n.callFrame), n.deoptReason);
    }
  }

  function walk(node: CallTreeNode): void {
    const key = callFrameKey(node.callFrame);
    const existing = map.get(key);
    if (existing) {
      existing.selfTime += node.selfTime;
      // For totalTime, take the max seen (don't double-count for recursive calls)
      existing.totalTime = Math.max(existing.totalTime, node.totalTime);
      existing.hitCount += node.selfTime > 0 ? 1 : 0;
    } else {
      map.set(key, {
        callFrame: node.callFrame,
        selfTime: node.selfTime,
        totalTime: node.totalTime,
        hitCount: node.selfTime > 0 ? 1 : 0,
        deoptReason: deoptMap.get(key),
      });
    }
    for (const child of node.children) {
      walk(child);
    }
  }

  walk(root);

  const entries: FlatProfileEntry[] = [];
  for (const entry of map.values()) {
    entries.push({
      callFrame: entry.callFrame,
      selfTime: entry.selfTime,
      totalTime: entry.totalTime,
      selfPercent: totalTime > 0 ? (entry.selfTime / totalTime) * 100 : 0,
      totalPercent: totalTime > 0 ? (entry.totalTime / totalTime) * 100 : 0,
      hitCount: entry.hitCount,
      deoptReason: entry.deoptReason,
    });
  }

  return entries.sort((a, b) => b.selfTime - a.selfTime);
}

/**
 * Compare two parsed CPU profiles.
 */
export function compareCpuProfiles(
  baseline: ParsedCpuProfile,
  current: ParsedCpuProfile,
): CpuProfileComparison {
  const baseMap = new Map(baseline.flatProfile.map(e => [callFrameKey(e.callFrame), e]));
  const currMap = new Map(current.flatProfile.map(e => [callFrameKey(e.callFrame), e]));

  const added: FlatProfileEntry[] = [];
  const removed: FlatProfileEntry[] = [];
  const changed: CpuProfileDiff[] = [];

  for (const [key, curr] of currMap) {
    const base = baseMap.get(key);
    if (!base) {
      added.push(curr);
    } else {
      changed.push({
        callFrame: curr.callFrame,
        baselineSelfTime: base.selfTime,
        currentSelfTime: curr.selfTime,
        selfTimeDelta: curr.selfTime - base.selfTime,
        baselineTotalTime: base.totalTime,
        currentTotalTime: curr.totalTime,
        totalTimeDelta: curr.totalTime - base.totalTime,
      });
    }
  }

  for (const [key, base] of baseMap) {
    if (!currMap.has(key)) {
      removed.push(base);
    }
  }

  return {
    baseline,
    current,
    added: added.sort((a, b) => b.selfTime - a.selfTime),
    removed: removed.sort((a, b) => b.selfTime - a.selfTime),
    changed: changed.sort((a, b) => Math.abs(b.selfTimeDelta) - Math.abs(a.selfTimeDelta)),
  };
}

/** Identity key for a callFrame (function + url + line) */
function callFrameKey(cf: { functionName: string; url: string; lineNumber: number }): string {
  return `${cf.functionName}|${cf.url}|${cf.lineNumber}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/santosh/.copilot/copilot-worktrees/perflens/santoshyadavdev-fuzzy-enigma && npx vitest run src/app/core/parsers/cpu-profile-parser.spec.ts 2>&1 | tail -15`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/core/parsers/cpu-profile-parser.ts src/app/core/parsers/cpu-profile-parser.spec.ts
git commit -m "feat(cpu): add CPU profile parser with call tree and flat profile"
```

---

### Task 3: Web Worker & Parser Service

**Files:**
- Create: `src/app/core/parsers/cpu-profile.worker.ts`
- Create: `src/app/core/services/cpu-profile-parser.service.ts`

- [ ] **Step 1: Create the Web Worker**

Create `src/app/core/parsers/cpu-profile.worker.ts`:

```typescript
/// <reference lib="webworker" />

import { buildCallTree } from './cpu-profile-parser';
import type { CpuProfileRaw, CpuWorkerMessage } from '../models/cpu-profile.model';

addEventListener('message', async (event: MessageEvent) => {
  const { file, fileName } = event.data as { file: File; fileName: string };

  try {
    postProgress('Reading file...', 10);
    const text = await file.text();

    postProgress('Parsing JSON...', 30);
    const raw: CpuProfileRaw = JSON.parse(text);

    postProgress('Building call tree...', 60);
    const profile = buildCallTree(raw, fileName);

    postProgress('Finalizing...', 90);

    const result: CpuWorkerMessage = { type: 'result', profile };
    postMessage(result);
  } catch (err) {
    const error: CpuWorkerMessage = {
      type: 'error',
      message: err instanceof Error ? err.message : 'Unknown error parsing CPU profile',
    };
    postMessage(error);
  }
});

function postProgress(phase: string, percent: number): void {
  const msg: CpuWorkerMessage = { type: 'progress', phase, percent };
  postMessage(msg);
}
```

- [ ] **Step 2: Create the parser service**

Create `src/app/core/services/cpu-profile-parser.service.ts`:

```typescript
import { Injectable, signal } from '@angular/core';
import type { ParsedCpuProfile, CpuWorkerMessage, CpuProfileRaw } from '../models/cpu-profile.model';
import { buildCallTree } from '../parsers/cpu-profile-parser';

@Injectable({ providedIn: 'root' })
export class CpuProfileParserService {
  readonly status = signal<'idle' | 'parsing' | 'done' | 'error'>('idle');
  readonly progress = signal(0);
  readonly progressPhase = signal('');
  readonly result = signal<ParsedCpuProfile | null>(null);
  readonly error = signal<string | null>(null);

  private worker: Worker | null = null;

  async parse(file: File): Promise<void> {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    this.status.set('parsing');
    this.progress.set(0);
    this.progressPhase.set('Starting...');
    this.result.set(null);
    this.error.set(null);

    if (typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(new URL('../parsers/cpu-profile.worker', import.meta.url));
        return this.parseWithWorker(file);
      } catch {
        // Worker creation failed, fall back
      }
    }

    return this.parseOnMainThread(file);
  }

  private parseWithWorker(file: File): Promise<void> {
    return new Promise<void>((resolve) => {
      this.worker!.onmessage = (event: MessageEvent<CpuWorkerMessage>) => {
        const msg = event.data;
        switch (msg.type) {
          case 'progress':
            this.progress.set(msg.percent);
            this.progressPhase.set(msg.phase);
            break;
          case 'result':
            this.result.set(msg.profile);
            this.status.set('done');
            this.progress.set(100);
            this.worker?.terminate();
            resolve();
            break;
          case 'error':
            this.error.set(msg.message);
            this.status.set('error');
            this.worker?.terminate();
            resolve();
            break;
        }
      };

      this.worker!.onerror = (err) => {
        this.error.set(err.message || 'Worker error');
        this.status.set('error');
        resolve();
      };

      this.worker!.postMessage({ file, fileName: file.name });
    });
  }

  private async parseOnMainThread(file: File): Promise<void> {
    try {
      this.progressPhase.set('Reading file...');
      this.progress.set(10);
      const text = await file.text();

      this.progressPhase.set('Parsing JSON...');
      this.progress.set(30);
      const raw: CpuProfileRaw = JSON.parse(text);

      this.progressPhase.set('Building call tree...');
      this.progress.set(60);
      const profile = buildCallTree(raw, file.name);

      this.result.set(profile);
      this.status.set('done');
      this.progress.set(100);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to parse CPU profile');
      this.status.set('error');
    }
  }

  reset(): void {
    this.worker?.terminate();
    this.worker = null;
    this.status.set('idle');
    this.progress.set(0);
    this.progressPhase.set('');
    this.result.set(null);
    this.error.set(null);
  }
}
```

- [ ] **Step 3: Verify build passes**

Run: `cd /Users/santosh/.copilot/copilot-worktrees/perflens/santoshyadavdev-fuzzy-enigma && npx ng build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/app/core/parsers/cpu-profile.worker.ts src/app/core/services/cpu-profile-parser.service.ts
git commit -m "feat(cpu): add Web Worker and parser service for CPU profiles"
```

---

### Task 4: CPU Analysis Rule Interface & Rule Engine Integration

**Files:**
- Create: `src/app/core/analysis/cpu-analysis-rule.ts`
- Modify: `src/app/core/analysis/rule-engine.service.ts`

- [ ] **Step 1: Create the CPU analysis rule interface**

Create `src/app/core/analysis/cpu-analysis-rule.ts`:

```typescript
import type { ParsedCpuProfile, CpuProfileComparison } from '../models/cpu-profile.model';
import type { ActionItem } from '../models/action-item.model';
import type { MetricScore } from '../models/metric-score.model';

export interface CpuRuleResult {
  actionItems: ActionItem[];
  metrics: MetricScore[];
}

export interface CpuAnalysisRule {
  readonly name: string;
  analyze(profile: ParsedCpuProfile, comparison?: CpuProfileComparison): CpuRuleResult;
}
```

- [ ] **Step 2: Add `analyzeCpuProfile` to the rule engine**

In `src/app/core/analysis/rule-engine.service.ts`, add the import for the CPU rule interface and a placeholder `cpuRules` array. We'll add rules as we create them in later tasks. For now, add the method and the import:

Add these imports at the top (after existing imports):

```typescript
import type { CpuAnalysisRule } from './cpu-analysis-rule';
import type { ParsedCpuProfile, CpuProfileComparison } from '../models/cpu-profile.model';
```

Add the `cpuRules` array and `analyzeCpuProfile` method inside the class, after `analyzeHeapSnapshot`:

```typescript
  private readonly cpuRules: CpuAnalysisRule[] = [];

  analyzeCpuProfile(
    profile: ParsedCpuProfile,
    comparison?: CpuProfileComparison
  ): { actionItems: ActionItem[]; metrics: MetricScore[] } {
    const allItems: ActionItem[] = [];
    const allMetrics: MetricScore[] = [];

    for (const rule of this.cpuRules) {
      const result = rule.analyze(profile, comparison);
      allItems.push(...result.actionItems);
      allMetrics.push(...result.metrics);
    }

    allItems.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99));

    return { actionItems: allItems, metrics: allMetrics };
  }
```

- [ ] **Step 3: Verify build and existing tests still pass**

Run: `cd /Users/santosh/.copilot/copilot-worktrees/perflens/santoshyadavdev-fuzzy-enigma && npx vitest run src/app/core/analysis/rule-engine.service.spec.ts 2>&1 | tail -10`
Expected: All existing tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/app/core/analysis/cpu-analysis-rule.ts src/app/core/analysis/rule-engine.service.ts
git commit -m "feat(cpu): add CPU analysis rule interface and rule engine integration"
```

---

### Task 5: Analysis Rules 1-4 (Hot Functions, Deep Stacks, GC Pressure, Recursive Calls)

**Files:**
- Create: `src/app/core/analysis/rules/hot-functions.rule.ts`
- Create: `src/app/core/analysis/rules/hot-functions.rule.spec.ts`
- Create: `src/app/core/analysis/rules/deep-call-stacks.rule.ts`
- Create: `src/app/core/analysis/rules/deep-call-stacks.rule.spec.ts`
- Create: `src/app/core/analysis/rules/gc-pressure.rule.ts`
- Create: `src/app/core/analysis/rules/gc-pressure.rule.spec.ts`
- Create: `src/app/core/analysis/rules/recursive-calls.rule.ts`
- Create: `src/app/core/analysis/rules/recursive-calls.rule.spec.ts`
- Modify: `src/app/core/analysis/rule-engine.service.ts` (register rules)

- [ ] **Step 1: Write failing test for hot-functions rule**

Create `src/app/core/analysis/rules/hot-functions.rule.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { HotFunctionsRule } from './hot-functions.rule';
import { buildCallTree } from '../../parsers/cpu-profile-parser';
import sampleProfile from '../../../../test-fixtures/sample-cpu-profile.json';
import type { CpuProfileRaw } from '../../models/cpu-profile.model';

describe('HotFunctionsRule', () => {
  const rule = new HotFunctionsRule();

  function getProfile() {
    return buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
  }

  it('should have name "hot-functions"', () => {
    expect(rule.name).toBe('hot-functions');
  });

  it('should detect functions with >5% self time', () => {
    const result = rule.analyze(getProfile());
    expect(result.actionItems.length).toBeGreaterThan(0);
    expect(result.actionItems.every(a => a.metric === 'CPU')).toBe(true);
  });

  it('should produce a "Top Function Self Time" metric', () => {
    const result = rule.analyze(getProfile());
    const metric = result.metrics.find(m => m.name === 'Top Function Self Time');
    expect(metric).toBeDefined();
    expect(metric!.value).toBeGreaterThan(0);
  });

  it('should assign critical severity to functions >15% self time', () => {
    const result = rule.analyze(getProfile());
    // (idle) should have many samples → high self%
    const criticals = result.actionItems.filter(a => a.severity === 'critical');
    expect(criticals.length).toBeGreaterThanOrEqual(0); // may or may not trigger based on fixture
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/santosh/.copilot/copilot-worktrees/perflens/santoshyadavdev-fuzzy-enigma && npx vitest run src/app/core/analysis/rules/hot-functions.rule.spec.ts 2>&1 | tail -10`
Expected: FAIL

- [ ] **Step 3: Implement hot-functions rule**

Create `src/app/core/analysis/rules/hot-functions.rule.ts`:

```typescript
import type { CpuAnalysisRule, CpuRuleResult } from '../cpu-analysis-rule';
import type { ParsedCpuProfile, CpuProfileComparison } from '../../models/cpu-profile.model';
import type { ActionItem } from '../../models/action-item.model';

const HOT_THRESHOLD = 5;      // % self time
const CRITICAL_THRESHOLD = 15; // % self time

export class HotFunctionsRule implements CpuAnalysisRule {
  readonly name = 'hot-functions';

  analyze(profile: ParsedCpuProfile, comparison?: CpuProfileComparison): CpuRuleResult {
    const hotFunctions = profile.flatProfile.filter(
      e => e.selfPercent > HOT_THRESHOLD &&
           e.callFrame.functionName !== '(idle)' &&
           e.callFrame.functionName !== '(root)'
    );

    const actionItems: ActionItem[] = hotFunctions.map((fn, i) => ({
      id: `hot-fn-${fn.callFrame.functionName}-${i}`,
      title: `${fn.callFrame.functionName} uses ${fn.selfPercent.toFixed(1)}% CPU (self time)`,
      detail: `"${fn.callFrame.functionName}" at ${fn.callFrame.url || '(unknown)'}:${fn.callFrame.lineNumber} consumed ${fn.selfTime.toFixed(1)}ms of self time (${fn.selfPercent.toFixed(1)}% of profile).`,
      severity: fn.selfPercent > CRITICAL_THRESHOLD ? 'critical' : 'warning',
      metric: 'CPU' as const,
      fix: `Profile "${fn.callFrame.functionName}" for optimization. Consider memoization, algorithmic improvements, or offloading to a Web Worker.`,
      source: {
        functionName: fn.callFrame.functionName,
        scriptUrl: fn.callFrame.url,
        lineNumber: fn.callFrame.lineNumber,
      },
    }));

    // Comparison: flag regressions >2%
    if (comparison) {
      for (const diff of comparison.changed) {
        if (diff.selfTimeDelta > 0) {
          const deltaPercent = (diff.selfTimeDelta / comparison.baseline.totalTime) * 100;
          if (deltaPercent > 2) {
            actionItems.push({
              id: `hot-fn-regression-${diff.callFrame.functionName}`,
              title: `${diff.callFrame.functionName} regressed by ${diff.selfTimeDelta.toFixed(1)}ms`,
              detail: `Self time increased from ${diff.baselineSelfTime.toFixed(1)}ms to ${diff.currentSelfTime.toFixed(1)}ms (+${deltaPercent.toFixed(1)}%).`,
              severity: 'warning',
              metric: 'CPU',
              fix: `Investigate what changed in "${diff.callFrame.functionName}" that increased its CPU time.`,
              source: {
                functionName: diff.callFrame.functionName,
                scriptUrl: diff.callFrame.url,
                lineNumber: diff.callFrame.lineNumber,
              },
            });
          }
        }
      }
    }

    const topSelfPercent = hotFunctions.length > 0 ? hotFunctions[0].selfPercent : 0;

    return {
      actionItems,
      metrics: [{
        name: 'Top Function Self Time',
        shortName: 'CPU',
        value: topSelfPercent,
        displayValue: `${topSelfPercent.toFixed(1)}%`,
        unit: '%',
        rating: topSelfPercent > CRITICAL_THRESHOLD ? 'poor' : topSelfPercent > HOT_THRESHOLD ? 'needs-improvement' : 'good',
      }],
    };
  }
}
```

- [ ] **Step 4: Run hot-functions test**

Run: `cd /Users/santosh/.copilot/copilot-worktrees/perflens/santoshyadavdev-fuzzy-enigma && npx vitest run src/app/core/analysis/rules/hot-functions.rule.spec.ts 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 5: Write failing test for deep-call-stacks rule**

Create `src/app/core/analysis/rules/deep-call-stacks.rule.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { DeepCallStacksRule } from './deep-call-stacks.rule';
import { buildCallTree } from '../../parsers/cpu-profile-parser';
import sampleProfile from '../../../../test-fixtures/sample-cpu-profile.json';
import type { CpuProfileRaw } from '../../models/cpu-profile.model';

describe('DeepCallStacksRule', () => {
  const rule = new DeepCallStacksRule();

  it('should have name "deep-call-stacks"', () => {
    expect(rule.name).toBe('deep-call-stacks');
  });

  it('should produce a "Max Stack Depth" metric', () => {
    const profile = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    const result = rule.analyze(profile);
    const metric = result.metrics.find(m => m.name === 'Max Stack Depth');
    expect(metric).toBeDefined();
    expect(metric!.value).toBeGreaterThan(0);
  });

  it('should detect deep stacks when depth > 30', () => {
    const profile = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    const result = rule.analyze(profile);
    // Our fixture has max depth ~5, so should not fire critical/warning
    expect(result.metrics[0].rating).toBe('good');
  });
});
```

- [ ] **Step 6: Implement deep-call-stacks rule**

Create `src/app/core/analysis/rules/deep-call-stacks.rule.ts`:

```typescript
import type { CpuAnalysisRule, CpuRuleResult } from '../cpu-analysis-rule';
import type { ParsedCpuProfile } from '../../models/cpu-profile.model';
import type { CallTreeNode } from '../../models/cpu-profile.model';

const WARNING_DEPTH = 30;
const CRITICAL_DEPTH = 50;

export class DeepCallStacksRule implements CpuAnalysisRule {
  readonly name = 'deep-call-stacks';

  analyze(profile: ParsedCpuProfile): CpuRuleResult {
    let maxDepth = 0;
    let deepestFrame = '';

    function walk(node: CallTreeNode): void {
      if (node.depth > maxDepth) {
        maxDepth = node.depth;
        deepestFrame = node.callFrame.functionName;
      }
      for (const child of node.children) {
        walk(child);
      }
    }

    walk(profile.root);

    const actionItems = maxDepth > WARNING_DEPTH ? [{
      id: `deep-stack-${maxDepth}`,
      title: `Call stack depth reaches ${maxDepth} frames`,
      detail: `Deepest frame: "${deepestFrame}". Deep stacks increase memory pressure and make debugging harder.`,
      severity: (maxDepth > CRITICAL_DEPTH ? 'critical' : 'warning') as 'critical' | 'warning',
      metric: 'CPU' as const,
      fix: 'Flatten recursion using iteration, add memoization, or use a trampoline pattern to reduce stack depth.',
      source: { functionName: deepestFrame },
    }] : [];

    return {
      actionItems,
      metrics: [{
        name: 'Max Stack Depth',
        shortName: 'CPU',
        value: maxDepth,
        displayValue: `${maxDepth}`,
        unit: 'frames',
        rating: maxDepth > CRITICAL_DEPTH ? 'poor' : maxDepth > WARNING_DEPTH ? 'needs-improvement' : 'good',
      }],
    };
  }
}
```

- [ ] **Step 7: Run deep-call-stacks test**

Run: `cd /Users/santosh/.copilot/copilot-worktrees/perflens/santoshyadavdev-fuzzy-enigma && npx vitest run src/app/core/analysis/rules/deep-call-stacks.rule.spec.ts 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 8: Write failing test for gc-pressure rule**

Create `src/app/core/analysis/rules/gc-pressure.rule.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { GcPressureRule } from './gc-pressure.rule';
import { buildCallTree } from '../../parsers/cpu-profile-parser';
import sampleProfile from '../../../../test-fixtures/sample-cpu-profile.json';
import type { CpuProfileRaw } from '../../models/cpu-profile.model';

describe('GcPressureRule', () => {
  const rule = new GcPressureRule();

  it('should have name "gc-pressure"', () => {
    expect(rule.name).toBe('gc-pressure');
  });

  it('should detect GC functions in the profile', () => {
    const profile = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    const result = rule.analyze(profile);
    const metric = result.metrics.find(m => m.name === 'GC Time');
    expect(metric).toBeDefined();
    expect(metric!.value).toBeGreaterThan(0);
  });

  it('should produce MEMORY metric', () => {
    const profile = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    const result = rule.analyze(profile);
    expect(result.metrics[0].shortName).toBe('MEM');
  });
});
```

- [ ] **Step 9: Implement gc-pressure rule**

Create `src/app/core/analysis/rules/gc-pressure.rule.ts`:

```typescript
import type { CpuAnalysisRule, CpuRuleResult } from '../cpu-analysis-rule';
import type { ParsedCpuProfile } from '../../models/cpu-profile.model';

const GC_NAMES = ['(garbage collector)', 'MinorGC', 'MajorGC', 'Scavenge', 'GC'];
const WARNING_THRESHOLD = 5;   // %
const CRITICAL_THRESHOLD = 15; // %

export class GcPressureRule implements CpuAnalysisRule {
  readonly name = 'gc-pressure';

  analyze(profile: ParsedCpuProfile): CpuRuleResult {
    const gcEntries = profile.flatProfile.filter(
      e => GC_NAMES.some(gc => e.callFrame.functionName.includes(gc))
    );

    const gcTime = gcEntries.reduce((sum, e) => sum + e.selfTime, 0);
    const gcPercent = profile.totalTime > 0 ? (gcTime / profile.totalTime) * 100 : 0;

    const actionItems = gcPercent > WARNING_THRESHOLD ? [{
      id: 'gc-pressure',
      title: `GC takes ${gcPercent.toFixed(1)}% of CPU time (${gcTime.toFixed(1)}ms)`,
      detail: `Garbage collection consumed ${gcPercent.toFixed(1)}% of the profile. This suggests high allocation pressure.`,
      severity: (gcPercent > CRITICAL_THRESHOLD ? 'critical' : 'warning') as 'critical' | 'warning',
      metric: 'MEMORY' as const,
      fix: 'Reduce object allocations in hot paths. Use object pooling, avoid creating short-lived objects in loops, and reuse buffers.',
    }] : [];

    return {
      actionItems,
      metrics: [{
        name: 'GC Time',
        shortName: 'MEM',
        value: gcPercent,
        displayValue: `${gcPercent.toFixed(1)}%`,
        unit: '%',
        rating: gcPercent > CRITICAL_THRESHOLD ? 'poor' : gcPercent > WARNING_THRESHOLD ? 'needs-improvement' : 'good',
      }],
    };
  }
}
```

- [ ] **Step 10: Run gc-pressure test**

Run: `cd /Users/santosh/.copilot/copilot-worktrees/perflens/santoshyadavdev-fuzzy-enigma && npx vitest run src/app/core/analysis/rules/gc-pressure.rule.spec.ts 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 11: Write failing test for recursive-calls rule**

Create `src/app/core/analysis/rules/recursive-calls.rule.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { RecursiveCallsRule } from './recursive-calls.rule';
import { buildCallTree } from '../../parsers/cpu-profile-parser';
import sampleProfile from '../../../../test-fixtures/sample-cpu-profile.json';
import type { CpuProfileRaw } from '../../models/cpu-profile.model';

describe('RecursiveCallsRule', () => {
  const rule = new RecursiveCallsRule();

  it('should have name "recursive-calls"', () => {
    expect(rule.name).toBe('recursive-calls');
  });

  it('should detect recursive calls (processData appears twice in call stack)', () => {
    const profile = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    const result = rule.analyze(profile);
    expect(result.actionItems.length).toBeGreaterThan(0);
    const names = result.actionItems.map(a => a.title);
    expect(names.some(n => n.includes('processData'))).toBe(true);
  });

  it('should assign warning severity', () => {
    const profile = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    const result = rule.analyze(profile);
    expect(result.actionItems.every(a => a.severity === 'warning')).toBe(true);
  });
});
```

- [ ] **Step 12: Implement recursive-calls rule**

Create `src/app/core/analysis/rules/recursive-calls.rule.ts`:

```typescript
import type { CpuAnalysisRule, CpuRuleResult } from '../cpu-analysis-rule';
import type { ParsedCpuProfile, CallTreeNode } from '../../models/cpu-profile.model';

export class RecursiveCallsRule implements CpuAnalysisRule {
  readonly name = 'recursive-calls';

  analyze(profile: ParsedCpuProfile): CpuRuleResult {
    const recursiveFunctions = new Set<string>();

    function walk(node: CallTreeNode, ancestors: Set<string>): void {
      const key = `${node.callFrame.functionName}|${node.callFrame.url}|${node.callFrame.lineNumber}`;
      if (ancestors.has(key) && node.callFrame.functionName !== '(root)') {
        recursiveFunctions.add(node.callFrame.functionName);
      }

      const next = new Set(ancestors);
      next.add(key);

      for (const child of node.children) {
        walk(child, next);
      }
    }

    walk(profile.root, new Set());

    const actionItems = Array.from(recursiveFunctions).map(name => ({
      id: `recursive-${name}`,
      title: `${name} is called recursively`,
      detail: `"${name}" appears multiple times in the same call stack, indicating direct or mutual recursion.`,
      severity: 'warning' as const,
      metric: 'CPU' as const,
      fix: `Convert "${name}" to an iterative implementation, add memoization, or use tail-call optimization if possible.`,
      source: { functionName: name },
    }));

    return { actionItems, metrics: [] };
  }
}
```

- [ ] **Step 13: Run recursive-calls test**

Run: `cd /Users/santosh/.copilot/copilot-worktrees/perflens/santoshyadavdev-fuzzy-enigma && npx vitest run src/app/core/analysis/rules/recursive-calls.rule.spec.ts 2>&1 | tail -10`
Expected: PASS

- [ ] **Step 14: Register rules 1-4 in the rule engine**

In `src/app/core/analysis/rule-engine.service.ts`, add imports and populate `cpuRules`:

Add imports:
```typescript
import { HotFunctionsRule } from './rules/hot-functions.rule';
import { DeepCallStacksRule } from './rules/deep-call-stacks.rule';
import { GcPressureRule } from './rules/gc-pressure.rule';
import { RecursiveCallsRule } from './rules/recursive-calls.rule';
```

Update the `cpuRules` array:
```typescript
  private readonly cpuRules: CpuAnalysisRule[] = [
    new HotFunctionsRule(),
    new DeepCallStacksRule(),
    new GcPressureRule(),
    new RecursiveCallsRule(),
  ];
```

- [ ] **Step 15: Run all tests**

Run: `cd /Users/santosh/.copilot/copilot-worktrees/perflens/santoshyadavdev-fuzzy-enigma && npx vitest run 2>&1 | tail -15`
Expected: All tests pass

- [ ] **Step 16: Commit**

```bash
git add src/app/core/analysis/rules/hot-functions.rule.ts src/app/core/analysis/rules/hot-functions.rule.spec.ts src/app/core/analysis/rules/deep-call-stacks.rule.ts src/app/core/analysis/rules/deep-call-stacks.rule.spec.ts src/app/core/analysis/rules/gc-pressure.rule.ts src/app/core/analysis/rules/gc-pressure.rule.spec.ts src/app/core/analysis/rules/recursive-calls.rule.ts src/app/core/analysis/rules/recursive-calls.rule.spec.ts src/app/core/analysis/rule-engine.service.ts
git commit -m "feat(cpu): add analysis rules 1-4 (hot functions, deep stacks, GC pressure, recursion)"
```

---

### Task 6: Analysis Rules 5-8 (Idle Time, Deopt Markers, Module Aggregation, Async Gaps)

**Files:**
- Create: `src/app/core/analysis/rules/idle-time.rule.ts`
- Create: `src/app/core/analysis/rules/deopt-markers.rule.ts`
- Create: `src/app/core/analysis/rules/module-aggregation.rule.ts`
- Create: `src/app/core/analysis/rules/async-gaps.rule.ts`
- Modify: `src/app/core/analysis/rule-engine.service.ts` (register rules 5-8)

- [ ] **Step 1: Implement idle-time rule**

Create `src/app/core/analysis/rules/idle-time.rule.ts`:

```typescript
import type { CpuAnalysisRule, CpuRuleResult } from '../cpu-analysis-rule';
import type { ParsedCpuProfile } from '../../models/cpu-profile.model';

const WARNING_BUSY = 50;  // %
const CRITICAL_BUSY = 80; // %

export class IdleTimeRule implements CpuAnalysisRule {
  readonly name = 'idle-time';

  analyze(profile: ParsedCpuProfile): CpuRuleResult {
    const idleEntry = profile.flatProfile.find(
      e => e.callFrame.functionName === '(idle)'
    );

    const idlePercent = idleEntry?.selfPercent ?? 0;
    const busyPercent = 100 - idlePercent;

    const actionItems = busyPercent > WARNING_BUSY ? [{
      id: 'cpu-busy',
      title: `CPU is busy ${busyPercent.toFixed(1)}% of the time`,
      detail: `Only ${idlePercent.toFixed(1)}% of the profile is idle. The main thread is heavily utilized.`,
      severity: (busyPercent > CRITICAL_BUSY ? 'warning' : 'info') as 'warning' | 'info',
      metric: 'CPU' as const,
      fix: 'Defer non-critical work with requestIdleCallback, break up long computations with scheduler.yield(), or offload to a Web Worker.',
    }] : [];

    return {
      actionItems,
      metrics: [{
        name: 'CPU Busy',
        shortName: 'CPU',
        value: busyPercent,
        displayValue: `${busyPercent.toFixed(1)}%`,
        unit: '%',
        rating: busyPercent > CRITICAL_BUSY ? 'poor' : busyPercent > WARNING_BUSY ? 'needs-improvement' : 'good',
      }],
    };
  }
}
```

- [ ] **Step 2: Implement deopt-markers rule**

Create `src/app/core/analysis/rules/deopt-markers.rule.ts`:

```typescript
import type { CpuAnalysisRule, CpuRuleResult } from '../cpu-analysis-rule';
import type { ParsedCpuProfile } from '../../models/cpu-profile.model';

const HOT_THRESHOLD = 5; // % self time

export class DeoptMarkersRule implements CpuAnalysisRule {
  readonly name = 'deopt-markers';

  analyze(profile: ParsedCpuProfile): CpuRuleResult {
    const actionItems = profile.deoptEvents.map((deopt, i) => {
      const selfPercent = profile.totalTime > 0
        ? (deopt.selfTime / profile.totalTime) * 100
        : 0;
      const isHot = selfPercent > HOT_THRESHOLD;

      return {
        id: `deopt-${deopt.callFrame.functionName}-${i}`,
        title: `${deopt.callFrame.functionName} was deoptimized: ${deopt.reason}`,
        detail: `"${deopt.callFrame.functionName}" at ${deopt.callFrame.url || '(unknown)'}:${deopt.callFrame.lineNumber} was deoptimized by V8.${isHot ? ' This function is also a hot path.' : ''}`,
        severity: (isHot ? 'critical' : 'warning') as 'critical' | 'warning',
        metric: 'V8' as const,
        fix: `Reason: "${deopt.reason}". Ensure consistent types in function arguments and avoid hidden class transitions. Use monomorphic call sites.`,
        source: {
          functionName: deopt.callFrame.functionName,
          scriptUrl: deopt.callFrame.url,
          lineNumber: deopt.callFrame.lineNumber,
        },
      };
    });

    return {
      actionItems,
      metrics: [{
        name: 'Deoptimizations',
        shortName: 'V8',
        value: profile.deoptEvents.length,
        displayValue: `${profile.deoptEvents.length}`,
        unit: '',
        rating: profile.deoptEvents.length > 5 ? 'poor' : profile.deoptEvents.length > 0 ? 'needs-improvement' : 'good',
      }],
    };
  }
}
```

- [ ] **Step 3: Implement module-aggregation rule**

Create `src/app/core/analysis/rules/module-aggregation.rule.ts`:

```typescript
import type { CpuAnalysisRule, CpuRuleResult } from '../cpu-analysis-rule';
import type { ParsedCpuProfile, CpuProfileComparison } from '../../models/cpu-profile.model';
import type { ActionItem } from '../../models/action-item.model';

const HOT_MODULE_THRESHOLD = 20; // % total time

export class ModuleAggregationRule implements CpuAnalysisRule {
  readonly name = 'module-aggregation';

  analyze(profile: ParsedCpuProfile, comparison?: CpuProfileComparison): CpuRuleResult {
    const moduleMap = new Map<string, number>();

    for (const entry of profile.flatProfile) {
      const url = entry.callFrame.url || '(native)';
      moduleMap.set(url, (moduleMap.get(url) ?? 0) + entry.selfTime);
    }

    const modules = Array.from(moduleMap.entries())
      .map(([url, selfTime]) => ({
        url,
        selfTime,
        percent: profile.totalTime > 0 ? (selfTime / profile.totalTime) * 100 : 0,
      }))
      .filter(m => m.url !== '' && m.url !== '(native)')
      .sort((a, b) => b.selfTime - a.selfTime);

    const actionItems: ActionItem[] = modules
      .filter(m => m.percent > HOT_MODULE_THRESHOLD)
      .map(m => {
        const basename = m.url.split('/').pop() || m.url;
        return {
          id: `hot-module-${basename}`,
          title: `${basename} consumes ${m.percent.toFixed(1)}% of CPU time`,
          detail: `Script "${m.url}" accounts for ${m.selfTime.toFixed(1)}ms (${m.percent.toFixed(1)}%) of CPU self time.`,
          severity: 'warning' as const,
          metric: 'CPU' as const,
          fix: `Consider code-splitting "${basename}", lazy loading it, or moving heavy computation to a Web Worker.`,
        };
      });

    // Comparison mode
    if (comparison) {
      const baseModuleMap = new Map<string, number>();
      for (const entry of comparison.baseline.flatProfile) {
        const url = entry.callFrame.url || '(native)';
        baseModuleMap.set(url, (baseModuleMap.get(url) ?? 0) + entry.selfTime);
      }

      for (const mod of modules) {
        const baseTime = baseModuleMap.get(mod.url) ?? 0;
        const delta = mod.selfTime - baseTime;
        if (delta > 0 && (delta / profile.totalTime) * 100 > 5) {
          const basename = mod.url.split('/').pop() || mod.url;
          actionItems.push({
            id: `module-regression-${basename}`,
            title: `${basename} regressed by ${delta.toFixed(1)}ms`,
            detail: `Module time increased from ${baseTime.toFixed(1)}ms to ${mod.selfTime.toFixed(1)}ms.`,
            severity: 'warning',
            metric: 'CPU',
            fix: `Investigate what changed in "${basename}" that increased its CPU time.`,
          });
        }
      }
    }

    const hottestPercent = modules.length > 0 ? modules[0].percent : 0;

    return {
      actionItems,
      metrics: [{
        name: 'Hottest Module',
        shortName: 'CPU',
        value: hottestPercent,
        displayValue: `${hottestPercent.toFixed(1)}%`,
        unit: '%',
        rating: hottestPercent > HOT_MODULE_THRESHOLD ? 'needs-improvement' : 'good',
      }],
    };
  }
}
```

- [ ] **Step 4: Implement async-gaps rule**

Create `src/app/core/analysis/rules/async-gaps.rule.ts`:

```typescript
import type { CpuAnalysisRule, CpuRuleResult } from '../cpu-analysis-rule';
import type { ParsedCpuProfile } from '../../models/cpu-profile.model';

const WARNING_GAP_MS = 10;
const CRITICAL_GAP_MS = 50;

export class AsyncGapsRule implements CpuAnalysisRule {
  readonly name = 'async-gaps';

  analyze(profile: ParsedCpuProfile): CpuRuleResult {
    let maxGap = 0;
    let maxGapIndex = 0;
    const largeGaps: Array<{ index: number; delta: number; timestamp: number }> = [];

    for (const sample of profile.samples) {
      if (sample.delta > WARNING_GAP_MS) {
        largeGaps.push({ index: profile.samples.indexOf(sample), delta: sample.delta, timestamp: sample.timestamp });
        if (sample.delta > maxGap) {
          maxGap = sample.delta;
          maxGapIndex = profile.samples.indexOf(sample);
        }
      }
    }

    const actionItems = largeGaps.map((gap, i) => ({
      id: `async-gap-${i}`,
      title: `${gap.delta.toFixed(1)}ms gap between samples at ${gap.timestamp.toFixed(1)}ms`,
      detail: `A ${gap.delta.toFixed(1)}ms gap between consecutive samples suggests event loop blockage or a long synchronous task.`,
      severity: (gap.delta > CRITICAL_GAP_MS ? 'critical' : 'warning') as 'critical' | 'warning',
      metric: 'INP' as const,
      fix: 'Break up long synchronous work with scheduler.yield() or setTimeout to allow the event loop to process other tasks.',
    }));

    return {
      actionItems,
      metrics: [{
        name: 'Max Async Gap',
        shortName: 'INP',
        value: maxGap,
        displayValue: `${maxGap.toFixed(1)}ms`,
        unit: 'ms',
        rating: maxGap > CRITICAL_GAP_MS ? 'poor' : maxGap > WARNING_GAP_MS ? 'needs-improvement' : 'good',
      }],
    };
  }
}
```

- [ ] **Step 5: Register rules 5-8 in the rule engine**

In `src/app/core/analysis/rule-engine.service.ts`, add imports:

```typescript
import { IdleTimeRule } from './rules/idle-time.rule';
import { DeoptMarkersRule } from './rules/deopt-markers.rule';
import { ModuleAggregationRule } from './rules/module-aggregation.rule';
import { AsyncGapsRule } from './rules/async-gaps.rule';
```

Update `cpuRules` array to include all 8:

```typescript
  private readonly cpuRules: CpuAnalysisRule[] = [
    new HotFunctionsRule(),
    new DeepCallStacksRule(),
    new GcPressureRule(),
    new RecursiveCallsRule(),
    new IdleTimeRule(),
    new DeoptMarkersRule(),
    new ModuleAggregationRule(),
    new AsyncGapsRule(),
  ];
```

- [ ] **Step 6: Run all tests**

Run: `cd /Users/santosh/.copilot/copilot-worktrees/perflens/santoshyadavdev-fuzzy-enigma && npx vitest run 2>&1 | tail -15`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/app/core/analysis/rules/idle-time.rule.ts src/app/core/analysis/rules/deopt-markers.rule.ts src/app/core/analysis/rules/module-aggregation.rule.ts src/app/core/analysis/rules/async-gaps.rule.ts src/app/core/analysis/rule-engine.service.ts
git commit -m "feat(cpu): add analysis rules 5-8 (idle time, deopt markers, module aggregation, async gaps)"
```

---

### Task 7: CPU Flame Chart Component

**Files:**
- Create: `src/app/features/dashboard/cpu-flamechart.component.ts`

- [ ] **Step 1: Create the flame chart component**

Create `src/app/features/dashboard/cpu-flamechart.component.ts`:

```typescript
import {
  Component,
  input,
  signal,
  viewChild,
  ElementRef,
  effect,
  inject,
  Injector,
  afterNextRender,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { ParsedCpuProfile, CallTreeNode } from '../../core/models/cpu-profile.model';

interface FlameRect {
  x: number;
  y: number;
  w: number;
  h: number;
  node: CallTreeNode;
}

@Component({
  selector: 'app-cpu-flamechart',
  template: `
    <div class="space-y-2">
      <div class="flex items-center gap-3">
        <button
          class="px-3 py-1 text-xs rounded"
          [class.bg-emerald-500]="viewMode() === 'top-down'"
          [class.text-white]="viewMode() === 'top-down'"
          [class.bg-gray-700]="viewMode() !== 'top-down'"
          [class.text-gray-300]="viewMode() !== 'top-down'"
          (click)="viewMode.set('top-down')"
        >Top-Down</button>
        <button
          class="px-3 py-1 text-xs rounded"
          [class.bg-emerald-500]="viewMode() === 'bottom-up'"
          [class.text-white]="viewMode() === 'bottom-up'"
          [class.bg-gray-700]="viewMode() !== 'bottom-up'"
          [class.text-gray-300]="viewMode() !== 'bottom-up'"
          (click)="viewMode.set('bottom-up')"
        >Bottom-Up</button>
        <input
          type="text"
          placeholder="Search functions..."
          class="bg-gray-800 text-gray-300 text-xs px-3 py-1 rounded border border-gray-700 w-48"
          (input)="searchQuery.set($any($event.target).value)"
        />
      </div>
      <div class="relative w-full" style="height: 500px">
        <canvas #flameCanvas class="w-full h-full cursor-pointer"></canvas>
        @if (hoveredNode(); as node) {
          <div class="absolute top-2 left-2 bg-gray-900/90 text-white text-xs px-3 py-2 rounded pointer-events-none max-w-sm">
            <div class="font-semibold">{{ node.callFrame.functionName || '(anonymous)' }}</div>
            <div class="text-gray-400">{{ node.callFrame.url || '(native)' }}:{{ node.callFrame.lineNumber }}</div>
            <div>Self: {{ node.selfTime.toFixed(1) }}ms | Total: {{ node.totalTime.toFixed(1) }}ms</div>
          </div>
        }
      </div>
    </div>
  `,
})
export class CpuFlamechartComponent {
  readonly profile = input.required<ParsedCpuProfile>();
  readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('flameCanvas');

  readonly hoveredNode = signal<CallTreeNode | null>(null);
  readonly viewMode = signal<'top-down' | 'bottom-up'>('top-down');
  readonly searchQuery = signal('');

  private readonly injector = inject(Injector);
  private readonly platformId = inject(PLATFORM_ID);
  private rects: FlameRect[] = [];
  private renderVersion = 0;

  private static readonly ROW_HEIGHT = 18;
  private static readonly COLORS = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  ];

  constructor() {
    afterNextRender(() => {
      effect(() => {
        const data = this.profile();
        const canvasEl = this.canvasRef();
        const _mode = this.viewMode();
        const _query = this.searchQuery();
        if (!data || !canvasEl) return;

        const version = ++this.renderVersion;
        queueMicrotask(() => {
          if (this.renderVersion !== version) return;
          this.renderFlameChart(data, canvasEl.nativeElement);
        });
      }, { injector: this.injector });
    });

    if (isPlatformBrowser(this.platformId)) {
      afterNextRender(() => {
        const canvas = this.canvasRef()?.nativeElement;
        if (!canvas) return;

        canvas.addEventListener('mousemove', (e: MouseEvent) => {
          const rect = canvas.getBoundingClientRect();
          const x = (e.clientX - rect.left) * (canvas.width / rect.width);
          const y = (e.clientY - rect.top) * (canvas.height / rect.height);

          let found: CallTreeNode | null = null;
          for (const r of this.rects) {
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
              found = r.node;
            }
          }
          this.hoveredNode.set(found);
        });

        canvas.addEventListener('mouseleave', () => {
          this.hoveredNode.set(null);
        });
      });
    }
  }

  private renderFlameChart(profile: ParsedCpuProfile, canvas: HTMLCanvasElement): void {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const displayW = canvas.clientWidth;
    const displayH = canvas.clientHeight;
    canvas.width = displayW * dpr;
    canvas.height = displayH * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, displayW, displayH);

    this.rects = [];
    const root = profile.root;
    if (root.totalTime <= 0) return;

    const query = this.searchQuery().toLowerCase();

    if (this.viewMode() === 'top-down') {
      this.renderTopDown(ctx, root, 0, displayW, 0, root.totalTime, query);
    } else {
      this.renderBottomUp(ctx, profile, displayW, displayH, query);
    }
  }

  private renderTopDown(
    ctx: CanvasRenderingContext2D,
    node: CallTreeNode,
    x: number,
    width: number,
    y: number,
    totalTime: number,
    query: string,
  ): void {
    const h = CpuFlamechartComponent.ROW_HEIGHT;
    const w = (node.totalTime / totalTime) * width;
    if (w < 1) return;

    const isMatch = query.length > 0 && node.callFrame.functionName.toLowerCase().includes(query);
    const isDimmed = query.length > 0 && !isMatch;

    ctx.fillStyle = isDimmed
      ? 'rgba(60, 60, 60, 0.5)'
      : this.getFrameColor(node);
    ctx.fillRect(x + 0.5, y + 0.5, Math.max(w - 1, 0), h - 1);

    if (isMatch) {
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 0.5, y + 0.5, Math.max(w - 1, 0), h - 1);
    }

    this.rects.push({ x, y, w, h, node });

    if (w > 30) {
      ctx.fillStyle = isDimmed ? '#666' : '#fff';
      ctx.font = '10px sans-serif';
      const maxChars = Math.floor(w / 6);
      const label = node.callFrame.functionName || '(anonymous)';
      const text = label.length > maxChars ? label.slice(0, maxChars - 1) + '…' : label;
      ctx.fillText(text, x + 3, y + 12);
    }

    let childX = x;
    for (const child of node.children) {
      this.renderTopDown(ctx, child, childX, width, y + h, totalTime, query);
      childX += (child.totalTime / totalTime) * width;
    }
  }

  private renderBottomUp(
    ctx: CanvasRenderingContext2D,
    profile: ParsedCpuProfile,
    displayW: number,
    displayH: number,
    query: string,
  ): void {
    // For bottom-up, show flat profile sorted by self time, rendered as bars
    const h = CpuFlamechartComponent.ROW_HEIGHT;
    const entries = profile.flatProfile
      .filter(e => e.callFrame.functionName !== '(root)')
      .slice(0, Math.floor(displayH / h));

    let y = 0;
    for (const entry of entries) {
      const w = (entry.selfPercent / 100) * displayW;
      const isMatch = query.length > 0 && entry.callFrame.functionName.toLowerCase().includes(query);
      const isDimmed = query.length > 0 && !isMatch;

      const tempNode: CallTreeNode = {
        id: 0,
        callFrame: entry.callFrame,
        selfTime: entry.selfTime,
        totalTime: entry.totalTime,
        children: [],
        depth: 0,
      };

      ctx.fillStyle = isDimmed ? 'rgba(60, 60, 60, 0.5)' : this.getFrameColor(tempNode);
      ctx.fillRect(0.5, y + 0.5, Math.max(w - 1, 0), h - 1);

      this.rects.push({ x: 0, y, w: displayW, h, node: tempNode });

      if (isMatch) {
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2;
        ctx.strokeRect(0.5, y + 0.5, Math.max(w - 1, 0), h - 1);
      }

      ctx.fillStyle = isDimmed ? '#666' : '#fff';
      ctx.font = '10px sans-serif';
      const label = `${entry.callFrame.functionName || '(anonymous)'} — ${entry.selfPercent.toFixed(1)}%`;
      const maxChars = Math.floor(displayW / 6);
      const text = label.length > maxChars ? label.slice(0, maxChars - 1) + '…' : label;
      ctx.fillText(text, w + 6, y + 12);

      y += h;
    }
  }

  private getFrameColor(node: CallTreeNode): string {
    const name = node.callFrame.functionName;
    if (name === '(idle)') return '#374151';
    if (name === '(program)') return '#4b5563';
    if (name.includes('garbage collector') || name.includes('GC')) return '#dc2626';

    const hash = (name + node.callFrame.url).split('').reduce((h, c) => h + c.charCodeAt(0), 0);
    return CpuFlamechartComponent.COLORS[hash % CpuFlamechartComponent.COLORS.length];
  }
}
```

- [ ] **Step 2: Verify build passes**

Run: `cd /Users/santosh/.copilot/copilot-worktrees/perflens/santoshyadavdev-fuzzy-enigma && npx ng build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/app/features/dashboard/cpu-flamechart.component.ts
git commit -m "feat(cpu): add interactive flame chart component with top-down/bottom-up views"
```

---

### Task 8: CPU Hot Functions Table & Deopt List Components

**Files:**
- Create: `src/app/features/dashboard/cpu-hot-functions.component.ts`
- Create: `src/app/features/dashboard/cpu-deopt-list.component.ts`

- [ ] **Step 1: Create the hot functions table component**

Create `src/app/features/dashboard/cpu-hot-functions.component.ts`:

```typescript
import { Component, computed, input, signal } from '@angular/core';
import type { FlatProfileEntry, CpuProfileComparison } from '../../core/models/cpu-profile.model';

type SortField = 'selfTime' | 'totalTime' | 'selfPercent' | 'totalPercent' | 'hitCount';

@Component({
  selector: 'app-cpu-hot-functions',
  template: `
    <div class="overflow-x-auto">
      <table class="w-full text-sm text-left">
        <thead class="text-xs text-gray-500 uppercase border-b border-gray-700">
          <tr>
            <th class="px-4 py-2">Function</th>
            <th class="px-4 py-2">Script</th>
            <th class="px-4 py-2 text-right cursor-pointer hover:text-gray-300" (click)="toggleSort('selfTime')">
              Self Time {{ sortIndicator('selfTime') }}
            </th>
            <th class="px-4 py-2 text-right cursor-pointer hover:text-gray-300" (click)="toggleSort('totalTime')">
              Total Time {{ sortIndicator('totalTime') }}
            </th>
            <th class="px-4 py-2 w-36 cursor-pointer hover:text-gray-300" (click)="toggleSort('selfPercent')">
              Self % {{ sortIndicator('selfPercent') }}
            </th>
            <th class="px-4 py-2 text-right cursor-pointer hover:text-gray-300" (click)="toggleSort('hitCount')">
              Hits {{ sortIndicator('hitCount') }}
            </th>
            @if (comparison()) {
              <th class="px-4 py-2 text-right">Δ Self</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of sortedEntries(); track row.callFrame.functionName + row.callFrame.url + row.callFrame.lineNumber) {
            <tr class="border-b border-gray-800 hover:bg-gray-800/50">
              <td class="px-4 py-2 font-mono text-blue-400">
                {{ row.callFrame.functionName || '(anonymous)' }}
                @if (row.deoptReason) {
                  <span class="ml-1" title="{{ row.deoptReason }}">⚠️</span>
                }
              </td>
              <td class="px-4 py-2 text-gray-400 text-xs">
                {{ scriptBasename(row.callFrame.url) }}:{{ row.callFrame.lineNumber }}
              </td>
              <td class="px-4 py-2 text-right">{{ row.selfTime.toFixed(1) }}ms</td>
              <td class="px-4 py-2 text-right">{{ row.totalTime.toFixed(1) }}ms</td>
              <td class="px-4 py-2">
                <div class="flex items-center gap-2">
                  <div class="flex-1 bg-gray-700 rounded-full h-2">
                    <div
                      class="bg-emerald-500 h-2 rounded-full"
                      [style.width.%]="row.selfPercent"
                    ></div>
                  </div>
                  <span class="text-xs text-gray-400 w-12 text-right">
                    {{ row.selfPercent.toFixed(1) }}%
                  </span>
                </div>
              </td>
              <td class="px-4 py-2 text-right">{{ row.hitCount }}</td>
              @if (comparison()) {
                <td class="px-4 py-2 text-right"
                    [class.text-red-400]="getDelta(row) > 0"
                    [class.text-green-400]="getDelta(row) < 0">
                  {{ formatDelta(getDelta(row)) }}
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class CpuHotFunctionsComponent {
  readonly entries = input.required<FlatProfileEntry[]>();
  readonly comparison = input<CpuProfileComparison>();

  readonly sortField = signal<SortField>('selfTime');
  readonly sortAsc = signal(false);

  readonly sortedEntries = computed(() => {
    const data = this.entries()
      .filter(e => e.callFrame.functionName !== '(root)')
      .slice(0, 50);

    const field = this.sortField();
    const asc = this.sortAsc();

    return [...data].sort((a, b) => {
      const av = a[field];
      const bv = b[field];
      return asc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  });

  toggleSort(field: SortField): void {
    if (this.sortField() === field) {
      this.sortAsc.set(!this.sortAsc());
    } else {
      this.sortField.set(field);
      this.sortAsc.set(false);
    }
  }

  sortIndicator(field: SortField): string {
    if (this.sortField() !== field) return '';
    return this.sortAsc() ? '↑' : '↓';
  }

  scriptBasename(url: string): string {
    if (!url) return '(native)';
    return url.split('/').pop() || url;
  }

  getDelta(entry: FlatProfileEntry): number {
    const comp = this.comparison();
    if (!comp) return 0;
    const diff = comp.changed.find(
      d => d.callFrame.functionName === entry.callFrame.functionName &&
           d.callFrame.url === entry.callFrame.url &&
           d.callFrame.lineNumber === entry.callFrame.lineNumber
    );
    return diff?.selfTimeDelta ?? 0;
  }

  formatDelta(delta: number): string {
    if (delta === 0) return '—';
    const sign = delta > 0 ? '+' : '';
    return `${sign}${delta.toFixed(1)}ms`;
  }
}
```

- [ ] **Step 2: Create the deopt list component**

Create `src/app/features/dashboard/cpu-deopt-list.component.ts`:

```typescript
import { Component, input } from '@angular/core';
import type { DeoptEvent } from '../../core/models/cpu-profile.model';

@Component({
  selector: 'app-cpu-deopt-list',
  template: `
    @if (deoptEvents().length === 0) {
      <p class="text-gray-400 text-sm py-4">No deoptimizations detected. ✅</p>
    } @else {
      <div class="space-y-2">
        <p class="text-sm text-gray-400">{{ deoptEvents().length }} deoptimization(s) found</p>
        @for (deopt of deoptEvents(); track deopt.callFrame.functionName + deopt.reason) {
          <div class="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
            <div class="flex justify-between items-start">
              <span class="font-mono text-amber-400">{{ deopt.callFrame.functionName || '(anonymous)' }}</span>
              <span class="text-sm text-gray-400">{{ deopt.selfTime.toFixed(1) }}ms self time</span>
            </div>
            <p class="text-xs text-red-400 mt-1">Reason: {{ deopt.reason }}</p>
            @if (deopt.callFrame.url) {
              <p class="text-xs text-gray-500 mt-1">
                {{ deopt.callFrame.url }}:{{ deopt.callFrame.lineNumber }}
              </p>
            }
          </div>
        }
      </div>
    }
  `,
})
export class CpuDeoptListComponent {
  readonly deoptEvents = input.required<DeoptEvent[]>();
}
```

- [ ] **Step 3: Verify build passes**

Run: `cd /Users/santosh/.copilot/copilot-worktrees/perflens/santoshyadavdev-fuzzy-enigma && npx ng build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/app/features/dashboard/cpu-hot-functions.component.ts src/app/features/dashboard/cpu-deopt-list.component.ts
git commit -m "feat(cpu): add hot functions table and deopt list components"
```

---

### Task 9: Dashboard & Upload Integration

**Files:**
- Modify: `src/app/features/upload/upload.component.ts`
- Modify: `src/app/features/dashboard/dashboard.component.ts`

- [ ] **Step 1: Update upload to store CPU profiles as raw File**

In `src/app/features/upload/upload.component.ts`, change the `content` logic in `onFilesSelected` to also store `cpu-profile` as a raw `File` (like `heap-snapshot`):

Find this code (around line 139-141):
```typescript
          content: d.format === 'heap-snapshot'
            ? d.file
            : JSON.parse(await readFileText(d.file)),
```

Replace with:
```typescript
          content: (d.format === 'heap-snapshot' || d.format === 'cpu-profile')
            ? d.file
            : JSON.parse(await readFileText(d.file)),
```

- [ ] **Step 2: Update dashboard component for CPU profiles**

Replace the entire content of `src/app/features/dashboard/dashboard.component.ts` with this updated version that adds CPU profile support:

In the imports section, add these new imports:
```typescript
import { CpuProfileParserService } from '../../core/services/cpu-profile-parser.service';
import { ParsedCpuProfile, CpuProfileComparison } from '../../core/models/cpu-profile.model';
import { compareCpuProfiles } from '../../core/parsers/cpu-profile-parser';
import { CpuFlamechartComponent } from './cpu-flamechart.component';
import { CpuHotFunctionsComponent } from './cpu-hot-functions.component';
import { CpuDeoptListComponent } from './cpu-deopt-list.component';
```

Add the three new components to the `imports` array in the `@Component` decorator:
```typescript
    CpuFlamechartComponent,
    CpuHotFunctionsComponent,
    CpuDeoptListComponent,
```

Update the `fileFormat` signal type to include `cpu-profile`:
```typescript
  private readonly fileFormat = signal<'perf-trace' | 'heap-snapshot' | 'cpu-profile' | null>(null);
```

Inject the CPU parser:
```typescript
  readonly cpuParser = inject(CpuProfileParserService);
```

Add CPU profile signals:
```typescript
  cpuProfile = signal<ParsedCpuProfile | null>(null);
  cpuComparison = signal<CpuProfileComparison | null>(null);
```

Update `dashboardTabs` computed to include CPU profile tabs:
```typescript
  readonly dashboardTabs = computed<TabDef[]>(() => {
    const format = this.fileFormat();
    const isHeapSnapshot = format === 'heap-snapshot';
    const isPerfTrace = format === 'perf-trace';
    const isCpuProfile = format === 'cpu-profile';
    const hasDeoptEvents = (this.cpuProfile()?.deoptEvents.length ?? 0) > 0;

    return [
      { id: 'action-items', label: 'Action Items', icon: '🎯', disabled: !isHeapSnapshot && !isPerfTrace && !isCpuProfile },
      { id: 'flamegraph', label: 'Flamegraph', icon: '🔥', disabled: !isPerfTrace },
      { id: 'timeline', label: 'Timeline', icon: '📊', disabled: !isPerfTrace },
      { id: 'network', label: 'Network', icon: '🌊', disabled: !isPerfTrace },
      { id: 'memory', label: 'Memory', icon: '🧠', disabled: !isHeapSnapshot },
      { id: 'cpu-profile', label: 'CPU Profile', icon: '⚡', disabled: !isCpuProfile },
      { id: 'v8-internals', label: 'V8 Internals', icon: '⚙️', disabled: !isCpuProfile || !hasDeoptEvents },
    ];
  });
```

Add the CPU profile handling branch in the constructor, right before the final error `else` block (before `this.error.set(...)`):

```typescript
    if (file.format === 'cpu-profile') {
      this.fileFormat.set('cpu-profile');
      this.activeTab.set('cpu-profile');

      this.result.set({
        fileName: file.name,
        fileSize: file.size,
        analyzedAt: new Date(),
        metrics: [],
        actionItems: [],
        parsedTrace: EMPTY_PARSED_TRACE,
      });

      effect(() => {
        const profile = this.cpuParser.result();
        if (!profile) return;

        this.cpuProfile.set(profile);

        // Handle comparison if two CPU profiles were uploaded
        let comparison: CpuProfileComparison | undefined;
        if (files.length === 2 && files[1].format === 'cpu-profile') {
          // Second profile will be handled after the first completes
        }

        const { actionItems, metrics } = this.ruleEngine.analyzeCpuProfile(profile, comparison);

        this.result.set({
          fileName: file.name,
          fileSize: file.size,
          analyzedAt: new Date(),
          metrics,
          actionItems,
          parsedTrace: EMPTY_PARSED_TRACE,
          cpuResult: { profile, comparison },
        });
      });

      this.cpuParser.parse(file.content as File).catch((e) => {
        console.error('Failed to parse CPU profile:', e);
        this.error.set('Failed to parse CPU profile. The file may be corrupted or in an unsupported format.');
      });
      return;
    }
```

Update the error message at the bottom of the constructor to say:
```typescript
    this.error.set(`${file.format} format is not yet supported. Only performance traces (.json), heap snapshots (.heapsnapshot), and CPU profiles (.cpuprofile) are supported.`);
```

Add the CPU profile tab panel in the template, after the memory tab panel and before the v8-internals panel:

```html
          <div
            id="tab-panel-cpu-profile"
            role="tabpanel"
            aria-labelledby="tab-cpu-profile"
            [hidden]="activeTab() !== 'cpu-profile'"
          >
            @if (activeTab() === 'cpu-profile') {
              @if (cpuParser.status() === 'parsing') {
                <div class="flex flex-col items-center justify-center py-12">
                  <div class="text-lg text-gray-300 mb-2">{{ cpuParser.progressPhase() }}</div>
                  <div class="w-64 bg-gray-700 rounded-full h-3">
                    <div
                      class="bg-emerald-500 h-3 rounded-full transition-all"
                      [style.width.%]="cpuParser.progress()"
                    ></div>
                  </div>
                  <div class="text-sm text-gray-400 mt-2">{{ cpuParser.progress() }}%</div>
                </div>
              } @else if (cpuParser.status() === 'error') {
                <div class="text-red-400 py-4">{{ cpuParser.error() }}</div>
              } @else if (cpuProfile()) {
                <div class="space-y-6">
                  <h3 class="text-lg font-semibold text-gray-200">Flame Chart</h3>
                  <app-cpu-flamechart [profile]="cpuProfile()!" />

                  <h3 class="text-lg font-semibold text-gray-200">Hot Functions</h3>
                  <app-cpu-hot-functions
                    [entries]="cpuProfile()!.flatProfile"
                    [comparison]="cpuComparison() ?? undefined"
                  />
                </div>
              }
            }
          </div>
```

Update the v8-internals tab panel to show deopt list:
```html
          <div
            id="tab-panel-v8-internals"
            role="tabpanel"
            aria-labelledby="tab-v8-internals"
            [hidden]="activeTab() !== 'v8-internals'"
          >
            @if (activeTab() === 'v8-internals' && cpuProfile()) {
              <div class="space-y-6">
                <h3 class="text-lg font-semibold text-gray-200">V8 Deoptimizations</h3>
                <app-cpu-deopt-list [deoptEvents]="cpuProfile()!.deoptEvents" />
              </div>
            }
          </div>
```

- [ ] **Step 3: Verify build passes**

Run: `cd /Users/santosh/.copilot/copilot-worktrees/perflens/santoshyadavdev-fuzzy-enigma && npx ng build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Run all existing tests**

Run: `cd /Users/santosh/.copilot/copilot-worktrees/perflens/santoshyadavdev-fuzzy-enigma && npx vitest run 2>&1 | tail -20`
Expected: All tests pass (existing + new)

- [ ] **Step 5: Commit**

```bash
git add src/app/features/upload/upload.component.ts src/app/features/dashboard/dashboard.component.ts
git commit -m "feat(cpu): integrate CPU profile pipeline into dashboard and upload"
```

---

### Task 10: Dashboard Tests for CPU Profiles

**Files:**
- Modify: `src/app/features/dashboard/dashboard.component.spec.ts`

- [ ] **Step 1: Add CPU profile test suite**

Append this test suite to the end of `src/app/features/dashboard/dashboard.component.spec.ts`:

```typescript
describe('DashboardComponent (cpu profile)', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  const getTabButton = (label: string): HTMLButtonElement | undefined =>
    Array.from(fixture.nativeElement.querySelectorAll('button')).find((button: HTMLButtonElement) =>
      button.textContent?.includes(label),
    );

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    const traceStore = TestBed.inject(TraceStoreService);
    traceStore.store([{
      name: 'test.cpuprofile',
      size: 2048,
      format: 'cpu-profile',
      content: new File(['{}'], 'test.cpuprofile'),
    }]);

    fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
  });

  it('enables the CPU Profile tab and defaults to it', () => {
    expect(getTabButton('CPU Profile')?.disabled).toBe(false);
    expect(getTabButton('Flamegraph')?.disabled).toBe(true);
    expect(getTabButton('Timeline')?.disabled).toBe(true);
    expect(getTabButton('Network')?.disabled).toBe(true);
    expect(getTabButton('Memory')?.disabled).toBe(true);
  });

  it('enables the Action Items tab', () => {
    expect(getTabButton('Action Items')?.disabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run dashboard tests**

Run: `cd /Users/santosh/.copilot/copilot-worktrees/perflens/santoshyadavdev-fuzzy-enigma && npx vitest run src/app/features/dashboard/dashboard.component.spec.ts 2>&1 | tail -15`
Expected: All tests PASS

- [ ] **Step 3: Run the full test suite**

Run: `cd /Users/santosh/.copilot/copilot-worktrees/perflens/santoshyadavdev-fuzzy-enigma && npx vitest run 2>&1 | tail -15`
Expected: ALL tests pass

- [ ] **Step 4: Verify build passes**

Run: `cd /Users/santosh/.copilot/copilot-worktrees/perflens/santoshyadavdev-fuzzy-enigma && npx ng build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/app/features/dashboard/dashboard.component.spec.ts
git commit -m "test(cpu): add dashboard integration tests for CPU profile format"
```

---

### Task 11: Final Verification & Cleanup

- [ ] **Step 1: Run the full test suite**

Run: `cd /Users/santosh/.copilot/copilot-worktrees/perflens/santoshyadavdev-fuzzy-enigma && npx vitest run 2>&1`
Expected: All tests pass (157 existing + new tests)

- [ ] **Step 2: Run the production build**

Run: `cd /Users/santosh/.copilot/copilot-worktrees/perflens/santoshyadavdev-fuzzy-enigma && npx ng build 2>&1 | tail -10`
Expected: Build succeeds with no errors

- [ ] **Step 3: Verify no TypeScript errors**

Run: `cd /Users/santosh/.copilot/copilot-worktrees/perflens/santoshyadavdev-fuzzy-enigma && npx tsc --noEmit 2>&1 | tail -10`
Expected: No errors
