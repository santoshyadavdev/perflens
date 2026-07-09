import { Injectable, signal } from '@angular/core';
import type { ParsedCpuProfile, CpuWorkerMessage, CpuProfileRaw } from '../models/cpu-profile.model';
import { buildCallTree } from '../parsers/cpu-profile-parser';

@Injectable({ providedIn: 'root' })
export class CpuProfileParserService {
  readonly status = signal<'idle' | 'parsing' | 'done' | 'error'>('idle');
  readonly progress = signal(0);
  readonly progressPhase = signal('');
  readonly result = signal<ParsedCpuProfile | null>(null);
  readonly error = signal<string | null>(null);

  private worker: Worker | null = null;
  private pendingReject: ((reason: Error) => void) | null = null;

  async parse(file: File): Promise<void> {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    if (this.pendingReject) {
      this.pendingReject(new Error('Parse cancelled by new request'));
      this.pendingReject = null;
    }

    this.status.set('parsing');
    this.progress.set(0);
    this.progressPhase.set('Starting...');
    this.result.set(null);
    this.error.set(null);

    if (typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(new URL('../parsers/cpu-profile.worker', import.meta.url));
        return this.parseWithWorker(file);
      } catch {
        // Worker creation failed, fall back
      }
    }

    return this.parseOnMainThread(file);
  }

  private parseWithWorker(file: File): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.pendingReject = reject;
      this.worker!.onmessage = (event: MessageEvent<CpuWorkerMessage>) => {
        const msg = event.data;
        switch (msg.type) {
          case 'progress':
            this.progress.set(msg.percent);
            this.progressPhase.set(msg.phase);
            break;
          case 'result':
            this.result.set(msg.profile);
            this.status.set('done');
            this.progress.set(100);
            this.worker?.terminate();
            this.pendingReject = null;
            resolve();
            break;
          case 'error':
            this.error.set(msg.message);
            this.status.set('error');
            this.worker?.terminate();
            this.pendingReject = null;
            resolve();
            break;
        }
      };

      this.worker!.onerror = (err) => {
        this.error.set(err.message || 'Worker error');
        this.status.set('error');
        this.pendingReject = null;
        resolve();
      };

      this.worker!.postMessage({ file, fileName: file.name });
    });
  }

  private async parseOnMainThread(file: File): Promise<void> {
    try {
      this.progressPhase.set('Reading file...');
      this.progress.set(10);
      const text = await file.text();

      this.progressPhase.set('Parsing JSON...');
      this.progress.set(30);
      const raw: CpuProfileRaw = JSON.parse(text);

      this.progressPhase.set('Building call tree...');
      this.progress.set(60);
      const profile = buildCallTree(raw, file.name);

      this.result.set(profile);
      this.status.set('done');
      this.progress.set(100);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to parse CPU profile');
      this.status.set('error');
    }
  }

  reset(): void {
    this.worker?.terminate();
    this.worker = null;
    if (this.pendingReject) {
      this.pendingReject(new Error('Parse cancelled by reset'));
      this.pendingReject = null;
    }
    this.status.set('idle');
    this.progress.set(0);
    this.progressPhase.set('');
    this.result.set(null);
    this.error.set(null);
  }
}
