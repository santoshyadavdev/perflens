import { Injectable, signal } from '@angular/core';

export interface StoredFile {
  name: string;
  size: number;
  format: string;
  content: unknown;
}

@Injectable({ providedIn: 'root' })
export class TraceStoreService {
  private readonly _files = signal<StoredFile[]>([]);
  readonly files = this._files.asReadonly();

  store(files: StoredFile[]): void {
    this._files.set(files);
  }

  clear(): void {
    this._files.set([]);
  }

  hasFiles(): boolean {
    return this._files().length > 0;
  }
}
