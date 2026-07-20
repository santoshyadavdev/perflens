import { TestBed } from '@angular/core/testing';
import { ExportService } from './export.service';
import { SectionCaptureService } from './section-capture.service';
import { CapturedSection, ExportProgress } from '../models/export.model';
import { AnalysisResult } from '../models/analysis-result.model';

// Mock the builders
vi.mock('./pdf-builder', () => ({
  buildPdf: vi.fn(() => new Blob(['pdf'], { type: 'application/pdf' })),
}));
vi.mock('./html-builder', () => ({
  buildHtml: vi.fn(() => new Blob(['html'], { type: 'text/html' })),
}));

describe('ExportService', () => {
  let service: ExportService;
  let mockCaptureService: { captureAllSections: ReturnType<typeof vi.fn> };

  const mockCaptured: CapturedSection[] = [
    { id: 'action-items', title: 'Action Items', imageDataUrl: 'data:image/png;base64,a', width: 800, height: 400 },
    { id: 'flamegraph', title: 'Flamegraph', imageDataUrl: 'data:image/png;base64,b', width: 800, height: 600 },
  ];

  const mockResult: AnalysisResult = {
    fileName: 'trace.json',
    fileSize: 1024,
    analyzedAt: new Date('2026-07-20T12:00:00Z'),
    metrics: [{ name: 'LCP', shortName: 'LCP', value: 2000, displayValue: '2.0s', unit: 'ms', rating: 'good' }],
    actionItems: [{ id: 'a1', severity: 'critical', title: 'Fix', detail: 'Detail', metric: 'LCP', fix: 'Fix it' }],
    parsedTrace: { traceEvents: [], metadata: { traceStartTime: 0, traceEndTime: 0 }, mainThreadId: 0, navigationStart: 0 },
  };

  beforeEach(() => {
    mockCaptureService = {
      captureAllSections: vi.fn(async (_defs: unknown, onProgress: (i: number, t: number, s: string) => void) => {
        onProgress(0, 2, 'Action Items');
        onProgress(1, 2, 'Flamegraph');
        return mockCaptured;
      }),
    };

    TestBed.configureTestingModule({
      providers: [
        ExportService,
        { provide: SectionCaptureService, useValue: mockCaptureService },
      ],
    });
    service = TestBed.inject(ExportService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('export emits progress updates and completes with PDF blob', async () => {
    const updates: ExportProgress[] = [];

    const result = await new Promise<ExportProgress>((resolve) => {
      service.export('pdf', 'perf-trace', mockResult).subscribe(progress => {
        updates.push(progress);
        if (progress.phase === 'complete') {
          resolve(progress);
        }
      });
    });

    expect(result.phase).toBe('complete');
    expect(result.result).toBeInstanceOf(Blob);
    expect(result.result!.type).toBe('application/pdf');
    expect(updates.some(u => u.phase === 'capturing')).toBe(true);
    expect(updates.some(u => u.phase === 'assembling')).toBe(true);
  });

  it('export emits HTML blob when format is html', async () => {
    const result = await new Promise<ExportProgress>((resolve) => {
      service.export('html', 'perf-trace', mockResult).subscribe(progress => {
        if (progress.phase === 'complete') resolve(progress);
      });
    });

    expect(result.result!.type).toBe('text/html');
  });

  it('export emits error phase on failure', async () => {
    mockCaptureService.captureAllSections.mockRejectedValue(new Error('capture failed'));

    const result = await new Promise<ExportProgress>((resolve) => {
      service.export('pdf', 'perf-trace', mockResult).subscribe(progress => {
        if (progress.phase === 'error') resolve(progress);
      });
    });

    expect(result.phase).toBe('error');
    expect(result.error).toContain('capture failed');
  });

  it('unsubscribing aborts the capture via AbortSignal', async () => {
    let capturedSignal: AbortSignal | undefined;

    mockCaptureService.captureAllSections.mockImplementation(
      async (_defs: unknown, _onProgress: unknown, signal: AbortSignal) => {
        capturedSignal = signal;
        return new Promise(() => {}); // never resolves
      },
    );

    const subscription = service.export('pdf', 'perf-trace', mockResult).subscribe();

    // Allow microtask to start the async pipeline
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);

    subscription.unsubscribe();
    expect(capturedSignal!.aborted).toBe(true);
  });
});
