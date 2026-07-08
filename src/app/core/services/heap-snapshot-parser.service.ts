import { Injectable, signal } from '@angular/core';
import type { ParsedHeapSnapshot, HeapWorkerMessage, RawHeapSnapshot } from '../models/heap-snapshot.model';
import { HeapGraph } from '../parsers/heap-graph';
import { computeDominatorTree, computeRetainedSizes } from '../parsers/dominator-tree';
import { analyzeSnapshot } from '../parsers/snapshot-analyzer';

@Injectable({ providedIn: 'root' })
export class HeapSnapshotParserService {
  readonly status = signal<'idle' | 'parsing' | 'done' | 'error'>('idle');
  readonly progress = signal(0);
  readonly progressPhase = signal('');
  readonly result = signal<ParsedHeapSnapshot | null>(null);
  readonly error = signal<string | null>(null);

  private worker: Worker | null = null;

  async parse(file: File): Promise<void> {
    this.status.set('parsing');
    this.progress.set(0);
    this.progressPhase.set('Starting...');
    this.result.set(null);
    this.error.set(null);

    // Try Worker first, fall back to main thread
    if (typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(new URL('../parsers/heap-snapshot.worker', import.meta.url));
        return this.parseWithWorker(file);
      } catch {
        // Worker creation failed, fall back
      }
    }

    return this.parseOnMainThread(file);
  }

  private parseWithWorker(file: File): Promise<void> {
    return new Promise<void>((resolve) => {
      this.worker!.onmessage = (event: MessageEvent<HeapWorkerMessage>) => {
        const msg = event.data;
        switch (msg.type) {
          case 'progress':
            this.progress.set(msg.percent);
            this.progressPhase.set(msg.phase);
            break;
          case 'result':
            this.result.set(msg.snapshot);
            this.status.set('done');
            this.progress.set(100);
            this.worker?.terminate();
            resolve();
            break;
          case 'error':
            this.error.set(msg.message);
            this.status.set('error');
            this.worker?.terminate();
            resolve();
            break;
        }
      };

      this.worker!.onerror = (err) => {
        this.error.set(err.message || 'Worker error');
        this.status.set('error');
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
      const raw: RawHeapSnapshot = JSON.parse(text);

      this.progressPhase.set('Building heap graph...');
      this.progress.set(50);
      const graph = new HeapGraph(raw);

      this.progressPhase.set('Computing dominator tree...');
      this.progress.set(70);
      computeDominatorTree(graph);

      this.progressPhase.set('Computing retained sizes...');
      this.progress.set(80);
      computeRetainedSizes(graph);

      this.progressPhase.set('Analyzing snapshot...');
      this.progress.set(90);
      const snapshot = analyzeSnapshot(graph, file.name);

      this.result.set(snapshot);
      this.status.set('done');
      this.progress.set(100);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to parse heap snapshot');
      this.status.set('error');
    }
  }

  reset(): void {
    this.worker?.terminate();
    this.worker = null;
    this.status.set('idle');
    this.progress.set(0);
    this.progressPhase.set('');
    this.result.set(null);
    this.error.set(null);
  }
}
