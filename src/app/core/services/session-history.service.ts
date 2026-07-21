import { Injectable } from '@angular/core';
import {
  SavedSession,
  SESSION_HISTORY_DB,
  SESSIONS_STORE,
  RAW_DATA_STORE,
  MAX_SESSIONS,
} from '../models/session-history.model';
import { AnalysisResult } from '../models/analysis-result.model';

@Injectable({ providedIn: 'root' })
export class SessionHistoryService {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private dbName = SESSION_HISTORY_DB;

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
          const store = db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' });
          store.createIndex('analyzedAt', 'analyzedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(RAW_DATA_STORE)) {
          db.createObjectStore(RAW_DATA_STORE);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  /** Reset internal DB connection — used in tests to handle DB cleanup between runs. */
  _resetForTesting(dbName?: string): void {
    if (this.dbPromise) {
      this.dbPromise.then(db => db.close()).catch(() => {});
    }
    this.dbPromise = null;
    if (dbName) {
      this.dbName = dbName;
    }
  }

  async save(
    result: AnalysisResult,
    format: 'perf-trace' | 'heap-snapshot' | 'cpu-profile',
    rawData?: unknown,
  ): Promise<string> {
    const db = await this.openDb();
    const id = crypto.randomUUID();

    const session: SavedSession = {
      id,
      fileName: result.fileName,
      fileSize: result.fileSize,
      format,
      analyzedAt: result.analyzedAt.toISOString(),
      metrics: result.metrics,
      actionItems: result.actionItems,
      rawDataStored: rawData != null,
    };

    // Write session metadata, raw data, and evict excess in a single transaction
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([SESSIONS_STORE, RAW_DATA_STORE], 'readwrite');
      const sessionsStore = tx.objectStore(SESSIONS_STORE);
      const rawDataStore = tx.objectStore(RAW_DATA_STORE);

      sessionsStore.put(session);
      if (rawData != null) {
        rawDataStore.put(rawData, id);
      }

      // Evict oldest sessions within the same transaction
      const allRequest = sessionsStore.getAll();
      allRequest.onsuccess = () => {
        const all = allRequest.result as SavedSession[];
        if (all.length > MAX_SESSIONS) {
          const sorted = all.sort(
            (a, b) => new Date(a.analyzedAt).getTime() - new Date(b.analyzedAt).getTime(),
          );
          const excess = sorted.slice(0, all.length - MAX_SESSIONS);
          for (const old of excess) {
            sessionsStore.delete(old.id);
            rawDataStore.delete(old.id);
          }
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    return id;
  }

  async list(): Promise<SavedSession[]> {
    const db = await this.openDb();
    const sessions = await this.getAll(db);
    return sessions.sort(
      (a, b) => new Date(b.analyzedAt).getTime() - new Date(a.analyzedAt).getTime(),
    );
  }

  async load(id: string): Promise<SavedSession | null> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SESSIONS_STORE, 'readonly');
      const store = tx.objectStore(SESSIONS_STORE);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  async loadRaw(id: string): Promise<unknown | null> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(RAW_DATA_STORE, 'readonly');
      const store = tx.objectStore(RAW_DATA_STORE);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(id: string): Promise<void> {
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([SESSIONS_STORE, RAW_DATA_STORE], 'readwrite');
      tx.objectStore(SESSIONS_STORE).delete(id);
      tx.objectStore(RAW_DATA_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private getAll(db: IDBDatabase): Promise<SavedSession[]> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SESSIONS_STORE, 'readonly');
      const request = tx.objectStore(SESSIONS_STORE).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}
