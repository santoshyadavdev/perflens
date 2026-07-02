import { TestBed } from '@angular/core/testing';
import { RuleEngineService } from './rule-engine.service';
import { PerfTraceParserService } from '../parsers/perf-trace-parser.service';
import sampleTrace from '../../../test-fixtures/sample-trace.json';

describe('RuleEngineService', () => {
  let engine: RuleEngineService;
  let parser: PerfTraceParserService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    engine = TestBed.inject(RuleEngineService);
    parser = TestBed.inject(PerfTraceParserService);
  });

  it('runs all registered rules and collects results', () => {
    const parsed = parser.parse(sampleTrace);
    const result = engine.analyze(parsed, 'test-trace.json', 1024);

    expect(result.fileName).toBe('test-trace.json');
    expect(result.actionItems.length).toBeGreaterThan(0);
    expect(result.metrics.length).toBeGreaterThan(0);
  });

  it('sorts action items by severity (critical first)', () => {
    const parsed = parser.parse(sampleTrace);
    const result = engine.analyze(parsed, 'test.json', 1024);
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    for (let i = 1; i < result.actionItems.length; i++) {
      const prev = severityOrder[result.actionItems[i - 1].severity];
      const curr = severityOrder[result.actionItems[i].severity];
      expect(prev).toBeLessThanOrEqual(curr);
    }
  });

  it('deduplicates action item IDs', () => {
    const parsed = parser.parse(sampleTrace);
    const result = engine.analyze(parsed, 'test.json', 1024);
    const ids = result.actionItems.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
