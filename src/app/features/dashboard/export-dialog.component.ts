import { Component, inject, input, output, signal, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { ExportService } from '../../core/services/export.service';
import { ExportFormat, ExportProgress } from '../../core/models/export.model';
import { AnalysisResult } from '../../core/models/analysis-result.model';

type DialogState = 'select' | 'progress' | 'complete' | 'error';

@Component({
  selector: 'app-export-dialog',
  standalone: true,
  template: `
    <div
      class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      (click)="onBackdropClick($event)"
      (keydown.escape)="onClose()"
      role="dialog"
      aria-modal="true"
      aria-label="Export report"
    >
      <div class="bg-[#161b26] rounded-xl p-6 w-full max-w-md shadow-xl border border-gray-800">
        @switch (state()) {
          @case ('select') {
            <h2 class="text-lg font-semibold text-white mb-4">Export Report</h2>
            <div class="space-y-3">
              <button
                data-testid="export-pdf"
                class="w-full bg-[#1a1f2e] hover:bg-[#252b3b] border border-gray-700 rounded-lg p-4 text-left transition-colors"
                (click)="startExport('pdf')"
              >
                <div class="text-white font-medium">📄 PDF Report</div>
                <div class="text-gray-400 text-sm mt-1">Printable document with charts and action items</div>
              </button>
              <button
                data-testid="export-html"
                class="w-full bg-[#1a1f2e] hover:bg-[#252b3b] border border-gray-700 rounded-lg p-4 text-left transition-colors"
                (click)="startExport('html')"
              >
                <div class="text-white font-medium">🌐 HTML Report</div>
                <div class="text-gray-400 text-sm mt-1">Self-contained web page, works offline</div>
              </button>
            </div>
            <button
              data-testid="cancel-btn"
              class="mt-4 w-full text-gray-400 hover:text-white text-sm py-2 transition-colors"
              (click)="onClose()"
            >
              Cancel
            </button>
          }

          @case ('progress') {
            <h2 class="text-lg font-semibold text-white mb-4">Generating Report...</h2>
            <div class="space-y-3">
              <div class="text-gray-300 text-sm">
                {{ progress()?.currentSection ? 'Capturing ' + progress()?.currentSection + '...' : 'Assembling report...' }}
                <span class="text-gray-500 ml-1">
                  ({{ progress()?.currentStep }}/{{ progress()?.totalSteps }})
                </span>
              </div>
              <div data-testid="progress-bar" class="w-full bg-gray-700 rounded-full h-3">
                <div
                  class="bg-emerald-500 h-3 rounded-full transition-all"
                  [style.width.%]="progress()?.percentage ?? 0"
                ></div>
              </div>
              <div class="text-gray-500 text-sm text-center">{{ progress()?.percentage ?? 0 }}%</div>
            </div>
            <button
              data-testid="cancel-btn"
              class="mt-4 w-full text-gray-400 hover:text-white text-sm py-2 transition-colors"
              (click)="cancelExport()"
            >
              Cancel
            </button>
          }

          @case ('complete') {
            <div class="text-center py-4">
              <div class="text-3xl mb-2">✅</div>
              <h2 class="text-lg font-semibold text-white mb-1">Report Ready!</h2>
              <p class="text-gray-400 text-sm mb-4">Your report has been generated successfully.</p>
              <button
                data-testid="download-btn"
                class="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-3 font-medium transition-colors"
                (click)="downloadResult()"
              >
                ⬇ Download
              </button>
              <button
                class="mt-2 w-full text-gray-400 hover:text-white text-sm py-2 transition-colors"
                (click)="onClose()"
              >
                Close
              </button>
            </div>
          }

          @case ('error') {
            <div class="text-center py-4">
              <div class="text-3xl mb-2">❌</div>
              <h2 class="text-lg font-semibold text-white mb-1">Export Failed</h2>
              <p class="text-red-400 text-sm mb-4">{{ errorMessage() }}</p>
              <button
                class="w-full bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-3 font-medium transition-colors"
                (click)="resetToSelect()"
              >
                Try Again
              </button>
              <button
                data-testid="cancel-btn"
                class="mt-2 w-full text-gray-400 hover:text-white text-sm py-2 transition-colors"
                (click)="onClose()"
              >
                Close
              </button>
            </div>
          }
        }
      </div>
    </div>
  `,
})
export class ExportDialogComponent implements OnDestroy {
  private readonly exportService = inject(ExportService);

  result = input.required<AnalysisResult>();
  fileFormat = input.required<string>();
  close = output<void>();

  state = signal<DialogState>('select');
  progress = signal<ExportProgress | null>(null);
  errorMessage = signal('');
  private resultBlob: Blob | null = null;
  private exportFormat: ExportFormat = 'pdf';
  private subscription: Subscription | null = null;

  startExport(format: ExportFormat): void {
    this.exportFormat = format;
    this.state.set('progress');

    this.subscription = this.exportService
      .export(format, this.fileFormat(), this.result())
      .subscribe((update) => {
        this.progress.set(update);

        if (update.phase === 'complete' && update.result) {
          this.resultBlob = update.result;
          this.state.set('complete');
        } else if (update.phase === 'error') {
          this.errorMessage.set(update.error ?? 'Unknown error');
          this.state.set('error');
        }
      });
  }

  cancelExport(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.onClose();
  }

  downloadResult(): void {
    if (!this.resultBlob) return;

    const extension = this.exportFormat === 'pdf' ? 'pdf' : 'html';
    const baseName = this.result().fileName.replace(/\.[^.]+$/, '');
    const downloadName = `${baseName}-perflens-report.${extension}`;

    const url = URL.createObjectURL(this.resultBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  resetToSelect(): void {
    this.state.set('select');
    this.progress.set(null);
    this.errorMessage.set('');
    this.resultBlob = null;
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('fixed')) {
      this.onClose();
    }
  }

  onClose(): void {
    this.close.emit();
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }
}
