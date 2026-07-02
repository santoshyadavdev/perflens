import { LcpBreakdownRule } from './lcp-breakdown.rule';
import { PerfTraceParserService } from '../../parsers/perf-trace-parser.service';
import { TestBed } from '@angular/core/testing';
import sampleTrace from '../../../../test-fixtures/sample-trace.json';

describe('LcpBreakdownRule', () => {
  let rule: LcpBreakdownRule;
  let parser: PerfTraceParserService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    parser = TestBed.inject(PerfTraceParserService);
    rule = new LcpBreakdownRule();
  });

  it('produces an LCP metric', () => {
    const parsed = parser.parse(sampleTrace);
    const result = rule.analyze(parsed);
    const lcp = result.metrics.find(m => m.shortName === 'LCP');
    expect(lcp).toBeDefined();
    expect(lcp!.value).toBe(4200); // 5200000 - 1000000 = 4200000us = 4200ms
  });

  it('rates LCP as poor when >4s', () => {
    const parsed = parser.parse(sampleTrace);
    const result = rule.analyze(parsed);
    const lcp = result.metrics.find(m => m.shortName === 'LCP');
    expect(lcp!.rating).toBe('poor');
  });

  it('produces an FCP metric', () => {
    const parsed = parser.parse(sampleTrace);
    const result = rule.analyze(parsed);
    const fcp = result.metrics.find(m => m.shortName === 'FCP');
    expect(fcp).toBeDefined();
    expect(fcp!.value).toBe(1800); // 2800000 - 1000000 = 1800ms
  });

  it('generates action items when LCP is poor', () => {
    const parsed = parser.parse(sampleTrace);
    const result = rule.analyze(parsed);
    expect(result.actionItems.length).toBeGreaterThanOrEqual(1);
    expect(result.actionItems[0].metric).toBe('LCP');
  });
});
