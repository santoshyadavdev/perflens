import { Component, inject, input, output, signal, OnInit, ElementRef, viewChild, afterNextRender, OnDestroy } from '@angular/core';
import { ShareService } from '../../core/services/share.service';
import { AnalysisResult } from '../../core/models/analysis-result.model';

@Component({
  selector: 'app-share-dialog',
  standalone: true,
  template: `
    <dialog
      #dialogEl
      class="fixed inset-0 bg-transparent p-0 m-0 max-w-none max-h-none w-full h-full"
      style="background: transparent;"
      (close)="close.emit()"
      (click)="onBackdropClick($event)"
    >
      <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
        <div class="bg-[#161b26] rounded-xl p-6 w-full max-w-md shadow-xl border border-gray-800">
          <h2 class="text-lg font-semibold text-white mb-4">Share Analysis</h2>

          @if (loading()) {
            <div class="text-gray-400 animate-pulse py-4 text-center">Generating link...</div>
          } @else {
            <div class="space-y-3">
              @if (shareUrl()) {
                <div class="bg-[#1a1f2e] rounded-lg p-3">
                  <div class="text-gray-400 text-xs mb-2 truncate font-mono">{{ shareUrl() }}</div>
                  <button
                    data-testid="copy-link"
                    class="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2.5 font-medium transition-colors"
                    (click)="copyLink()"
                  >
                    {{ copied() ? '✅ Copied!' : '📋 Copy Link' }}
                  </button>
                </div>
              }

              @if (tooLarge()) {
                <div data-testid="too-large-msg" class="bg-amber-500/10 text-amber-400 text-sm rounded-lg p-3">
                  Analysis is too large for a URL. Download the .perflens file to share instead.
                </div>
              }

              <button
                data-testid="download-perflens"
                class="w-full bg-[#1a1f2e] hover:bg-[#252b3b] border border-gray-700 rounded-lg p-3 text-left transition-colors"
                (click)="downloadFile()"
              >
                <div class="text-white font-medium text-sm">⬇ Download .perflens file</div>
                <div class="text-gray-500 text-xs mt-0.5">Importable file for sharing offline</div>
              </button>
            </div>

            <button
              class="mt-4 w-full text-gray-400 hover:text-white text-sm py-2 transition-colors"
              (click)="close.emit()"
            >
              Close
            </button>
          }
        </div>
      </div>
    </dialog>
  `,
  styles: [`
    dialog::backdrop { background: transparent; }
  `],
})
export class ShareDialogComponent implements OnInit, OnDestroy {
  private readonly shareService = inject(ShareService);
  private readonly dialogEl = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');
  private previouslyFocused: HTMLElement | null = null;

  result = input.required<AnalysisResult>();
  fileFormat = input.required<string>();
  close = output<void>();

  loading = signal(true);
  shareUrl = signal<string | null>(null);
  tooLarge = signal(false);
  copied = signal(false);

  constructor() {
    afterNextRender(() => {
      this.previouslyFocused = document.activeElement as HTMLElement | null;
      this.dialogEl()?.nativeElement.showModal();
    });
  }

  ngOnDestroy(): void {
    this.previouslyFocused?.focus();
  }

  async ngOnInit(): Promise<void> {
    try {
      const encoded = await this.shareService.encode(this.result(), this.fileFormat());
      this.shareUrl.set(encoded.url);
      this.tooLarge.set(encoded.tooLarge);
    } catch {
      this.tooLarge.set(true);
    }
    this.loading.set(false);
  }

  async copyLink(): Promise<void> {
    const url = this.shareUrl();
    if (!url) return;
    await navigator.clipboard.writeText(url);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  downloadFile(): void {
    this.shareService.downloadPerflensFile(this.result(), this.fileFormat());
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close.emit();
    }
  }
}
