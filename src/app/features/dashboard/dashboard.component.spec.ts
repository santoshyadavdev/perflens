import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardComponent } from './dashboard.component';
import { provideRouter } from '@angular/router';

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;

  beforeEach(async () => {
    const fileData = [{
      name: 'test-trace.json',
      size: 1024,
      format: 'perf-trace',
      content: JSON.stringify({
        traceEvents: [
          { name: 'navigationStart', cat: 'blink.user_timing', ph: 'R', ts: 1000000, pid: 1, tid: 2, args: {} },
          { name: 'FunctionCall', cat: 'devtools.timeline', ph: 'X', ts: 1100000, dur: 200000, pid: 1, tid: 2, args: { data: { functionName: 'init', url: 'app.js', lineNumber: 1 } } },
          { name: 'firstContentfulPaint', cat: 'blink.user_timing', ph: 'R', ts: 2000000, pid: 1, tid: 2, args: {} },
          { name: 'largestContentfulPaint::Candidate', cat: 'loading', ph: 'R', ts: 3000000, pid: 1, tid: 2, args: { data: { size: 100, type: 'text' } } },
          { name: 'thread_name', cat: '__metadata', ph: 'M', ts: 0, pid: 1, tid: 2, args: { name: 'CrRendererMain' } },
        ],
      }),
    }];
    sessionStorage.setItem('perflens-files', JSON.stringify(fileData));

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    sessionStorage.removeItem('perflens-files');
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

  it('displays the file name', () => {
    expect(fixture.nativeElement.textContent).toContain('test-trace.json');
  });
});
