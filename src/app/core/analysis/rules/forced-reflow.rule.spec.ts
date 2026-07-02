import { ForcedReflowRule } from './forced-reflow.rule';
import { PerfTraceParserService } from '../../parsers/perf-trace-parser.service';
import { TestBed } from '@angular/core/testing';
import sampleTrace from '../../../../test-fixtures/sample-trace.json';

describe('ForcedReflowRule', () => {
  let rule: ForcedReflowRule;
  let parser: PerfTraceParserService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    parser = TestBed.inject(PerfTraceParserService);
    rule = new ForcedReflowRule();
  });

  it('detects forced reflows (Layout after JS on main thread)', () => {
    const parsed = parser.parse(sampleTrace);
    const result = rule.analyze(parsed);
    expect(result.actionItems.length).toBeGreaterThanOrEqual(1);
  });

  it('identifies the triggering function', () => {
    const parsed = parser.parse(sampleTrace);
    const result = rule.analyze(parsed);
    const item = result.actionItems.find(a => a.detail.includes('updateLayout'));
    expect(item).toBeDefined();
  });

  it('tags action items with INP metric', () => {
    const parsed = parser.parse(sampleTrace);
    const result = rule.analyze(parsed);
    expect(result.actionItems.every(a => a.metric === 'INP' || a.metric === 'TBT')).toBe(true);
  });
});
