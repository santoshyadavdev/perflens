# Share, Session History & Trace Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add session history persistence (IndexedDB), shareable URLs / `.perflens` files, and side-by-side trace comparison to PerfLens.

**Architecture:** Three layered features built bottom-up. `SessionHistoryService` wraps IndexedDB for CRUD + auto-eviction (max 10). `ShareService` encodes/decodes analysis results via gzip+base64url into URL hashes or downloadable `.perflens` files. `TraceComparisonService` diffs two `AnalysisResult` objects to produce metric deltas and action-item diffs. Each service is standalone with no cross-dependencies except Share and Comparison optionally reading from history.

**Tech Stack:** Angular 22 (signals, standalone components), Vitest, Tailwind CSS 4, IndexedDB (raw API, no library), CompressionStream/DecompressionStream APIs.

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `src/app/core/models/session-history.model.ts` | `SavedSession` interface |
| `src/app/core/models/share.model.ts` | `SharePayload` interface |
| `src/app/core/models/trace-comparison.model.ts` | `TraceComparison`, `MetricDiff` interfaces |
| `src/app/core/services/session-history.service.ts` | IndexedDB CRUD + eviction |
| `src/app/core/services/session-history.service.spec.ts` | Tests |
| `src/app/core/services/share.service.ts` | Encode/decode/download |
| `src/app/core/services/share.service.spec.ts` | Tests |
| `src/app/core/services/trace-comparison.service.ts` | Diff two AnalysisResults |
| `src/app/core/services/trace-comparison.service.spec.ts` | Tests |
| `src/app/features/upload/recent-sessions.component.ts` | Recent analyses cards on upload page |
| `src/app/features/upload/recent-sessions.component.spec.ts` | Tests |
| `src/app/features/dashboard/share-dialog.component.ts` | Share URL/file dialog |
| `src/app/features/dashboard/share-dialog.component.spec.ts` | Tests |
| `src/app/features/dashboard/compare-picker.component.ts` | Pick a session to compare against |
| `src/app/features/dashboard/compare-picker.component.spec.ts` | Tests |
| `src/app/features/dashboard/trace-comparison.component.ts` | Comparison tab content |
| `src/app/features/dashboard/trace-comparison.component.spec.ts` | Tests |
| `src/app/shared/components/toast.component.ts` | Lightweight toast notifications |

### Modified files

| File | Changes |
|------|---------|
| `src/app/core/services/trace-store.service.ts` | Add `storeFromSession()` method |
| `src/app/core/parsers/format-detector.service.ts` | Detect `.perflens` format |
| `src/app/features/upload/upload.component.ts` | Add `RecentSessionsComponent`, accept `.perflens` |
| `src/app/features/dashboard/dashboard.component.ts` | Wire comparison tab, share/compare buttons, history dropdown, auto-save |
| `src/app/features/dashboard/score-cards.component.ts` | Add delta indicators for comparison mode |
| `src/app/app.routes.ts` | Add share URL route guard |

---

### Task 1: Session History Model & Service

**Files:**
- Create: `src/app/core/models/session-history.model.ts`
- Create: `src/app/core/services/session-history.service.ts`
- Create: `src/app/core/services/session-history.service.spec.ts`

- [ ] **Step 1: Create the SavedSession model**

Create `src/app/core/models/session-history.model.ts`:

```typescript
import { ActionItem } from './action-item.model';
import { MetricScore } from './metric-score.model';

export interface SavedSession {
  id: string;
  fileName: string;
  fileSize: number;
  format: 'perf-trace' | 'heap-snapshot' | 'cpu-profile';
  analyzedAt: string; // ISO 8601
  metrics: MetricScore[];
  actionItems: ActionItem[];
  rawDataStored: boolean;
}

export const SESSION_HISTORY_DB = 'perflens-history';
export const SESSIONS_STORE = 'sessions';
export const RAW_DATA_STORE = 'raw-data';
export const MAX_SESSIONS = 10;
```

- [ ] **Step 2: Write failing tests for SessionHistoryService**

Create `src/app/core/services/session-history.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { SessionHistoryService } from './session-history.service';
import { SavedSession } from '../models/session-history.model';

// Use fake-indexeddb for tests
import 'fake-indexeddb/auto';

function makeSession(overrides: Partial<SavedSession> = {}): SavedSession {
  return {
    id: crypto.randomUUID(),
    fileName: 'trace.json',
    fileSize: 1024,
    format: 'perf-trace',
    analyzedAt: new Date().toISOString(),
    metrics: [],
    actionItems: [],
    rawDataStored: false,
    ...overrides,
  };
}

describe('SessionHistoryService', () => {
  let service: SessionHistoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SessionHistoryService],
    });
    service = TestBed.inject(SessionHistoryService);
  });

  afterEach(async () => {
    // Clean up IndexedDB between tests
    const dbs = await indexedDB.databases();
    for (const db of dbs) {
      if (db.name) indexedDB.deleteDatabase(db.name);
    }
  });

  it('should save and list sessions', async () => {
    const id = await service.save(
      {
        fileName: 'trace.json',
        fileSize: 1024,
        analyzedAt: new Date(),
        metrics: [{ name: 'LCP', shortName: 'LCP', value: 2000, displayValue: '2.0s', unit: 'ms', rating: 'good' }],
        actionItems: [],
        parsedTrace: { traceEvents: [], metadata: { traceStartTime: 0, traceEndTime: 0 }, mainThreadId: 0, navigationStart: 0 },
      },
      'perf-trace',
    );

    expect(id).toBeTruthy();

    const sessions = await service.list();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].fileName).toBe('trace.json');
    expect(sessions[0].format).toBe('perf-trace');
  });

  it('should load a saved session by id', async () => {
    const id = await service.save(
      {
        fileName: 'heap.heapsnapshot',
        fileSize: 2048,
        analyzedAt: new Date(),
        metrics: [],
        actionItems: [{ id: 'a1', severity: 'critical', title: 'Leak', detail: 'Detail', metric: 'MEMORY', fix: 'Fix' }],
        parsedTrace: { traceEvents: [], metadata: { traceStartTime: 0, traceEndTime: 0 }, mainThreadId: 0, navigationStart: 0 },
      },
      'heap-snapshot',
    );

    const session = await service.load(id);
    expect(session).not.toBeNull();
    expect(session!.fileName).toBe('heap.heapsnapshot');
    expect(session!.actionItems).toHaveLength(1);
  });

  it('should delete a session', async () => {
    const id = await service.save(
      {
        fileName: 'trace.json',
        fileSize: 1024,
        analyzedAt: new Date(),
        metrics: [],
        actionItems: [],
        parsedTrace: { traceEvents: [], metadata: { traceStartTime: 0, traceEndTime: 0 }, mainThreadId: 0, navigationStart: 0 },
      },
      'perf-trace',
    );

    await service.delete(id);
    const sessions = await service.list();
    expect(sessions).toHaveLength(0);
  });

  it('should auto-evict oldest when exceeding max sessions', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 11; i++) {
      const id = await service.save(
        {
          fileName: `trace-${i}.json`,
          fileSize: 1024,
          analyzedAt: new Date(Date.now() + i * 1000),
          metrics: [],
          actionItems: [],
          parsedTrace: { traceEvents: [], metadata: { traceStartTime: 0, traceEndTime: 0 }, mainThreadId: 0, navigationStart: 0 },
        },
        'perf-trace',
      );
      ids.push(id);
    }

    const sessions = await service.list();
    expect(sessions).toHaveLength(10);
    // Oldest (trace-0) should have been evicted
    expect(sessions.find(s => s.fileName === 'trace-0.json')).toBeUndefined();
    // Newest (trace-10) should exist
    expect(sessions.find(s => s.fileName === 'trace-10.json')).toBeDefined();
  });

  it('should save and load raw data when opted in', async () => {
    const rawData = { traceEvents: [{ name: 'test', ph: 'X', ts: 0, pid: 1, tid: 1, cat: '' }] };
    const id = await service.save(
      {
        fileName: 'trace.json',
        fileSize: 1024,
        analyzedAt: new Date(),
        metrics: [],
        actionItems: [],
        parsedTrace: { traceEvents: [], metadata: { traceStartTime: 0, traceEndTime: 0 }, mainThreadId: 0, navigationStart: 0 },
      },
      'perf-trace',
      rawData,
    );

    const session = await service.load(id);
    expect(session!.rawDataStored).toBe(true);

    const raw = await service.loadRaw(id);
    expect(raw).toEqual(rawData);
  });

  it('should return null for loadRaw when no raw data stored', async () => {
    const id = await service.save(
      {
        fileName: 'trace.json',
        fileSize: 1024,
        analyzedAt: new Date(),
        metrics: [],
        actionItems: [],
        parsedTrace: { traceEvents: [], metadata: { traceStartTime: 0, traceEndTime: 0 }, mainThreadId: 0, navigationStart: 0 },
      },
      'perf-trace',
    );

    const raw = await service.loadRaw(id);
    expect(raw).toBeNull();
  });

  it('should list sessions sorted by analyzedAt descending', async () => {
    await service.save(
      {
        fileName: 'old.json',
        fileSize: 1024,
        analyzedAt: new Date('2026-01-01'),
        metrics: [],
        actionItems: [],
        parsedTrace: { traceEvents: [], metadata: { traceStartTime: 0, traceEndTime: 0 }, mainThreadId: 0, navigationStart: 0 },
      },
      'perf-trace',
    );
    await service.save(
      {
        fileName: 'new.json',
        fileSize: 1024,
        analyzedAt: new Date('2026-07-01'),
        metrics: [],
        actionItems: [],
        parsedTrace: { traceEvents: [], metadata: { traceStartTime: 0, traceEndTime: 0 }, mainThreadId: 0, navigationStart: 0 },
      },
      'perf-trace',
    );

    const sessions = await service.list();
    expect(sessions[0].fileName).toBe('new.json');
    expect(sessions[1].fileName).toBe('old.json');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/app/core/services/session-history.service.spec.ts`
