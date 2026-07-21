import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormatDetectorService } from '../../core/parsers/format-detector.service';
import { TraceStoreService } from '../../core/services/trace-store.service';
import { readFileText } from '../../core/parsers/gzip.util';

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [],
  template: `
    <div class="min-h-screen flex flex-col items-center justify-center px-4">
      <div class="text-center mb-8">
        <div class="text-5xl mb-4">📊</div>
        <h1 class="text-2xl font-bold text-white mb-2">
          <span class="text-emerald-400">⚡</span> PerfLens
        </h1>
        <p class="text-gray-400">Chrome Performance & Memory Analyzer</p>
      </div>

      <div
        data-testid="drop-zone"
        role="button"
        tabindex="0"
        class="border-2 border-dashed border-gray-700 rounded-xl p-12 text-center cursor-pointer
               hover:border-emerald-500/50 transition-colors max-w-lg w-full"
        [class.border-emerald-500]="isDragOver()"
        [class.bg-emerald-500/5]="isDragOver()"
        (dragover)="onDragOver($event)"
        (dragleave)="isDragOver.set(false)"
        (drop)="onDrop($event)"
        (click)="fileInput.click()"
        (keydown.enter)="fileInput.click()"
        (keydown.space)="fileInput.click(); $event.preventDefault()"
      >
        @if (isProcessing()) {
          <div class="text-emerald-400 animate-pulse">
            <div class="text-3xl mb-2">⏳</div>
            <p>Analyzing...</p>
          </div>
        } @else {
          <div class="text-emerald-400 mb-2">📁 Drag & drop or click to browse</div>
          <p class="text-gray-500 text-sm">
            Supports .json/.json.gz traces, .heapsnapshot, .cpuprofile, V8 .log, .perflens
          </p>
          <p class="text-gray-600 text-xs mt-2">Multiple files supported for comparison</p>
        }
      </div>

      <input
        #fileInput
        type="file"
        multiple
        accept=".json,.json.gz,.gz,.heapsnapshot,.cpuprofile,.log,.perflens"
        class="hidden"
        (change)="onFileInputChange($event)"
      />

      @if (error()) {
        <div class="mt-4 text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-lg">
          {{ error() }}
        </div>
      }

      <div class="flex gap-3 mt-6">
        <div data-testid="privacy-badge"
             class="bg-gray-800 text-gray-400 px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5">
          🔒 All processing happens in your browser
        </div>
        <div data-testid="privacy-badge"
             class="bg-gray-800 text-gray-400 px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5">
          📶 Works offline
        </div>
      </div>
    </div>
  `,
})
export class UploadComponent {
  private readonly router = inject(Router);
  private readonly formatDetector = inject(FormatDetectorService);
  private readonly traceStore = inject(TraceStoreService);

  isDragOver = signal(false);
  isProcessing = signal(false);
  error = signal<string | null>(null);

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(true);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);

    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) {
      this.onFilesSelected(files);
    }
  }

  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length > 0) {
      this.onFilesSelected(files);
    }
    input.value = '';
  }

  async onFilesSelected(files: File[]): Promise<void> {
    this.isProcessing.set(true);
    this.error.set(null);

    try {
      const detected = await Promise.all(
        files.map(async file => ({
          file,
          format: await this.formatDetector.detect(file),
          name: file.name,
          size: file.size,
        }))
      );

      const unsupported = detected.filter(d => d.format === 'unknown');
      if (unsupported.length > 0) {
        this.error.set(`Unsupported file(s): ${unsupported.map(u => u.name).join(', ')}`);
        this.isProcessing.set(false);
        return;
      }

      const fileData = await Promise.all(
        detected.map(async d => ({
          name: d.name,
          size: d.size,
          format: d.format,
          // Heap snapshots are large — store the raw File so a Web Worker can
          // parse them off the main thread.  All other formats parse eagerly.
          content: (d.format === 'heap-snapshot' || d.format === 'cpu-profile')
            ? d.file
            : JSON.parse(await readFileText(d.file)),
        }))
      );
      this.traceStore.store(fileData);
      this.router.navigate(['/dashboard']);
    } catch (e) {
      console.error('Failed to process file(s):', e);
      this.error.set('Failed to read file(s). Please try again.');
      this.isProcessing.set(false);
    }
  }
}
