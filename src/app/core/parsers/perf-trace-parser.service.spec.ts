import { TestBed } from '@angular/core/testing';
import { PerfTraceParserService } from './perf-trace-parser.service';
import sampleTrace from '../../../test-fixtures/sample-trace.json';

describe('PerfTraceParserService', () => {
  let service: PerfTraceParserService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PerfTraceParserService);
  });

  it('parses traceEvents from object format', () => {
    const result = service.parse(sampleTrace);
    expect(result.traceEvents.length).toBeGreaterThan(0);
  });

  it('parses traceEvents from array format', () => {
    const result = service.parse(sampleTrace.traceEvents);
    expect(result.traceEvents.length).toBeGreaterThan(0);
  });

  it('identifies the main thread', () => {
    const result = service.parse(sampleTrace);
    expect(result.mainThreadId).toBe(2);
  });

  it('extracts navigation start timestamp', () => {
    const result = service.parse(sampleTrace);
    expect(result.navigationStart).toBe(1000000);
  });

  it('computes LCP in milliseconds from navigation start', () => {
    const result = service.parse(sampleTrace);
    const lcpMs = (5200000 - result.navigationStart) / 1000;
    expect(lcpMs).toBe(4200);
  });

  it('finds long tasks (>50ms)', () => {
    const result = service.parse(sampleTrace);
    const longTasks = result.traceEvents.filter(
      e => e.tid === result.mainThreadId &&
           e.ph === 'X' &&
           (e.dur ?? 0) > 50000
    );
    expect(longTasks.length).toBeGreaterThanOrEqual(2);
  });
});