Expected: FAIL — `session-history.service` module not found

- [ ] **Step 4: Install fake-indexeddb dev dependency**

Run: `npm install --save-dev fake-indexeddb`

- [ ] **Step 5: Implement SessionHistoryService**

Create `src/app/core/services/session-history.service.ts`:

```typescript
import { Injectable } from '@angular/core';
import {
  SavedSession,
  SESSION_HISTORY_DB,
  SESSIONS_STORE,
  RAW_DATA_STORE,
  MAX_SESSIONS,
} from '../models/session-history.model';
import { AnalysisResult } from '../models/analysis-result.model';

@Injectable({ providedIn: 'root' })
export class SessionHistoryService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(SESSION_HISTORY_DB, 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
          const store = db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' });
          store.createIndex('analyzedAt', 'analyzedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(RAW_DATA_STORE)) {
          db.createObjectStore(RAW_DATA_STORE);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  async save(
    result: AnalysisResult,
    format: 'perf-trace' | 'heap-snapshot' | 'cpu-profile',
    rawData?: unknown,
  ): Promise<string> {
    const db = await this.openDb();
    const id = crypto.randomUUID();

    const session: SavedSession = {
      id,
      fileName: result.fileName,
      fileSize: result.fileSize,
      format,
      analyzedAt: result.analyzedAt.toISOString(),
      metrics: result.metrics,
      actionItems: result.actionItems,
      rawDataStored: rawData != null,
    };

    await this.put(db, SESSIONS_STORE, session);

    if (rawData != null) {
      await this.putRaw(db, id, rawData);
    }

    await this.evictOldest(db);

    return id;
  }

  async list(): Promise<SavedSession[]> {
    const db = await this.openDb();
    const sessions = await this.getAll(db);
    return sessions.sort(
      (a, b) => new Date(b.analyzedAt).getTime() - new Date(a.analyzedAt).getTime(),
    );
  }

  async load(id: string): Promise<SavedSession | null> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SESSIONS_STORE, 'readonly');
      const store = tx.objectStore(SESSIONS_STORE);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  async loadRaw(id: string): Promise<unknown | null> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(RAW_DATA_STORE, 'readonly');
      const store = tx.objectStore(RAW_DATA_STORE);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(id: string): Promise<void> {
    const db = await this.openDb();
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(SESSIONS_STORE, 'readwrite');
        const request = tx.objectStore(SESSIONS_STORE).delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }),
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(RAW_DATA_STORE, 'readwrite');
        const request = tx.objectStore(RAW_DATA_STORE).delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      }),
    ]);
  }

  private put(db: IDBDatabase, storeName: string, value: SavedSession): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const request = tx.objectStore(storeName).put(value);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private putRaw(db: IDBDatabase, key: string, value: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(RAW_DATA_STORE, 'readwrite');
      const request = tx.objectStore(RAW_DATA_STORE).put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private getAll(db: IDBDatabase): Promise<SavedSession[]> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SESSIONS_STORE, 'readonly');
      const request = tx.objectStore(SESSIONS_STORE).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async evictOldest(db: IDBDatabase): Promise<void> {
    const all = await this.getAll(db);
    if (all.length <= MAX_SESSIONS) return;

    const sorted = all.sort(
      (a, b) => new Date(a.analyzedAt).getTime() - new Date(b.analyzedAt).getTime(),
    );
    const toRemove = sorted.slice(0, all.length - MAX_SESSIONS);

    for (const session of toRemove) {
      await this.delete(session.id);
    }
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/app/core/services/session-history.service.spec.ts`
Expected: All 7 tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/core/models/session-history.model.ts src/app/core/services/session-history.service.ts src/app/core/services/session-history.service.spec.ts
git commit -m "feat: add SessionHistoryService with IndexedDB persistence"
```

---

### Task 2: TraceStoreService — storeFromSession method

**Files:**
- Modify: `src/app/core/services/trace-store.service.ts`

- [ ] **Step 1: Add storeFromSession method**

In `src/app/core/services/trace-store.service.ts`, add the `storeFromSession` import and method. The full file should be:

```typescript
import { Injectable, signal } from '@angular/core';
import { SavedSession } from '../models/session-history.model';

export interface StoredFile {
  name: string;
  size: number;
  format: string;
  content: unknown;
}

@Injectable({ providedIn: 'root' })
export class TraceStoreService {
  private readonly _files = signal<StoredFile[]>([]);
  readonly files = this._files.asReadonly();

  private readonly _restoredSession = signal<SavedSession | null>(null);
  readonly restoredSession = this._restoredSession.asReadonly();

  store(files: StoredFile[]): void {
    this._files.set(files);
    this._restoredSession.set(null);
  }

  storeFromSession(session: SavedSession): void {
    this._files.set([
      {
        name: session.fileName,
        size: session.fileSize,
        format: session.format,
        content: null,
      },
    ]);
    this._restoredSession.set(session);
  }

  clear(): void {
    this._files.set([]);
    this._restoredSession.set(null);
  }

  hasFiles(): boolean {
    return this._files().length > 0;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/core/services/trace-store.service.ts
git commit -m "feat: add storeFromSession to TraceStoreService"
```

---

### Task 3: Trace Comparison Model & Service

**Files:**
- Create: `src/app/core/models/trace-comparison.model.ts`
- Create: `src/app/core/services/trace-comparison.service.ts`
- Create: `src/app/core/services/trace-comparison.service.spec.ts`

- [ ] **Step 1: Create comparison model**

Create `src/app/core/models/trace-comparison.model.ts`:

```typescript
import { ActionItem } from './action-item.model';
import { AnalysisResult } from './analysis-result.model';
import { MetricScore } from './metric-score.model';

export interface TraceComparison {
  current: AnalysisResult;
  baseline: AnalysisResult;
  metricDiffs: MetricDiff[];
  newActionItems: ActionItem[];
  resolvedActionItems: ActionItem[];
  unchangedActionItems: ActionItem[];
}

export interface MetricDiff {
  name: string;
  shortName: string;
  current: MetricScore;
  baseline: MetricScore;
  delta: number;
  deltaPercent: number;
  improved: boolean;
}
```

- [ ] **Step 2: Write failing tests for TraceComparisonService**

Create `src/app/core/services/trace-comparison.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { TraceComparisonService } from './trace-comparison.service';
import { AnalysisResult } from '../models/analysis-result.model';
import { MetricScore } from '../models/metric-score.model';

const EMPTY_TRACE = {
  traceEvents: [],
  metadata: { traceStartTime: 0, traceEndTime: 0 },
  mainThreadId: 0,
  navigationStart: 0,
};

function makeResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    fileName: 'trace.json',
    fileSize: 1024,
    analyzedAt: new Date(),
    metrics: [],
    actionItems: [],
    parsedTrace: EMPTY_TRACE,
    ...overrides,
  };
}

function makeMetric(overrides: Partial<MetricScore> = {}): MetricScore {
  return {
    name: 'Largest Contentful Paint',
    shortName: 'LCP',
    value: 2000,
    displayValue: '2.0s',
    unit: 'ms',
    rating: 'good',
    ...overrides,
  };
}

