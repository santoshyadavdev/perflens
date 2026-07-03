import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TimelineComponent } from './timeline.component';
import { ParsedTrace } from '../../core/models/trace-event.model';

const mockTrace: ParsedTrace = {
  traceEvents: [
    { name: 'RunTask', cat: 'devtools.timeline', ph: 'X', ts: 0, dur: 100_000, pid: 1, tid: 1, args: {} },
    { name: 'EvaluateScript', cat: 'devtools.timeline', ph: 'X', ts: 10_000, dur: 60_000, pid: 1, tid: 1, args: {} },
    { name: 'Layout', cat: 'devtools.timeline', ph: 'X', ts: 80_000, dur: 15_000, pid: 1, tid: 1, args: {} },
    { name: 'Paint', cat: 'devtools.timeline', ph: 'X', ts: 95_000, dur: 5_000, pid: 1, tid: 1, args: {} },
  ],
  metadata: { traceStartTime: 0, traceEndTime: 200_000 },
  mainThreadId: 1,
  navigationStart: 0,
};

describe('TimelineComponent', () => {
  let fixture: ComponentFixture<TimelineComponent>;
  let component: TimelineComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TimelineComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TimelineComponent);
    fixture.componentRef.setInput('trace', mockTrace);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates successfully', () => {
    expect(component).toBeTruthy();
  });

  it('buildTimeline categorizes events correctly', () => {
    const entries = component.buildTimeline(mockTrace);
    const scripting = entries.filter(e => e.category === 'scripting');
    const layout = entries.filter(e => e.category === 'layout');
    expect(scripting.length).toBeGreaterThan(0);
    expect(layout.length).toBeGreaterThan(0);
    expect(scripting[0].name).toBe('EvaluateScript');
    expect(layout[0].name).toBe('Layout');
  });

  it('computeBreakdown returns correct time per category', () => {
    const breakdown = component.computeBreakdown(mockTrace);
    // EvaluateScript = 60_000µs = 60ms scripting
    expect(breakdown.scripting).toBeCloseTo(60, 0);
    // Layout = 15_000µs = 15ms layout
    expect(breakdown.layout).toBeCloseTo(15, 0);
    // Paint = 5_000µs = 5ms painting
    expect(breakdown.painting).toBeCloseTo(5, 0);
    // RunTask = 100_000µs = 100ms system
    expect(breakdown.system).toBeCloseTo(100, 0);
  });

  it('samples visible entries across the full timeline instead of truncating to the head', () => {
    const denseTrace: ParsedTrace = {
      traceEvents: Array.from({ length: 4001 }, (_, index) => ({
        name: 'FunctionCall',
        cat: 'devtools.timeline',
        ph: 'X' as const,
        ts: index * 1_000,
        dur: 1_000,
        pid: 1,
        tid: 1,
        args: { data: { index } },
      })),
      metadata: { traceStartTime: 0, traceEndTime: 4_001_000 },
      mainThreadId: 1,
      navigationStart: 0,
    };

    fixture.componentRef.setInput('trace', denseTrace);
    fixture.detectChanges();

    const visible = component.visibleEntries();

    expect(visible.length).toBeLessThanOrEqual(2000);
    expect(Math.max(...visible.map(entry => entry.startMs))).toBeGreaterThan(3900);
  });
});
