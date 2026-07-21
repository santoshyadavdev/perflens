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
    expect(comparison.metricDiffs[0].improved).toBe(false);
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
    expect(comparison.metricDiffs[0].deltaPercent).toBeNull();
  });
});
