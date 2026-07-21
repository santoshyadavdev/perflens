import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShareDialogComponent } from './share-dialog.component';
import { ShareService } from '../../core/services/share.service';
import { AnalysisResult } from '../../core/models/analysis-result.model';

const mockResult: AnalysisResult = {
  fileName: 'trace.json',
  fileSize: 1024,
  analyzedAt: new Date('2026-07-21T12:00:00Z'),
  metrics: [{ name: 'LCP', shortName: 'LCP', value: 2000, displayValue: '2.0s', unit: 'ms', rating: 'good' }],
  actionItems: [],
  parsedTrace: { traceEvents: [], metadata: { traceStartTime: 0, traceEndTime: 0 }, mainThreadId: 0, navigationStart: 0 },
};

describe('ShareDialogComponent', () => {
  let component: ShareDialogComponent;
  let fixture: ComponentFixture<ShareDialogComponent>;
  let mockShareService: { encode: ReturnType<typeof vi.fn>; downloadPerflensFile: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockShareService = {
      encode: vi.fn().mockResolvedValue({ url: 'http://localhost/#share=abc', tooLarge: false }),
      downloadPerflensFile: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [ShareDialogComponent],
      providers: [{ provide: ShareService, useValue: mockShareService }],
    }).compileComponents();

    fixture = TestBed.createComponent(ShareDialogComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('result', mockResult);
    fixture.componentRef.setInput('fileFormat', 'perf-trace');
    fixture.detectChanges();
  });

  it('should render the dialog', () => {
    expect(fixture.nativeElement.querySelector('dialog')).toBeTruthy();
  });

  it('should call encode on init and show copy button', async () => {
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mockShareService.encode).toHaveBeenCalledWith(mockResult, 'perf-trace');
    expect(fixture.nativeElement.querySelector('[data-testid="copy-link"]')).toBeTruthy();
  });

  it('should show download-only when tooLarge', async () => {
    mockShareService.encode.mockResolvedValue({ url: null, tooLarge: true });
    fixture = TestBed.createComponent(ShareDialogComponent);
    fixture.componentRef.setInput('result', mockResult);
    fixture.componentRef.setInput('fileFormat', 'perf-trace');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="copy-link"]')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('[data-testid="too-large-msg"]')).toBeTruthy();
  });

  it('should emit close on backdrop click', () => {
    const spy = vi.spyOn(component.close, 'emit');
    const dialog = fixture.nativeElement.querySelector('dialog');
    dialog.click();
    expect(spy).toHaveBeenCalled();
  });
});
