# PerfLens: Share, Session History & Trace Comparison

**Date:** 2026-07-21
**Status:** Approved

## Overview

Three interconnected features that enhance PerfLens's utility:

1. **Session History** — persist analysis results in IndexedDB for recall
2. **Share via URL** — encode analysis results into shareable URLs or `.perflens` files
3. **Trace Comparison** — diff two perf traces side-by-side

Session History is the foundation; Share and Comparison both build on it.

---

## 1. Session History

### Data Model

```typescript
interface SavedSession {
  id: string;              // crypto.randomUUID()
  fileName: string;
  fileSize: number;
  format: 'perf-trace' | 'heap-snapshot' | 'cpu-profile';
  analyzedAt: string;      // ISO 8601
  metrics: MetricScore[];
  actionItems: ActionItem[];
  rawDataStored: boolean;
}
```

### Storage

IndexedDB database `perflens-history` with two object stores:

- **`sessions`** — `SavedSession` objects (~50KB each). Keyed by `id`, indexed by `analyzedAt`.
- **`raw-data`** — raw parsed trace/profile data, keyed by session `id`. Only populated when user opts in.

### Service: `SessionHistoryService`

Injectable, `providedIn: 'root'`.

| Method | Description |
|--------|-------------|
| `save(result, format, saveRaw?)` | Save analysis results. Returns session ID. Auto-evicts oldest when count > 10. |
| `list()` | Returns all sessions sorted by `analyzedAt` desc. |
| `load(id)` | Load a session's analysis results. |
| `loadRaw(id)` | Load raw trace data if stored. Returns `null` if not stored. |
| `delete(id)` | Delete a session and its raw data. |

### Retention

- Maximum 10 sessions.
- When saving a new session that would exceed the limit, the oldest session (by `analyzedAt`) is automatically deleted, including its raw data.

### UI

**Upload page — "Recent Analyses" section:**
- Rendered below the drop zone when sessions exist.
- Each session shown as a card: format icon, file name, date, top-level metric summary (e.g., "LCP: 2.1s ✅").
- Click navigates to `/dashboard` with the session loaded from IndexedDB.
- Swipe-to-delete or trash icon per card.

**Dashboard nav bar — History dropdown:**
- Clock icon in the nav bar opens a dropdown with the same session list.
- Selecting a session navigates back to `/dashboard` with that session loaded.

### Integration with Dashboard

`TraceStoreService` gains a new method `storeFromSession(session: SavedSession)` that populates the in-memory store from a saved session, allowing the dashboard to render without re-parsing.

---

## 2. Share via URL

### Shareable Payload

```typescript
interface SharePayload {
  v: 1;                    // schema version for forward compatibility
  fn: string;              // fileName
  fs: number;              // fileSize
  fmt: string;             // format
  at: string;              // analyzedAt ISO
  m: MetricScore[];        // metrics
  ai: ActionItem[];        // actionItems (abbreviated keys for size)
}
```

### Encoding Pipeline

1. `JSON.stringify(payload)`
2. `new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))`
3. Read compressed bytes → base64url encode
4. Construct URL: `{origin}/#share={base64url}`

### Size Threshold

If the encoded URL hash exceeds **8,000 characters**, the URL approach is skipped. The user is offered a `.perflens` file download instead (JSON file with the same `SharePayload` structure, uncompressed for readability).

### Import Flow

**URL import (`#share=`):**
- A route guard on the root route checks `location.hash` for `#share=` prefix.
- Decode: base64url → decompress via `DecompressionStream('gzip')` → `JSON.parse` → validate `v` field.
- Render dashboard in **shared view** mode: read-only banner at top ("Viewing shared analysis — Save to History to keep it").
- "Save to History" button calls `SessionHistoryService.save()`.

**File import (`.perflens`):**
- Add `.perflens` to accepted file types on the upload page.
- `FormatDetectorService.detect()` recognizes `.perflens` extension and `v` field in JSON.
- Parsed and routed to dashboard like any other format.

### UI

- **Share button** in dashboard nav bar becomes active (currently disabled).
- Click opens a `ShareDialogComponent`:
  - "Copy Link" button — copies URL to clipboard, shows "Copied!" toast.
  - If URL exceeds size limit: shows info message + "Download .perflens" button instead.
  - "Download .perflens" always available as secondary action.
- Toast notifications via a lightweight `ToastService` (or reuse if one exists).

### Service: `ShareService`

