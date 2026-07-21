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