describe('TraceComparisonService', () => {
  let service: TraceComparisonService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TraceComparisonService],
    });
    service = TestBed.inject(TraceComparisonService);
  });

  it('should compute metric diffs', () => {
    const current = makeResult({
      metrics: [makeMetric({ shortName: 'LCP', value: 2500, displayValue: '2.5s', rating: 'needs-improvement' })],
    });
    const baseline = makeResult({
      metrics: [makeMetric({ shortName: 'LCP', value: 2000, displayValue: '2.0s', rating: 'good' })],
    });

    const comparison = service.compare(current, baseline);

    expect(comparison.metricDiffs).toHaveLength(1);
    expect(comparison.metricDiffs[0].delta).toBe(500);
    expect(comparison.metricDiffs[0].deltaPercent).toBe(25);
    expect(comparison.metricDiffs[0].improved).toBe(false); // LCP went up = regression
  });

  it('should detect improvements (lower is better for time metrics)', () => {
    const current = makeResult({
      metrics: [makeMetric({ shortName: 'LCP', value: 1500, displayValue: '1.5s' })],
    });
    const baseline = makeResult({
      metrics: [makeMetric({ shortName: 'LCP', value: 2000, displayValue: '2.0s' })],
    });

    const comparison = service.compare(current, baseline);
    expect(comparison.metricDiffs[0].improved).toBe(true);
    expect(comparison.metricDiffs[0].delta).toBe(-500);
  });

  it('should classify action items as new, resolved, or unchanged', () => {
    const current = makeResult({
      actionItems: [
        { id: 'shared-1', severity: 'critical', title: 'Shared', detail: '', metric: 'LCP', fix: '' },
        { id: 'new-1', severity: 'warning', title: 'New', detail: '', metric: 'TBT', fix: '' },
      ],
    });
    const baseline = makeResult({
      actionItems: [
        { id: 'shared-1', severity: 'critical', title: 'Shared', detail: '', metric: 'LCP', fix: '' },
        { id: 'old-1', severity: 'info', title: 'Old', detail: '', metric: 'CLS', fix: '' },
      ],
    });

    const comparison = service.compare(current, baseline);
    expect(comparison.newActionItems).toHaveLength(1);
    expect(comparison.newActionItems[0].id).toBe('new-1');
    expect(comparison.resolvedActionItems).toHaveLength(1);
    expect(comparison.resolvedActionItems[0].id).toBe('old-1');
    expect(comparison.unchangedActionItems).toHaveLength(1);
    expect(comparison.unchangedActionItems[0].id).toBe('shared-1');
  });

  it('should handle metrics only in current (no baseline match)', () => {
    const current = makeResult({
      metrics: [makeMetric({ shortName: 'FCP', value: 1800, displayValue: '1.8s' })],
    });
    const baseline = makeResult({ metrics: [] });

    const comparison = service.compare(current, baseline);
    // Metrics without a baseline match are excluded from diffs
    expect(comparison.metricDiffs).toHaveLength(0);
  });

  it('should handle zero baseline value without NaN', () => {
    const current = makeResult({
      metrics: [makeMetric({ shortName: 'CLS', value: 0.1, displayValue: '0.1' })],
    });
    const baseline = makeResult({
      metrics: [makeMetric({ shortName: 'CLS', value: 0, displayValue: '0' })],
    });

    const comparison = service.compare(current, baseline);
    expect(comparison.metricDiffs[0].deltaPercent).toBe(0); // avoid Infinity
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/app/core/services/trace-comparison.service.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement TraceComparisonService**

Create `src/app/core/services/trace-comparison.service.ts`:

```typescript
import { Injectable } from '@angular/core';
import { AnalysisResult } from '../models/analysis-result.model';
import { MetricDiff, TraceComparison } from '../models/trace-comparison.model';

const LOWER_IS_BETTER = new Set(['LCP', 'FCP', 'INP', 'TBT', 'CLS']);

@Injectable({ providedIn: 'root' })
export class TraceComparisonService {
  compare(current: AnalysisResult, baseline: AnalysisResult): TraceComparison {
    const metricDiffs = this.diffMetrics(current, baseline);
    const currentIds = new Set(current.actionItems.map(a => a.id));
    const baselineIds = new Set(baseline.actionItems.map(a => a.id));

    return {
      current,
      baseline,
      metricDiffs,
      newActionItems: current.actionItems.filter(a => !baselineIds.has(a.id)),
      resolvedActionItems: baseline.actionItems.filter(a => !currentIds.has(a.id)),
      unchangedActionItems: current.actionItems.filter(a => baselineIds.has(a.id)),
    };
  }

  private diffMetrics(current: AnalysisResult, baseline: AnalysisResult): MetricDiff[] {
    const baselineMap = new Map(baseline.metrics.map(m => [m.shortName, m]));
    const diffs: MetricDiff[] = [];

    for (const cur of current.metrics) {
      const base = baselineMap.get(cur.shortName);
      if (!base) continue;

      const delta = cur.value - base.value;
      const deltaPercent = base.value !== 0
        ? Math.round((delta / base.value) * 100)
        : 0;

      diffs.push({
        name: cur.name,
        shortName: cur.shortName,
        current: cur,
        baseline: base,
        delta,
        deltaPercent,
        improved: LOWER_IS_BETTER.has(cur.shortName) ? delta < 0 : delta > 0,
      });
    }

    return diffs;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/app/core/services/trace-comparison.service.spec.ts`
Expected: All 5 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/core/models/trace-comparison.model.ts src/app/core/services/trace-comparison.service.ts src/app/core/services/trace-comparison.service.spec.ts
git commit -m "feat: add TraceComparisonService for metric and action-item diffs"
```

---

### Task 4: Share Model & Service

**Files:**
- Create: `src/app/core/models/share.model.ts`
- Create: `src/app/core/services/share.service.ts`
- Create: `src/app/core/services/share.service.spec.ts`

- [ ] **Step 1: Create SharePayload model**

Create `src/app/core/models/share.model.ts`:

```typescript
import { ActionItem } from './action-item.model';
import { MetricScore } from './metric-score.model';

export interface SharePayload {
  v: 1;
  fn: string;
  fs: number;
  fmt: string;
  at: string;
  m: MetricScore[];
  ai: ActionItem[];
}

export const SHARE_HASH_PREFIX = '#share=';
export const MAX_URL_LENGTH = 8000;
```

- [ ] **Step 2: Write failing tests for ShareService**

Create `src/app/core/services/share.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { ShareService } from './share.service';
import { AnalysisResult } from '../models/analysis-result.model';

const EMPTY_TRACE = {
  traceEvents: [],
  metadata: { traceStartTime: 0, traceEndTime: 0 },
  mainThreadId: 0,
  navigationStart: 0,
};

function makeResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    fileName: 'trace.json',
    fileSize: 1024,
    analyzedAt: new Date('2026-07-21T12:00:00Z'),
    metrics: [{ name: 'LCP', shortName: 'LCP', value: 2000, displayValue: '2.0s', unit: 'ms', rating: 'good' }],
    actionItems: [{ id: 'a1', severity: 'critical', title: 'Fix LCP', detail: 'Detail', metric: 'LCP', fix: 'Fix' }],
    parsedTrace: EMPTY_TRACE,
    ...overrides,
  };
}

