import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExportDialogComponent } from './export-dialog.component';
import { ExportService } from '../../core/services/export.service';
import { Subject } from 'rxjs';
import { ExportProgress } from '../../core/models/export.model';
import { AnalysisResult } from '../../core/models/analysis-result.model';

describe('ExportDialogComponent', () => {
  let fixture: ComponentFixture<ExportDialogComponent>;
  let component: ExportDialogComponent;
  let mockExportService: { export: ReturnType<typeof vi.fn> };
  let progressSubject: Subject<ExportProgress>;

  const mockResult: AnalysisResult = {
    fileName: 'trace.json',
    fileSize: 1024,
    analyzedAt: new Date('2026-07-20T12:00:00Z'),
    metrics: [],
    actionItems: [],
    parsedTrace: { traceEvents: [], metadata: { traceStartTime: 0, traceEndTime: 0 }, mainThreadId: 0, navigationStart: 0 },
  };

  beforeEach(async () => {
    progressSubject = new Subject<ExportProgress>();
    mockExportService = {
      export: vi.fn(() => progressSubject.asObservable()),
    };

    await TestBed.configureTestingModule({
      imports: [ExportDialogComponent],
      providers: [
        { provide: ExportService, useValue: mockExportService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ExportDialogComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('result', mockResult);
    fixture.componentRef.setInput('fileFormat', 'perf-trace');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows format selection by default', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('PDF Report');
    expect(el.textContent).toContain('HTML Report');
  });

  it('starts PDF export when PDF button is clicked', () => {
    const pdfBtn = fixture.nativeElement.querySelector('[data-testid="export-pdf"]') as HTMLButtonElement;
    pdfBtn.click();
    fixture.detectChanges();

    expect(mockExportService.export).toHaveBeenCalledWith('pdf', 'perf-trace', mockResult);
  });

  it('starts HTML export when HTML button is clicked', () => {
    const htmlBtn = fixture.nativeElement.querySelector('[data-testid="export-html"]') as HTMLButtonElement;
    htmlBtn.click();
    fixture.detectChanges();

    expect(mockExportService.export).toHaveBeenCalledWith('html', 'perf-trace', mockResult);
  });

  it('shows progress bar during capture phase', () => {
    const pdfBtn = fixture.nativeElement.querySelector('[data-testid="export-pdf"]') as HTMLButtonElement;
    pdfBtn.click();
    fixture.detectChanges();

    progressSubject.next({
      phase: 'capturing',
      currentSection: 'Flamegraph',
      currentStep: 2,
      totalSteps: 5,
      percentage: 40,
    });
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Flamegraph');
    expect(el.querySelector('[data-testid="progress-bar"]')).toBeTruthy();
  });

  it('shows download button when complete', () => {
    const pdfBtn = fixture.nativeElement.querySelector('[data-testid="export-pdf"]') as HTMLButtonElement;
    pdfBtn.click();
    fixture.detectChanges();

    progressSubject.next({
      phase: 'complete',
      currentStep: 5,
      totalSteps: 5,
      percentage: 100,
      result: new Blob(['pdf'], { type: 'application/pdf' }),
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="download-btn"]')).toBeTruthy();
  });

  it('shows error message on failure', () => {
    const pdfBtn = fixture.nativeElement.querySelector('[data-testid="export-pdf"]') as HTMLButtonElement;
    pdfBtn.click();
    fixture.detectChanges();

    progressSubject.next({
      phase: 'error',
      currentStep: 0,
      totalSteps: 0,
      percentage: 0,
      error: 'Capture failed',
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Capture failed');
  });

  it('emits close event when cancel is clicked', () => {
    const closeSpy = vi.fn();
    component.close.subscribe(closeSpy);

    const cancelBtn = fixture.nativeElement.querySelector('[data-testid="cancel-btn"]') as HTMLButtonElement;
    cancelBtn.click();

    expect(closeSpy).toHaveBeenCalled();
  });
});
