import { RenderBlockingRule } from './render-blocking.rule';
import { PerfTraceParserService } from '../../parsers/perf-trace-parser.service';
import { TestBed } from '@angular/core/testing';
import sampleTrace from '../../../../test-fixtures/sample-trace.json';

describe('RenderBlockingRule', () => {
  let rule: RenderBlockingRule;
  let parser: PerfTraceParserService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    parser = TestBed.inject(PerfTraceParserService);
    rule = new RenderBlockingRule();
  });

  it('detects scripts evaluated before FCP', () => {
    const parsed = parser.parse(sampleTrace);
    const result = rule.analyze(parsed);
    expect(result.actionItems.length).toBeGreaterThanOrEqual(1);
  });

  it('identifies vendor.js as render-blocking', () => {
    const parsed = parser.parse(sampleTrace);
    const result = rule.analyze(parsed);
    const vendorItem = result.actionItems.find(a => a.detail.includes('vendor.js'));
    expect(vendorItem).toBeDefined();
  });

  it('includes file size when available', () => {
    const parsed = parser.parse(sampleTrace);
    const result = rule.analyze(parsed);
    const vendorItem = result.actionItems.find(a => a.detail.includes('vendor.js'));
    expect(vendorItem!.detail).toContain('340');
  });

  it('tags action items with LCP metric', () => {
    const parsed = parser.parse(sampleTrace);
    const result = rule.analyze(parsed);
    expect(result.actionItems.every(a => a.metric === 'LCP' || a.metric === 'FCP')).toBe(true);
  });
});