describe('ShareService', () => {
  let service: ShareService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ShareService],
    });
    service = TestBed.inject(ShareService);
  });

  it('should encode and decode a result roundtrip', async () => {
    const result = makeResult();
    const encoded = await service.encode(result, 'perf-trace');

    expect(encoded.url).toBeTruthy();
    expect(encoded.tooLarge).toBe(false);

    const hash = encoded.url!.split('#')[1];
    const decoded = await service.decode(`#${hash}`);

    expect(decoded.fn).toBe('trace.json');
    expect(decoded.fs).toBe(1024);
    expect(decoded.fmt).toBe('perf-trace');
    expect(decoded.m).toHaveLength(1);
    expect(decoded.m[0].shortName).toBe('LCP');
    expect(decoded.ai).toHaveLength(1);
    expect(decoded.ai[0].id).toBe('a1');
  });

  it('should flag tooLarge when encoded data exceeds limit', async () => {
    const bigItems = Array.from({ length: 500 }, (_, i) => ({
      id: `item-${i}`,
      severity: 'critical' as const,
      title: `Issue ${i} with a very long title that takes up space ${'x'.repeat(100)}`,
      detail: `Detail for issue ${i} ${'y'.repeat(200)}`,
      metric: 'LCP' as const,
      fix: `Fix for issue ${i} ${'z'.repeat(200)}`,
    }));

    const result = makeResult({ actionItems: bigItems });
    const encoded = await service.encode(result, 'perf-trace');

    expect(encoded.tooLarge).toBe(true);
    expect(encoded.url).toBeNull();
  });

  it('should throw on invalid hash data', async () => {
    await expect(service.decode('#share=invaliddata!!!')).rejects.toThrow();
  });

  it('should build a .perflens file blob', () => {
    const result = makeResult();
    const blob = service.buildPerflensBlob(result, 'perf-trace');

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/json');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/app/core/services/share.service.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement ShareService**

Create `src/app/core/services/share.service.ts`:

```typescript
import { Injectable } from '@angular/core';
import { AnalysisResult } from '../models/analysis-result.model';
import { SharePayload, SHARE_HASH_PREFIX, MAX_URL_LENGTH } from '../models/share.model';
import { triggerDownload } from '../utils/download';

@Injectable({ providedIn: 'root' })
export class ShareService {
  async encode(
    result: AnalysisResult,
    format: string,
  ): Promise<{ url: string | null; tooLarge: boolean }> {
    const payload: SharePayload = {
      v: 1,
      fn: result.fileName,
      fs: result.fileSize,
      fmt: format,
      at: result.analyzedAt instanceof Date ? result.analyzedAt.toISOString() : String(result.analyzedAt),
      m: result.metrics,
      ai: result.actionItems,
    };

    const json = JSON.stringify(payload);
    const compressed = await this.compress(json);
    const base64 = this.toBase64Url(compressed);
    const hash = `${SHARE_HASH_PREFIX}${base64}`;

    if (hash.length > MAX_URL_LENGTH) {
      return { url: null, tooLarge: true };
    }

    const url = `${location.origin}${location.pathname}${hash}`;
    return { url, tooLarge: false };
  }

  async decode(hash: string): Promise<SharePayload> {
    if (!hash.startsWith(SHARE_HASH_PREFIX)) {
      throw new Error('Invalid share URL: missing #share= prefix');
    }

    const base64 = hash.slice(SHARE_HASH_PREFIX.length);
    const compressed = this.fromBase64Url(base64);
    const json = await this.decompress(compressed);
    const payload = JSON.parse(json) as SharePayload;

    if (payload.v !== 1) {
      throw new Error(`Unsupported share format version: ${payload.v}`);
    }

    return payload;
  }

  buildPerflensBlob(result: AnalysisResult, format: string): Blob {
    const payload: SharePayload = {
      v: 1,
      fn: result.fileName,
      fs: result.fileSize,
      fmt: format,
      at: result.analyzedAt instanceof Date ? result.analyzedAt.toISOString() : String(result.analyzedAt),
      m: result.metrics,
      ai: result.actionItems,
    };

    return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  }

  downloadPerflensFile(result: AnalysisResult, format: string): void {
    const blob = this.buildPerflensBlob(result, format);
    const baseName = result.fileName.replace(/\.[^.]+$/, '');
    triggerDownload(blob, `${baseName}.perflens`);
  }

  private async compress(text: string): Promise<Uint8Array> {
    const blob = new Blob([text]);
    const stream = blob.stream().pipeThrough(new CompressionStream('gzip'));
    const response = new Response(stream);
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  private async decompress(data: Uint8Array): Promise<string> {
    const blob = new Blob([data]);
    const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
    const response = new Response(stream);
    return response.text();
  }

  private toBase64Url(data: Uint8Array): string {
    let binary = '';
    for (const byte of data) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  private fromBase64Url(base64url: string): Uint8Array {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/app/core/services/share.service.spec.ts`
Expected: All 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/core/models/share.model.ts src/app/core/services/share.service.ts src/app/core/services/share.service.spec.ts
git commit -m "feat: add ShareService with gzip+base64url encoding and .perflens file support"
```

---

### Task 5: FormatDetector — detect .perflens files

**Files:**
- Modify: `src/app/core/parsers/format-detector.service.ts`
- Modify: `src/app/core/models/trace-event.model.ts`

- [ ] **Step 1: Add 'perflens' to FileFormat type**

In `src/app/core/models/trace-event.model.ts`, change line 27:

```typescript
export type FileFormat = 'perf-trace' | 'heap-snapshot' | 'cpu-profile' | 'v8-log' | 'perflens' | 'unknown';
```

- [ ] **Step 2: Add .perflens detection to FormatDetectorService**

In `src/app/core/parsers/format-detector.service.ts`, add detection for `.perflens` files. In the `detect` method, add a check before the gzip check:

```typescript
async detect(file: File): Promise<FileFormat> {
  // Check file extension for .perflens files
  if (file.name.endsWith('.perflens')) {
    return 'perflens';
  }

  const headBuffer = await file.slice(0, 4096).arrayBuffer();
  // ... rest unchanged
```

Also add `.perflens` detection in `detectFromHead` — in the `trimmed.startsWith('{')` block, add before the `return 'unknown'` fallthrough:

```typescript
if (/"v"\s*:\s*1/.test(trimmed) && /"fn"\s*:/.test(trimmed) && /"fmt"\s*:/.test(trimmed)) return 'perflens';
```

- [ ] **Step 3: Update upload component to accept .perflens**

In `src/app/features/upload/upload.component.ts`, update the file input `accept` attribute (line 54):

```html
accept=".json,.json.gz,.gz,.heapsnapshot,.cpuprofile,.log,.perflens"
```

And update the supported formats text (line 44):

```html
Supports .json/.json.gz traces, .heapsnapshot, .cpuprofile, V8 .log, .perflens
```

- [ ] **Step 4: Commit**

```bash
git add src/app/core/models/trace-event.model.ts src/app/core/parsers/format-detector.service.ts src/app/features/upload/upload.component.ts
git commit -m "feat: detect .perflens file format in upload flow"
```

---

### Task 6: Toast Component

**Files:**
- Create: `src/app/shared/components/toast.component.ts`

- [ ] **Step 1: Create ToastComponent**

Create `src/app/shared/components/toast.component.ts`:

```typescript
import { Component, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

let nextId = 0;

@Component({
  selector: 'app-toast',
  standalone: true,
  template: `
    <div class="fixed bottom-4 right-4 z-50 space-y-2">
      @for (toast of toasts(); track toast.id) {
        <div
          class="px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-slide-up"
          [class]="toastClasses(toast.type)"
          role="alert"
        >
          {{ toast.message }}
        </div>
      }
    </div>
  `,
  styles: [`
    @keyframes slide-up {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-slide-up { animation: slide-up 0.2s ease-out; }
  `],
})
export class ToastComponent {
  readonly toasts = signal<Toast[]>([]);

  show(message: string, type: Toast['type'] = 'success', duration = 3000): void {
    const id = nextId++;
    this.toasts.update(t => [...t, { id, message, type }]);
    setTimeout(() => {
      this.toasts.update(t => t.filter(toast => toast.id !== id));
    }, duration);
  }

  toastClasses(type: Toast['type']): string {
    switch (type) {
      case 'success': return 'bg-emerald-600 text-white';
      case 'error': return 'bg-red-600 text-white';
      case 'info': return 'bg-blue-600 text-white';
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/shared/components/toast.component.ts
git commit -m "feat: add lightweight Toast component"
```

---

### Task 7: Recent Sessions Component (Upload Page)

**Files:**
- Create: `src/app/features/upload/recent-sessions.component.ts`
- Create: `src/app/features/upload/recent-sessions.component.spec.ts`
- Modify: `src/app/features/upload/upload.component.ts`

- [ ] **Step 1: Write failing test for RecentSessionsComponent**

Create `src/app/features/upload/recent-sessions.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RecentSessionsComponent } from './recent-sessions.component';
import { SavedSession } from '../../core/models/session-history.model';

describe('RecentSessionsComponent', () => {
  let component: RecentSessionsComponent;
  let fixture: ComponentFixture<RecentSessionsComponent>;

  const mockSessions: SavedSession[] = [
    {
      id: '1',
      fileName: 'trace.json',
      fileSize: 1024,
      format: 'perf-trace',
      analyzedAt: '2026-07-21T12:00:00Z',
      metrics: [{ name: 'LCP', shortName: 'LCP', value: 2000, displayValue: '2.0s', unit: 'ms', rating: 'good' }],
      actionItems: [],
      rawDataStored: false,
    },
    {
      id: '2',
      fileName: 'heap.heapsnapshot',
      fileSize: 5000000,
      format: 'heap-snapshot',
      analyzedAt: '2026-07-20T10:00:00Z',
      metrics: [],
      actionItems: [{ id: 'a1', severity: 'critical', title: 'Leak', detail: '', metric: 'MEMORY', fix: '' }],
      rawDataStored: false,
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecentSessionsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RecentSessionsComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('sessions', mockSessions);
    fixture.detectChanges();
  });

  it('should render session cards', () => {
    const cards = fixture.nativeElement.querySelectorAll('[data-testid="session-card"]');
    expect(cards.length).toBe(2);
  });

  it('should display file name on cards', () => {
    const cards = fixture.nativeElement.querySelectorAll('[data-testid="session-card"]');
    expect(cards[0].textContent).toContain('trace.json');
    expect(cards[1].textContent).toContain('heap.heapsnapshot');
  });

  it('should emit sessionSelect on card click', () => {
    const spy = vi.spyOn(component.sessionSelect, 'emit');
    const card = fixture.nativeElement.querySelector('[data-testid="session-card"]');
    card.click();
    expect(spy).toHaveBeenCalledWith(mockSessions[0]);
  });

  it('should emit sessionDelete on trash button click', () => {
    const spy = vi.spyOn(component.sessionDelete, 'emit');
    const btn = fixture.nativeElement.querySelector('[data-testid="delete-session"]');
    btn.click();
    expect(spy).toHaveBeenCalledWith('1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/features/upload/recent-sessions.component.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement RecentSessionsComponent**

Create `src/app/features/upload/recent-sessions.component.ts`:

```typescript
import { Component, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { SavedSession } from '../../core/models/session-history.model';

@Component({
  selector: 'app-recent-sessions',
  standalone: true,
  imports: [DatePipe],
  template: `
    @if (sessions().length > 0) {
      <div class="mt-8 max-w-lg w-full">
        <h2 class="text-gray-400 text-sm font-medium mb-3">Recent Analyses</h2>
        <div class="space-y-2">
          @for (session of sessions(); track session.id) {
            <div
              data-testid="session-card"
              class="bg-[#1a1f2e] rounded-lg px-4 py-3 cursor-pointer hover:bg-[#252b3b] transition-colors
                     flex items-center justify-between group"
              (click)="sessionSelect.emit(session)"
            >
              <div class="flex items-center gap-3 min-w-0">
                <span class="text-lg flex-shrink-0">{{ formatIcon(session.format) }}</span>
                <div class="min-w-0">
                  <div class="text-gray-200 text-sm font-medium truncate">{{ session.fileName }}</div>
                  <div class="text-gray-500 text-xs flex items-center gap-2">
                    <span>{{ session.analyzedAt | date:'MMM d, h:mm a' }}</span>
                    @if (session.metrics.length > 0) {
                      <span class="text-gray-600">·</span>
                      <span [class]="metricColor(session.metrics[0].rating)">
                        {{ session.metrics[0].shortName }}: {{ session.metrics[0].displayValue }}
                      </span>
                    }
                  </div>
                </div>
              </div>
              <button
                data-testid="delete-session"
                class="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1"
                (click)="onDelete($event, session.id)"
                aria-label="Delete session"
              >
                🗑
              </button>
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class RecentSessionsComponent {
  sessions = input.required<SavedSession[]>();
  sessionSelect = output<SavedSession>();
  sessionDelete = output<string>();

  formatIcon(format: string): string {
    switch (format) {
      case 'perf-trace': return '📊';
      case 'heap-snapshot': return '🧠';
      case 'cpu-profile': return '⚡';
      default: return '📁';
    }
  }

  metricColor(rating: string): string {
    switch (rating) {
      case 'good': return 'text-green-400';
      case 'needs-improvement': return 'text-amber-400';
      case 'poor': return 'text-red-400';
      default: return 'text-gray-400';
    }
  }

  onDelete(event: MouseEvent, id: string): void {
    event.stopPropagation();
    this.sessionDelete.emit(id);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/features/upload/recent-sessions.component.spec.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Integrate into UploadComponent**

In `src/app/features/upload/upload.component.ts`:

Add imports at the top:

```typescript
import { RecentSessionsComponent } from './recent-sessions.component';
import { SessionHistoryService } from '../../core/services/session-history.service';
import { ShareService } from '../../core/services/share.service';
import { SavedSession } from '../../core/models/session-history.model';
import { SHARE_HASH_PREFIX } from '../../core/models/share.model';
```

Update the `imports` array in `@Component`:

```typescript
imports: [RecentSessionsComponent],
```

Add after the privacy badges `</div>` (after line 74, before the closing `</div>` on line 75):

```html
<app-recent-sessions
  [sessions]="recentSessions()"
  (sessionSelect)="onSessionSelect($event)"
  (sessionDelete)="onSessionDelete($event)"
/>
```

Add to the component class:

```typescript
private readonly historyService = inject(SessionHistoryService);
private readonly shareService = inject(ShareService);

recentSessions = signal<SavedSession[]>([]);

constructor() {
  this.loadRecentSessions();
  this.checkShareUrl();
}

private async loadRecentSessions(): Promise<void> {
  try {
    const sessions = await this.historyService.list();
    this.recentSessions.set(sessions);
  } catch {
    // IndexedDB unavailable — silently continue
  }
}

async onSessionSelect(session: SavedSession): Promise<void> {
  this.traceStore.storeFromSession(session);
  this.router.navigate(['/dashboard']);
}

async onSessionDelete(id: string): Promise<void> {
  await this.historyService.delete(id);
  await this.loadRecentSessions();
}

private async checkShareUrl(): Promise<void> {
  const hash = location.hash;
  if (!hash.startsWith(SHARE_HASH_PREFIX)) return;

  this.isProcessing.set(true);
  try {
    const payload = await this.shareService.decode(hash);
    this.traceStore.store([{
      name: payload.fn,
      size: payload.fs,
      format: payload.fmt,
      content: null,
    }]);
    // Clear hash to avoid re-processing on navigation
    history.replaceState(null, '', location.pathname);
    this.router.navigate(['/dashboard'], {
      state: { sharedPayload: payload },
    });
  } catch (e) {
    console.error('Failed to decode share URL:', e);
    this.error.set('Invalid share link. The data may be corrupted or from an incompatible version.');
    this.isProcessing.set(false);
    history.replaceState(null, '', location.pathname);
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/app/features/upload/recent-sessions.component.ts src/app/features/upload/recent-sessions.component.spec.ts src/app/features/upload/upload.component.ts
git commit -m "feat: add Recent Sessions to upload page with share URL import"
```

---

### Task 8: Share Dialog Component

**Files:**
- Create: `src/app/features/dashboard/share-dialog.component.ts`
- Create: `src/app/features/dashboard/share-dialog.component.spec.ts`

- [ ] **Step 1: Write failing test for ShareDialogComponent**

Create `src/app/features/dashboard/share-dialog.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShareDialogComponent } from './share-dialog.component';
import { ShareService } from '../../core/services/share.service';
import { AnalysisResult } from '../../core/models/analysis-result.model';

const mockResult: AnalysisResult = {
  fileName: 'trace.json',
  fileSize: 1024,
  analyzedAt: new Date('2026-07-21T12:00:00Z'),
  metrics: [{ name: 'LCP', shortName: 'LCP', value: 2000, displayValue: '2.0s', unit: 'ms', rating: 'good' }],
  actionItems: [],
  parsedTrace: { traceEvents: [], metadata: { traceStartTime: 0, traceEndTime: 0 }, mainThreadId: 0, navigationStart: 0 },
};

describe('ShareDialogComponent', () => {
  let component: ShareDialogComponent;
  let fixture: ComponentFixture<ShareDialogComponent>;
  let mockShareService: { encode: ReturnType<typeof vi.fn>; downloadPerflensFile: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockShareService = {
      encode: vi.fn().mockResolvedValue({ url: 'http://localhost/#share=abc', tooLarge: false }),
      downloadPerflensFile: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [ShareDialogComponent],
      providers: [{ provide: ShareService, useValue: mockShareService }],
    }).compileComponents();

    fixture = TestBed.createComponent(ShareDialogComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('result', mockResult);
    fixture.componentRef.setInput('fileFormat', 'perf-trace');
    fixture.detectChanges();
  });

  it('should render the dialog', () => {
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it('should call encode on init and show copy button', async () => {
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mockShareService.encode).toHaveBeenCalledWith(mockResult, 'perf-trace');
    expect(fixture.nativeElement.querySelector('[data-testid="copy-link"]')).toBeTruthy();
  });

  it('should show download-only when tooLarge', async () => {
    mockShareService.encode.mockResolvedValue({ url: null, tooLarge: true });
    fixture = TestBed.createComponent(ShareDialogComponent);
    fixture.componentRef.setInput('result', mockResult);
    fixture.componentRef.setInput('fileFormat', 'perf-trace');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="copy-link"]')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('[data-testid="too-large-msg"]')).toBeTruthy();
  });

  it('should emit close on backdrop click', () => {
    const spy = vi.spyOn(component.close, 'emit');
    const backdrop = fixture.nativeElement.querySelector('[role="dialog"]');
    backdrop.click();
    expect(spy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/features/dashboard/share-dialog.component.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ShareDialogComponent**

Create `src/app/features/dashboard/share-dialog.component.ts`:

```typescript
import { Component, inject, input, output, signal, OnInit, ElementRef, viewChild, afterNextRender } from '@angular/core';
import { ShareService } from '../../core/services/share.service';
import { AnalysisResult } from '../../core/models/analysis-result.model';

@Component({
  selector: 'app-share-dialog',
  standalone: true,
  template: `
    <div
      #dialogBackdrop
      class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      (click)="onBackdropClick($event)"
      (keydown.escape)="close.emit()"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-label="Share analysis"
    >
      <div class="bg-[#161b26] rounded-xl p-6 w-full max-w-md shadow-xl border border-gray-800">
        <h2 class="text-lg font-semibold text-white mb-4">Share Analysis</h2>

        @if (loading()) {
          <div class="text-gray-400 animate-pulse py-4 text-center">Generating link...</div>
        } @else {
          <div class="space-y-3">
            @if (shareUrl()) {
              <div class="bg-[#1a1f2e] rounded-lg p-3">
                <div class="text-gray-400 text-xs mb-2 truncate font-mono">{{ shareUrl() }}</div>
                <button
                  data-testid="copy-link"
                  class="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2.5 font-medium transition-colors"
                  (click)="copyLink()"
                >
                  {{ copied() ? '✅ Copied!' : '📋 Copy Link' }}
                </button>
              </div>
            }

            @if (tooLarge()) {
              <div data-testid="too-large-msg" class="bg-amber-500/10 text-amber-400 text-sm rounded-lg p-3">
                Analysis is too large for a URL. Download the .perflens file to share instead.
              </div>
            }

            <button
              data-testid="download-perflens"
              class="w-full bg-[#1a1f2e] hover:bg-[#252b3b] border border-gray-700 rounded-lg p-3 text-left transition-colors"
              (click)="downloadFile()"
            >
              <div class="text-white font-medium text-sm">⬇ Download .perflens file</div>
              <div class="text-gray-500 text-xs mt-0.5">Importable file for sharing offline</div>
            </button>
          </div>

          <button
            class="mt-4 w-full text-gray-400 hover:text-white text-sm py-2 transition-colors"
            (click)="close.emit()"
          >
            Close
          </button>
        }
      </div>
    </div>
  `,
})
export class ShareDialogComponent implements OnInit {
  private readonly shareService = inject(ShareService);
  private readonly dialogBackdrop = viewChild<ElementRef<HTMLDivElement>>('dialogBackdrop');

  result = input.required<AnalysisResult>();
  fileFormat = input.required<string>();
  close = output<void>();

  loading = signal(true);
  shareUrl = signal<string | null>(null);
  tooLarge = signal(false);
  copied = signal(false);

  constructor() {
    afterNextRender(() => {
      this.dialogBackdrop()?.nativeElement.focus();
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      const encoded = await this.shareService.encode(this.result(), this.fileFormat());
      this.shareUrl.set(encoded.url);
      this.tooLarge.set(encoded.tooLarge);
    } catch {
      this.tooLarge.set(true);
    }
    this.loading.set(false);
  }

  async copyLink(): Promise<void> {
    const url = this.shareUrl();
    if (!url) return;
    await navigator.clipboard.writeText(url);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  downloadFile(): void {
    this.shareService.downloadPerflensFile(this.result(), this.fileFormat());
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close.emit();
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/features/dashboard/share-dialog.component.spec.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/features/dashboard/share-dialog.component.ts src/app/features/dashboard/share-dialog.component.spec.ts
git commit -m "feat: add ShareDialogComponent with copy link and .perflens download"
```

---

### Task 9: Compare Picker Component

**Files:**
- Create: `src/app/features/dashboard/compare-picker.component.ts`
- Create: `src/app/features/dashboard/compare-picker.component.spec.ts`

- [ ] **Step 1: Write failing test for ComparePickerComponent**

Create `src/app/features/dashboard/compare-picker.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ComparePickerComponent } from './compare-picker.component';
import { SavedSession } from '../../core/models/session-history.model';

const mockSessions: SavedSession[] = [
  {
    id: '1',
    fileName: 'baseline.json',
    fileSize: 1024,
    format: 'perf-trace',
    analyzedAt: '2026-07-20T10:00:00Z',
    metrics: [{ name: 'LCP', shortName: 'LCP', value: 2500, displayValue: '2.5s', unit: 'ms', rating: 'needs-improvement' }],
    actionItems: [],
    rawDataStored: false,
  },
  {
    id: '2',
    fileName: 'old-trace.json',
    fileSize: 2048,
    format: 'perf-trace',
    analyzedAt: '2026-07-19T08:00:00Z',
    metrics: [],
    actionItems: [],
    rawDataStored: false,
  },
];

describe('ComparePickerComponent', () => {
  let component: ComparePickerComponent;
  let fixture: ComponentFixture<ComparePickerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ComparePickerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ComparePickerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('sessions', mockSessions);
    fixture.detectChanges();
  });

  it('should render session options', () => {
    const options = fixture.nativeElement.querySelectorAll('[data-testid="compare-option"]');
    expect(options.length).toBe(2);
  });

  it('should emit sessionSelect on click', () => {
    const spy = vi.spyOn(component.sessionSelect, 'emit');
    const option = fixture.nativeElement.querySelector('[data-testid="compare-option"]');
    option.click();
    expect(spy).toHaveBeenCalledWith(mockSessions[0]);
  });

  it('should emit close on backdrop click', () => {
    const spy = vi.spyOn(component.close, 'emit');
    const backdrop = fixture.nativeElement.querySelector('[role="dialog"]');
    backdrop.click();
    expect(spy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/features/dashboard/compare-picker.component.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ComparePickerComponent**

Create `src/app/features/dashboard/compare-picker.component.ts`:

```typescript
import { Component, input, output, ElementRef, viewChild, afterNextRender } from '@angular/core';
import { DatePipe } from '@angular/common';
import { SavedSession } from '../../core/models/session-history.model';

@Component({
  selector: 'app-compare-picker',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div
      #dialogBackdrop
      class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      (click)="onBackdropClick($event)"
      (keydown.escape)="close.emit()"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-label="Select baseline for comparison"
    >
      <div class="bg-[#161b26] rounded-xl p-6 w-full max-w-md shadow-xl border border-gray-800 max-h-[70vh] overflow-y-auto">
        <h2 class="text-lg font-semibold text-white mb-1">Compare with...</h2>
        <p class="text-gray-500 text-sm mb-4">Select a previous analysis as the baseline</p>

        @if (sessions().length === 0) {
          <div class="text-gray-500 text-sm text-center py-8">
            No saved sessions of this format to compare against.
          </div>
        } @else {
          <div class="space-y-2">
            @for (session of sessions(); track session.id) {
              <button
                data-testid="compare-option"
                class="w-full bg-[#1a1f2e] hover:bg-[#252b3b] border border-gray-700 rounded-lg p-3 text-left transition-colors"
                (click)="sessionSelect.emit(session)"
              >
                <div class="text-gray-200 text-sm font-medium">{{ session.fileName }}</div>
                <div class="text-gray-500 text-xs mt-1 flex items-center gap-2">
                  <span>{{ session.analyzedAt | date:'MMM d, h:mm a' }}</span>
                  @if (session.metrics.length > 0) {
                    <span class="text-gray-600">·</span>
                    @for (metric of session.metrics.slice(0, 3); track metric.shortName) {
                      <span class="text-gray-400">{{ metric.shortName }}: {{ metric.displayValue }}</span>
                    }
                  }
                </div>
              </button>
            }
          </div>
        }

        <button
          class="mt-4 w-full text-gray-400 hover:text-white text-sm py-2 transition-colors"
          (click)="close.emit()"
        >
          Cancel
        </button>
      </div>
    </div>
  `,
})
export class ComparePickerComponent {
  private readonly dialogBackdrop = viewChild<ElementRef<HTMLDivElement>>('dialogBackdrop');

  sessions = input.required<SavedSession[]>();
  sessionSelect = output<SavedSession>();
  close = output<void>();

  constructor() {
    afterNextRender(() => {
      this.dialogBackdrop()?.nativeElement.focus();
    });
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close.emit();
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/features/dashboard/compare-picker.component.spec.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/features/dashboard/compare-picker.component.ts src/app/features/dashboard/compare-picker.component.spec.ts
git commit -m "feat: add ComparePickerComponent for baseline session selection"
```

---

### Task 10: Trace Comparison Tab Component

**Files:**
- Create: `src/app/features/dashboard/trace-comparison.component.ts`
- Create: `src/app/features/dashboard/trace-comparison.component.spec.ts`

- [ ] **Step 1: Write failing test for TraceComparisonComponent**

Create `src/app/features/dashboard/trace-comparison.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TraceComparisonComponent } from './trace-comparison.component';
import { TraceComparison } from '../../core/models/trace-comparison.model';
import { AnalysisResult } from '../../core/models/analysis-result.model';

const EMPTY_TRACE = {
  traceEvents: [],
  metadata: { traceStartTime: 0, traceEndTime: 0 },
  mainThreadId: 0,
  navigationStart: 0,
};

const makeResult = (overrides: Partial<AnalysisResult> = {}): AnalysisResult => ({
  fileName: 'trace.json',
  fileSize: 1024,
  analyzedAt: new Date(),
  metrics: [],
  actionItems: [],
  parsedTrace: EMPTY_TRACE,
  ...overrides,
});

const mockComparison: TraceComparison = {
  current: makeResult({ fileName: 'current.json' }),
  baseline: makeResult({ fileName: 'baseline.json' }),
  metricDiffs: [
    {
      name: 'Largest Contentful Paint',
      shortName: 'LCP',
      current: { name: 'LCP', shortName: 'LCP', value: 1500, displayValue: '1.5s', unit: 'ms', rating: 'good' },
      baseline: { name: 'LCP', shortName: 'LCP', value: 2000, displayValue: '2.0s', unit: 'ms', rating: 'good' },
      delta: -500,
      deltaPercent: -25,
      improved: true,
    },
    {
      name: 'Total Blocking Time',
      shortName: 'TBT',
      current: { name: 'TBT', shortName: 'TBT', value: 400, displayValue: '400ms', unit: 'ms', rating: 'needs-improvement' },
      baseline: { name: 'TBT', shortName: 'TBT', value: 200, displayValue: '200ms', unit: 'ms', rating: 'good' },
      delta: 200,
      deltaPercent: 100,
      improved: false,
    },
  ],
  newActionItems: [{ id: 'new-1', severity: 'warning', title: 'New Issue', detail: '', metric: 'TBT', fix: '' }],
  resolvedActionItems: [{ id: 'old-1', severity: 'critical', title: 'Fixed Issue', detail: '', metric: 'LCP', fix: '' }],
  unchangedActionItems: [{ id: 'same-1', severity: 'info', title: 'Same Issue', detail: '', metric: 'CLS', fix: '' }],
};

describe('TraceComparisonComponent', () => {
  let fixture: ComponentFixture<TraceComparisonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TraceComparisonComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TraceComparisonComponent);
    fixture.componentRef.setInput('comparison', mockComparison);
    fixture.detectChanges();
  });

  it('should render metric diff cards', () => {
    const cards = fixture.nativeElement.querySelectorAll('[data-testid="metric-diff-card"]');
    expect(cards.length).toBe(2);
  });

  it('should show improvement indicator for improved metrics', () => {
    const cards = fixture.nativeElement.querySelectorAll('[data-testid="metric-diff-card"]');
    expect(cards[0].textContent).toContain('↓');
    expect(cards[0].textContent).toContain('25%');
  });

  it('should show regression indicator for regressed metrics', () => {
    const cards = fixture.nativeElement.querySelectorAll('[data-testid="metric-diff-card"]');
    expect(cards[1].textContent).toContain('↑');
    expect(cards[1].textContent).toContain('100%');
  });

  it('should render new, resolved, and unchanged action item sections', () => {
    const el = fixture.nativeElement;
    expect(el.querySelector('[data-testid="new-items"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="resolved-items"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="unchanged-items"]')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/features/dashboard/trace-comparison.component.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement TraceComparisonComponent**

Create `src/app/features/dashboard/trace-comparison.component.ts`:

```typescript
import { Component, input } from '@angular/core';
import { TraceComparison, MetricDiff } from '../../core/models/trace-comparison.model';
import { SeverityBadgeComponent } from '../../shared/components/severity-badge.component';

@Component({
  selector: 'app-trace-comparison',
  standalone: true,
  imports: [SeverityBadgeComponent],
  template: `
    <div class="space-y-6">
      <!-- Metric Diffs -->
      <div>
        <h3 class="text-lg font-semibold text-gray-200 mb-3">Metric Changes</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          @for (diff of comparison().metricDiffs; track diff.shortName) {
            <div
              data-testid="metric-diff-card"
              class="bg-[#1a1f2e] rounded-lg p-4 border-l-[3px]"
              [class]="diffBorderClass(diff)"
            >
              <div class="text-gray-400 text-xs uppercase tracking-wide">{{ diff.shortName }}</div>
              <div class="flex items-baseline gap-2 mt-1">
                <span class="text-xl font-bold text-white">{{ diff.current.displayValue }}</span>
                <span class="text-gray-500 text-sm">from {{ diff.baseline.displayValue }}</span>
              </div>
              <div class="mt-2" [class]="deltaTextClass(diff)">
                <span class="text-sm font-semibold">
                  {{ diff.improved ? '↓' : '↑' }} {{ absDeltaPercent(diff) }}%
                </span>
                <span class="text-xs ml-1">
                  ({{ diff.delta > 0 ? '+' : '' }}{{ formatDelta(diff) }})
                </span>
              </div>
            </div>
          }
        </div>
        @if (comparison().metricDiffs.length === 0) {
          <div class="text-gray-500 text-sm">No comparable metrics found.</div>
        }
      </div>

      <!-- Comparison header -->
      <div class="text-gray-500 text-sm flex items-center gap-2">
        <span>{{ comparison().current.fileName }}</span>
        <span>vs</span>
        <span>{{ comparison().baseline.fileName }}</span>
      </div>

      <!-- New Issues -->
      @if (comparison().newActionItems.length > 0) {
        <div data-testid="new-items">
          <h3 class="text-lg font-semibold text-red-400 mb-3">
            🆕 New Issues ({{ comparison().newActionItems.length }})
          </h3>
          <div class="space-y-2">
            @for (item of comparison().newActionItems; track item.id) {
              <div class="bg-[#1a1f2e] border-l-[3px] border-red-500 rounded-lg px-4 py-3 flex items-center gap-2">
                <app-severity-badge [severity]="item.severity" />
                <span class="text-gray-200 text-sm">{{ item.title }}</span>
                <span class="ml-auto text-gray-500 text-xs px-2 py-0.5 bg-gray-800 rounded">{{ item.metric }}</span>
              </div>
            }
          </div>
        </div>
      }

      <!-- Resolved -->
      @if (comparison().resolvedActionItems.length > 0) {
        <div data-testid="resolved-items">
          <h3 class="text-lg font-semibold text-green-400 mb-3">
            ✅ Resolved ({{ comparison().resolvedActionItems.length }})
          </h3>
          <div class="space-y-2">
            @for (item of comparison().resolvedActionItems; track item.id) {
              <div class="bg-[#1a1f2e] border-l-[3px] border-green-500 rounded-lg px-4 py-3 flex items-center gap-2 opacity-70">
                <app-severity-badge [severity]="item.severity" />
                <span class="text-gray-200 text-sm line-through">{{ item.title }}</span>
                <span class="ml-auto text-gray-500 text-xs px-2 py-0.5 bg-gray-800 rounded">{{ item.metric }}</span>
              </div>
            }
          </div>
        </div>
      }

      <!-- Unchanged -->
      @if (comparison().unchangedActionItems.length > 0) {
        <div data-testid="unchanged-items">
          <h3 class="text-lg font-semibold text-gray-400 mb-3">
            ➡️ Unchanged ({{ comparison().unchangedActionItems.length }})
          </h3>
          <div class="space-y-2">
            @for (item of comparison().unchangedActionItems; track item.id) {
              <div class="bg-[#1a1f2e] border-l-[3px] border-gray-600 rounded-lg px-4 py-3 flex items-center gap-2">
                <app-severity-badge [severity]="item.severity" />
                <span class="text-gray-200 text-sm">{{ item.title }}</span>
                <span class="ml-auto text-gray-500 text-xs px-2 py-0.5 bg-gray-800 rounded">{{ item.metric }}</span>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class TraceComparisonComponent {
  comparison = input.required<TraceComparison>();

  diffBorderClass(diff: MetricDiff): string {
    if (Math.abs(diff.deltaPercent) < 1) return 'border-gray-600';
    return diff.improved ? 'border-green-500' : 'border-red-500';
  }

  deltaTextClass(diff: MetricDiff): string {
    if (Math.abs(diff.deltaPercent) < 1) return 'text-gray-500';
    return diff.improved ? 'text-green-400' : 'text-red-400';
  }

  absDeltaPercent(diff: MetricDiff): number {
    return Math.abs(diff.deltaPercent);
  }

  formatDelta(diff: MetricDiff): string {
    const unit = diff.current.unit;
    if (unit === 'ms') {
      return `${diff.delta > 0 ? '+' : ''}${diff.delta}ms`;
    }
    return `${diff.delta > 0 ? '+' : ''}${diff.delta}`;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/features/dashboard/trace-comparison.component.spec.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/features/dashboard/trace-comparison.component.ts src/app/features/dashboard/trace-comparison.component.spec.ts
git commit -m "feat: add TraceComparisonComponent with metric diffs and action item changes"
```

---

### Task 11: Score Cards — Delta Indicators

**Files:**
- Modify: `src/app/features/dashboard/score-cards.component.ts`

- [ ] **Step 1: Add delta indicators to ScoreCardsComponent**

Replace the full content of `src/app/features/dashboard/score-cards.component.ts`:

```typescript
import { Component, input } from '@angular/core';
import { MetricScore, Rating } from '../../core/models/metric-score.model';
import { MetricDiff } from '../../core/models/trace-comparison.model';

@Component({
  selector: 'app-score-cards',
  standalone: true,
  template: `
    <div class="flex gap-3 flex-wrap">
      @for (metric of metrics(); track metric.shortName) {
        <div
          data-testid="metric-card"
          class="flex-1 min-w-[120px] rounded-lg p-4 text-center"
          [class]="cardClasses(metric.rating)"
        >
          <div class="text-gray-400 text-xs uppercase tracking-wide">{{ metric.shortName }}</div>
          <div class="text-2xl font-bold mt-1" [class]="valueColor(metric.rating)">
            {{ metric.displayValue }}
          </div>
          @if (getDiff(metric.shortName); as diff) {
            <div class="text-xs mt-1 font-semibold" [class]="diff.improved ? 'text-green-400' : 'text-red-400'">
              {{ diff.improved ? '↓' : '↑' }} {{ absDeltaPercent(diff) }}%
            </div>
          } @else {
            <div class="text-gray-500 text-xs mt-1">{{ ratingLabel(metric.rating) }}</div>
          }
        </div>
      }
    </div>
  `,
})
export class ScoreCardsComponent {
  metrics = input.required<MetricScore[]>();
  metricDiffs = input<MetricDiff[]>([]);

  getDiff(shortName: string): MetricDiff | undefined {
    return this.metricDiffs().find(d => d.shortName === shortName);
  }

  absDeltaPercent(diff: MetricDiff): number {
    return Math.abs(diff.deltaPercent);
  }

  cardClasses(rating: Rating): string {
    const base = 'bg-[#1a1f2e] border-l-[3px]';
    switch (rating) {
      case 'good': return `${base} border-green-500`;
      case 'needs-improvement': return `${base} border-amber-500`;
      case 'poor': return `${base} border-red-500`;
    }
  }

  valueColor(rating: Rating): string {
    switch (rating) {
      case 'good': return 'text-green-400';
      case 'needs-improvement': return 'text-amber-400';
      case 'poor': return 'text-red-400';
    }
  }

  ratingLabel(rating: Rating): string {
    switch (rating) {
      case 'good': return 'Good';
      case 'needs-improvement': return 'Needs Work';
      case 'poor': return 'Poor';
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/features/dashboard/score-cards.component.ts
git commit -m "feat: add delta indicators to score cards for comparison mode"
```

---

### Task 12: Dashboard Integration — Wire Everything Together

**Files:**
- Modify: `src/app/features/dashboard/dashboard.component.ts`

This is the largest task — it wires all the new services and components into the dashboard.

- [ ] **Step 1: Update dashboard imports and inject services**

In `src/app/features/dashboard/dashboard.component.ts`, add these imports at the top of the file:

```typescript
import { SessionHistoryService } from '../../core/services/session-history.service';
import { ShareService } from '../../core/services/share.service';
import { TraceComparisonService } from '../../core/services/trace-comparison.service';
import { SavedSession } from '../../core/models/session-history.model';
import { TraceComparison } from '../../core/models/trace-comparison.model';
import { ShareDialogComponent } from './share-dialog.component';
import { ComparePickerComponent } from './compare-picker.component';
import { TraceComparisonComponent } from './trace-comparison.component';
import { ToastComponent } from '../../shared/components/toast.component';
```

Add the new components to the `imports` array in `@Component`:

```typescript
imports: [
  ScoreCardsComponent,
  ActionItemsComponent,
  TabPanelComponent,
  FlamegraphComponent,
  TimelineComponent,
  NetworkWaterfallComponent,
  HeapTreemapComponent,
  HeapBreakdownComponent,
  DetachedDomListComponent,
  CpuFlamechartComponent,
  CpuHotFunctionsComponent,
  CpuDeoptListComponent,
  ExportDialogComponent,
  ShareDialogComponent,
  ComparePickerComponent,
  TraceComparisonComponent,
  ToastComponent,
],
```

- [ ] **Step 2: Update the nav bar template**

Replace the nav bar `<div class="flex items-center gap-4 ...">` section (lines 64-68) with:

```html
<div class="flex items-center gap-4 text-sm text-gray-400">
  @if (comparableSessions().length > 0) {
    <button class="hover:text-white transition-colors" (click)="showComparePicker.set(true)">⚖️ Compare</button>
  }
  <button class="hover:text-white transition-colors" disabled>🤖 AI Dive</button>
  <button class="hover:text-white transition-colors" (click)="showShareDialog.set(true)">Share</button>
  <button class="hover:text-white transition-colors" (click)="showExportDialog.set(true)">Export</button>
</div>
```

- [ ] **Step 3: Update score cards to pass metricDiffs**

Replace the score cards section (lines 73-75) with:

```html
<div id="section-score-cards">
  <app-score-cards [metrics]="r.metrics" [metricDiffs]="comparison()?.metricDiffs ?? []" />
</div>
```

- [ ] **Step 4: Add comparison tab to dashboardTabs computed**

Add the comparison tab to the `dashboardTabs` computed array. Add after the `v8-internals` entry:

```typescript
{ id: 'comparison', label: 'Comparison', icon: '⚖️', disabled: !this.comparison() },
```

- [ ] **Step 5: Add comparison tab panel to the template**

Add after the v8-internals tab panel `</div>` (after line 212):

```html
<div
  id="tab-panel-comparison"
  role="tabpanel"
  aria-labelledby="tab-comparison"
  [hidden]="activeTab() !== 'comparison'"
>
  @if (activeTab() === 'comparison' && comparison()) {
    <app-trace-comparison [comparison]="comparison()!" />
  }
</div>
```

- [ ] **Step 6: Add share/compare dialogs and toast to end of template**

Add after the export dialog block (after line 229):

```html
@if (showShareDialog()) {
  <app-share-dialog
    [result]="result()!"
    [fileFormat]="fileFormat()!"
    (close)="showShareDialog.set(false)"
  />
}

@if (showComparePicker()) {
  <app-compare-picker
    [sessions]="comparableSessions()"
    (sessionSelect)="onCompareSelect($event)"
    (close)="showComparePicker.set(false)"
  />
}

<app-toast #toast />
```

- [ ] **Step 7: Add new signals and methods to the component class**

Add these to the `DashboardComponent` class:

```typescript
private readonly historyService = inject(SessionHistoryService);
private readonly comparisonService = inject(TraceComparisonService);

showShareDialog = signal(false);
showComparePicker = signal(false);
comparison = signal<TraceComparison | null>(null);
comparableSessions = signal<SavedSession[]>([]);
```

Add auto-save logic. At the end of the perf-trace branch in the constructor (after `this.result.set(analysis);` on line 289), add:

```typescript
this.autoSave(analysis, 'perf-trace');
this.loadComparableSessions('perf-trace');
```

At the end of the heap-snapshot effect (after `this.result.set(...)` on line ~328), add:

```typescript
this.autoSave({
  fileName: file.name,
  fileSize: file.size,
  analyzedAt: new Date(),
  metrics,
  actionItems,
  parsedTrace: EMPTY_PARSED_TRACE,
  heapResult: { snapshot },
}, 'heap-snapshot');
this.loadComparableSessions('heap-snapshot');
```

At the end of the cpu-profile effect (after `this.result.set(...)` on line ~384), add:

```typescript
this.autoSave({
  fileName: file.name,
  fileSize: file.size,
  analyzedAt: new Date(),
  metrics,
  actionItems,
  parsedTrace: EMPTY_PARSED_TRACE,
  cpuResult: { profile, comparison },
}, 'cpu-profile');
this.loadComparableSessions('cpu-profile');
```

Add a handler for restored sessions from history. At the start of the constructor, after the `hasFiles()` check, add:

```typescript
const restored = this.traceStore.restoredSession();
if (restored) {
  this.fileFormat.set(restored.format);
  this.activeTab.set('action-items');
  this.result.set({
    fileName: restored.fileName,
    fileSize: restored.fileSize,
    analyzedAt: new Date(restored.analyzedAt),
    metrics: restored.metrics,
    actionItems: restored.actionItems,
    parsedTrace: EMPTY_PARSED_TRACE,
  });
  this.loadComparableSessions(restored.format);
  return;
}
```

Also add a handler for shared payloads. Right after the restored session block:

```typescript
const nav = this.router.getCurrentNavigation();
const sharedPayload = nav?.extras?.state?.['sharedPayload'];
if (sharedPayload) {
  this.fileFormat.set(sharedPayload.fmt as 'perf-trace' | 'heap-snapshot' | 'cpu-profile');
  this.activeTab.set('action-items');
  this.result.set({
    fileName: sharedPayload.fn,
    fileSize: sharedPayload.fs,
    analyzedAt: new Date(sharedPayload.at),
    metrics: sharedPayload.m,
    actionItems: sharedPayload.ai,
    parsedTrace: EMPTY_PARSED_TRACE,
  });
  return;
}
```

Add helper methods:

```typescript
private async autoSave(result: AnalysisResult, format: 'perf-trace' | 'heap-snapshot' | 'cpu-profile'): Promise<void> {
  try {
    await this.historyService.save(result, format);
  } catch {
    // IndexedDB unavailable — silently continue
  }
}

private async loadComparableSessions(format: string): Promise<void> {
  try {
    const sessions = await this.historyService.list();
    this.comparableSessions.set(
      sessions.filter(s => s.format === format && s.fileName !== this.result()?.fileName),
    );
  } catch {
    this.comparableSessions.set([]);
  }
}

onCompareSelect(session: SavedSession): void {
  this.showComparePicker.set(false);
  const current = this.result();
  if (!current) return;

  const baseline: AnalysisResult = {
    fileName: session.fileName,
    fileSize: session.fileSize,
    analyzedAt: new Date(session.analyzedAt),
    metrics: session.metrics,
    actionItems: session.actionItems,
    parsedTrace: EMPTY_PARSED_TRACE,
  };

  const comp = this.comparisonService.compare(current, baseline);
  this.comparison.set(comp);
  this.activeTab.set('comparison');
}
```

- [ ] **Step 8: Commit**

```bash
git add src/app/features/dashboard/dashboard.component.ts
git commit -m "feat: wire session history, share, and comparison into dashboard"
```

---

### Task 13: Full Test Suite Verification

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (existing + new)

- [ ] **Step 2: Run the build**

Run: `npx ng build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Fix any failing tests or build errors**

Address any issues that arise.

- [ ] **Step 4: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix: address test and build issues"
```
