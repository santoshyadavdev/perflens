import { Injectable, signal } from '@angular/core';
import { SavedSession } from '../models/session-history.model';

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

  private readonly _restoredSession = signal<SavedSession | null>(null);
  readonly restoredSession = this._restoredSession.asReadonly();

  store(files: StoredFile[]): void {
    this._files.set(files);
    this._restoredSession.set(null);
  }

  storeFromSession(session: SavedSession): void {
    this._files.set([
      {
        name: session.fileName,
        size: session.fileSize,
        format: session.format,
        content: null,
      },
    ]);
    this._restoredSession.set(session);
  }

  clear(): void {
    this._files.set([]);
    this._restoredSession.set(null);
  }

  hasFiles(): boolean {
    return this._files().length > 0;
  }
}
