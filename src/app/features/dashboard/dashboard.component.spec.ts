import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardComponent } from './dashboard.component';
import { provideRouter } from '@angular/router';
import { TraceStoreService } from '../../core/services/trace-store.service';

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  const getTabButton = (label: string): HTMLButtonElement | undefined =>
    Array.from(fixture.nativeElement.querySelectorAll('button')).find((button: HTMLButtonElement) =>
      button.textContent?.includes(label),
    );

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    const traceStore = TestBed.inject(TraceStoreService);
    traceStore.store([{
      name: 'test-trace.json',
      size: 1024,
      format: 'perf-trace',
      content: {
        traceEvents: [
          { name: 'navigationStart', cat: 'blink.user_timing', ph: 'R', ts: 1000000, pid: 1, tid: 2, args: {} },
          { name: 'FunctionCall', cat: 'devtools.timeline', ph: 'X', ts: 1100000, dur: 200000, pid: 1, tid: 2, args: { data: { functionName: 'init', url: 'app.js', lineNumber: 1 } } },
          { name: 'firstContentfulPaint', cat: 'blink.user_timing', ph: 'R', ts: 2000000, pid: 1, tid: 2, args: {} },
          { name: 'largestContentfulPaint::Candidate', cat: 'loading', ph: 'R', ts: 3000000, pid: 1, tid: 2, args: { data: { size: 100, type: 'text' } } },
          { name: 'thread_name', cat: '__metadata', ph: 'M', ts: 0, pid: 1, tid: 2, args: { name: 'CrRendererMain' } },
        ],
      },
    }]);

    fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders score cards', () => {
    const scoreCards = fixture.nativeElement.querySelector('app-score-cards');
    expect(scoreCards).toBeTruthy();
  });

  it('renders action items', () => {
    const actionItems = fixture.nativeElement.querySelector('app-action-items');
    expect(actionItems).toBeTruthy();
  });

  it('renders the dashboard tabs', () => {
    expect(getTabButton('Action Items')).toBeTruthy();
    expect(getTabButton('Flamegraph')).toBeTruthy();
    expect(getTabButton('Timeline')).toBeTruthy();
    expect(getTabButton('Network')).toBeTruthy();
  });

  it('wires tabs and panels for accessibility', () => {
    const actionItemsTab = getTabButton('Action Items');
    const flamegraphTab = getTabButton('Flamegraph');
    const actionItemsPanel = fixture.nativeElement.querySelector('#tab-panel-action-items');

    expect(actionItemsTab?.id).toBe('tab-action-items');
    expect(actionItemsTab?.getAttribute('tabindex')).toBe('0');
    expect(flamegraphTab?.getAttribute('tabindex')).toBe('-1');
    expect(actionItemsPanel?.getAttribute('aria-labelledby')).toBe('tab-action-items');
  });

  it('switches to the flamegraph tab', () => {
    const flamegraphTab = getTabButton('Flamegraph');
    const actionItemsTab = getTabButton('Action Items');

    flamegraphTab?.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-flamegraph')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-action-items')).toBeFalsy();
    expect(flamegraphTab?.getAttribute('aria-selected')).toBe('true');
    expect(actionItemsTab?.getAttribute('aria-selected')).toBe('false');
  });

  it('keeps future tabs disabled', () => {
    expect(getTabButton('Memory')?.disabled).toBe(true);
    expect(getTabButton('V8 Internals')?.disabled).toBe(true);
  });

  it('displays the file name', () => {
    expect(fixture.nativeElement.textContent).toContain('test-trace.json');
  });
});

describe('DashboardComponent (heap snapshot)', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  const getTabButton = (label: string): HTMLButtonElement | undefined =>
    Array.from(fixture.nativeElement.querySelectorAll('button')).find((button: HTMLButtonElement) =>
      button.textContent?.includes(label),
    );

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    const traceStore = TestBed.inject(TraceStoreService);
    traceStore.store([{
      name: 'test-heap.heapsnapshot',
      size: 2048,
      format: 'heap-snapshot',
      content: new File(['{}'], 'test-heap.heapsnapshot'),
    }]);

    fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
  });

  it('enables the memory tab and defaults to it', () => {
    expect(getTabButton('Memory')?.disabled).toBe(false);
    expect(getTabButton('Flamegraph')?.disabled).toBe(true);
    expect(getTabButton('Timeline')?.disabled).toBe(true);
    expect(getTabButton('Network')?.disabled).toBe(true);
  });
});

describe('DashboardComponent (cpu profile)', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  const getTabButton = (label: string): HTMLButtonElement | undefined =>
    Array.from(fixture.nativeElement.querySelectorAll('button')).find((button: HTMLButtonElement) =>
      button.textContent?.includes(label),
    );

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    const traceStore = TestBed.inject(TraceStoreService);
    traceStore.store([{
      name: 'test-profile.cpuprofile',
      size: 4096,
      format: 'cpu-profile',
      content: new File(['{}'], 'test-profile.cpuprofile'),
    }]);

    fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
  });

  it('enables cpu profile tabs and defaults to cpu profile', () => {
    expect(getTabButton('Action Items')?.disabled).toBe(false);
    expect(getTabButton('CPU Profile')?.disabled).toBe(false);
    expect(getTabButton('Flamegraph')?.disabled).toBe(true);
    expect(getTabButton('Timeline')?.disabled).toBe(true);
    expect(getTabButton('Network')?.disabled).toBe(true);
    expect(getTabButton('Memory')?.disabled).toBe(true);
    expect(getTabButton('V8 Internals')?.disabled).toBe(true);
    expect(fixture.componentInstance.activeTab()).toBe('cpu-profile');
  });
});
