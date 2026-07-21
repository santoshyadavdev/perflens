import { TestBed } from '@angular/core/testing';
import { SessionHistoryService } from './session-history.service';
import { SavedSession } from '../models/session-history.model';
import { AnalysisResult } from '../models/analysis-result.model';
import { ParsedTrace } from '../models/trace-event.model';

import 'fake-indexeddb/auto';

const STUB_TRACE: ParsedTrace = {
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
    parsedTrace: STUB_TRACE,
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
    // Use a unique DB name per test to avoid cleanup/connection issues
    service._resetForTesting(`perflens-test-${crypto.randomUUID()}`);
  });

  it('should save and list sessions', async () => {
    const id = await service.save(
      makeResult({
        metrics: [
          { name: 'LCP', shortName: 'LCP', value: 2000, displayValue: '2.0s', unit: 'ms', rating: 'good' },
        ],
      }),
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
      makeResult({
        fileName: 'heap.heapsnapshot',
        fileSize: 2048,
        actionItems: [
          { id: 'a1', severity: 'critical', title: 'Leak', detail: 'Detail', metric: 'MEMORY', fix: 'Fix' },
        ],
      }),
      'heap-snapshot',
    );

    const session = await service.load(id);
    expect(session).not.toBeNull();
    expect(session!.fileName).toBe('heap.heapsnapshot');
    expect(session!.actionItems).toHaveLength(1);
  });

  it('should delete a session', async () => {
    const id = await service.save(makeResult(), 'perf-trace');

    await service.delete(id);
    const sessions = await service.list();
    expect(sessions).toHaveLength(0);
  });

  it('should auto-evict oldest when exceeding max sessions', async () => {
    for (let i = 0; i < 11; i++) {
      await service.save(
        makeResult({
          fileName: `trace-${i}.json`,
          analyzedAt: new Date(Date.now() + i * 1000),
        }),
        'perf-trace',
      );
    }

    const sessions = await service.list();
    expect(sessions).toHaveLength(10);
    expect(sessions.find(s => s.fileName === 'trace-0.json')).toBeUndefined();
    expect(sessions.find(s => s.fileName === 'trace-10.json')).toBeDefined();
  });

  it('should save and load raw data when opted in', async () => {
    const rawData = { traceEvents: [{ name: 'test', ph: 'X', ts: 0, pid: 1, tid: 1, cat: '' }] };
    const id = await service.save(makeResult(), 'perf-trace', rawData);

    const session = await service.load(id);
    expect(session!.rawDataStored).toBe(true);

    const raw = await service.loadRaw(id);
    expect(raw).toEqual(rawData);
  });

  it('should return null for loadRaw when no raw data stored', async () => {
    const id = await service.save(makeResult(), 'perf-trace');

    const raw = await service.loadRaw(id);
    expect(raw).toBeNull();
  });

  it('should list sessions sorted by analyzedAt descending', async () => {
    await service.save(
      makeResult({ fileName: 'old.json', analyzedAt: new Date('2026-01-01') }),
      'perf-trace',
    );
    await service.save(
      makeResult({ fileName: 'new.json', analyzedAt: new Date('2026-07-01') }),
      'perf-trace',
    );

    const sessions = await service.list();
    expect(sessions[0].fileName).toBe('new.json');
    expect(sessions[1].fileName).toBe('old.json');
  });
});
