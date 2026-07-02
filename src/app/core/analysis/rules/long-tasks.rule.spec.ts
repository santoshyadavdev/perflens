import { LongTasksRule } from './long-tasks.rule';
import { PerfTraceParserService } from '../../parsers/perf-trace-parser.service';
import { TestBed } from '@angular/core/testing';
import sampleTrace from '../../../../test-fixtures/sample-trace.json';

describe('LongTasksRule', () => {
  let rule: LongTasksRule;
  let parser: PerfTraceParserService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    parser = TestBed.inject(PerfTraceParserService);
    rule = new LongTasksRule();
  });

  it('detects long tasks (>50ms) on main thread', () => {
    const parsed = parser.parse(sampleTrace);
    const result = rule.analyze(parsed);
    expect(result.actionItems.length).toBeGreaterThanOrEqual(1);
  });

  it('reports severity as critical for tasks >200ms', () => {
    const parsed = parser.parse(sampleTrace);
    const result = rule.analyze(parsed);
    const criticalItems = result.actionItems.filter(a => a.severity === 'critical');
    expect(criticalItems.length).toBeGreaterThanOrEqual(1);
  });

  it('includes function name and duration in detail', () => {
    const parsed = parser.parse(sampleTrace);
    const result = rule.analyze(parsed);
    const item = result.actionItems.find(a => a.detail.includes('processData'));
    expect(item).toBeDefined();
    expect(item!.detail).toContain('380');
    expect(item!.detail).toContain('Breakdown');
  });

  it('produces TBT metric', () => {
    const parsed = parser.parse(sampleTrace);
    const result = rule.analyze(parsed);
    const tbt = result.metrics.find(m => m.shortName === 'TBT');
    expect(tbt).toBeDefined();
    expect(tbt!.value).toBeGreaterThan(0);
  });
});