| Method | Description |
|--------|-------------|
| `encode(result, format)` | Returns `{ url: string \| null, tooLarge: boolean }`. |
| `decode(hash)` | Parses a `#share=` hash into a `SharePayload`. Throws on invalid data. |
| `downloadPerflensFile(result, format)` | Triggers browser download of `.perflens` file. |

---

## 3. Trace Comparison

### Entry Points

1. **Upload two traces:** When the upload page detects 2 files of the same perf-trace format, it stores both and routes to `/dashboard` with comparison mode active.
2. **Compare from history:** Dashboard shows a "Compare with…" button. Clicking opens a picker listing saved sessions of the same format. Selecting one loads it as the baseline.

### Comparison Model

```typescript
interface TraceComparison {
  current: AnalysisResult;
  baseline: AnalysisResult;
  metricDiffs: MetricDiff[];
  newActionItems: ActionItem[];      // in current but not baseline
  resolvedActionItems: ActionItem[]; // in baseline but not current
  unchangedActionItems: ActionItem[];
}

interface MetricDiff {
  name: string;
  shortName: string;
  current: MetricScore;
  baseline: MetricScore;
  delta: number;           // current.value - baseline.value
  deltaPercent: number;    // percentage change
  improved: boolean;       // true if delta direction is "better" (lower for time metrics, etc.)
}
```

### Service: `TraceComparisonService`

| Method | Description |
|--------|-------------|
| `compare(current, baseline)` | Produces a `TraceComparison`. Matches metrics by `shortName`, action items by `id`. |
| `isImproved(metric, delta)` | Determines if a delta is an improvement based on metric type (lower is better for LCP/TBT, etc.). |

### Dashboard Integration

**New tab: "Comparison"**
- Added to `dashboardTabs` computed list when comparison data is present.
- Tab ID: `comparison`, icon: `⚖️`.

**Comparison tab content (`TraceComparisonComponent`):**
- **Metric diff cards:** Side-by-side current vs. baseline with delta badges.
  - Green `↓ 15%` for improvements, red `↑ 23%` for regressions.
  - Neutral gray for unchanged (< 1% delta).
- **Action items diff:** Three sections:
  - 🆕 **New Issues** — items in current but not baseline.
  - ✅ **Resolved** — items in baseline but not current.
  - ➡️ **Unchanged** — items present in both.

**Compare from history flow:**
- "Compare with…" button in dashboard nav (visible when `SessionHistoryService.list()` has sessions of matching format).
- Opens `ComparePickerComponent` — modal listing matching sessions.
- On selection: load baseline from IndexedDB, run `TraceComparisonService.compare()`, update dashboard state.

### Score Cards Enhancement

When comparison is active, `ScoreCardsComponent` shows delta indicators next to each metric value (small badge with ↑/↓ and percentage).

---

## File Structure

New files:

```
src/app/core/services/
  session-history.service.ts
  session-history.service.spec.ts
  share.service.ts
  share.service.spec.ts
  trace-comparison.service.ts
  trace-comparison.service.spec.ts

src/app/features/dashboard/
  trace-comparison.component.ts
  trace-comparison.component.spec.ts
  share-dialog.component.ts
  share-dialog.component.spec.ts
  compare-picker.component.ts
  compare-picker.component.spec.ts

src/app/features/upload/
  recent-sessions.component.ts
  recent-sessions.component.spec.ts

src/app/shared/components/
  toast.component.ts
```

Modified files:

```
src/app/core/services/trace-store.service.ts  — add storeFromSession()
src/app/core/parsers/format-detector.service.ts  — detect .perflens format
src/app/core/models/analysis-result.model.ts  — add comparison types
src/app/features/upload/upload.component.ts  — add Recent Analyses section, .perflens support
src/app/features/dashboard/dashboard.component.ts  — comparison tab, share/compare buttons, history dropdown
src/app/features/dashboard/score-cards.component.ts  — delta indicators
src/app/app.routes.ts  — share import route guard
```

## Testing Strategy

- Unit tests for all three services (history CRUD + eviction, share encode/decode roundtrip, comparison logic).
- Component tests for new UI components.
- Integration: upload two traces → comparison tab renders correctly.

## Error Handling

- **IndexedDB unavailable:** Fall back to in-memory only, disable history features, show info toast.
- **Corrupt share URL:** Show error message on upload page, don't crash.
- **Mismatched formats in comparison:** Show toast "Cannot compare a perf trace with a heap snapshot".
- **Session eviction:** Silent, no user prompt.
