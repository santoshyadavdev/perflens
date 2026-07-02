import { Injectable } from '@angular/core';
import { FileFormat } from '../models/trace-event.model';

@Injectable({ providedIn: 'root' })
export class FormatDetectorService {
  async detect(file: File): Promise<FileFormat> {
    const text = await this.readHead(file, 4096);

    if (this.isV8Log(text)) return 'v8-log';

    try {
      const json = JSON.parse(await file.text());
      return this.detectJson(json);
    } catch {
      return 'unknown';
    }
  }

  private detectJson(json: unknown): FileFormat {
    if (Array.isArray(json)) {
      const first = json[0];
      if (first && typeof first === 'object' && 'ph' in first) {
        return 'perf-trace';
      }
      return 'unknown';
    }

    if (typeof json !== 'object' || json === null) return 'unknown';

    const obj = json as Record<string, unknown>;

    if ('traceEvents' in obj) return 'perf-trace';

    if ('snapshot' in obj) {
      const snapshot = obj['snapshot'] as Record<string, unknown> | undefined;
      if (snapshot && 'meta' in snapshot) return 'heap-snapshot';
    }

    if ('nodes' in obj && 'startTime' in obj && 'endTime' in obj) {
      return 'cpu-profile';
    }

    return 'unknown';
  }

  private isV8Log(head: string): boolean {
    const firstLine = head.split('\n')[0] ?? '';
    return firstLine.startsWith('v8-version') ||
           firstLine.startsWith('code-creation') ||
           firstLine.startsWith('tick');
  }

  private readHead(file: File, bytes: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file.slice(0, bytes));
    });
  }
}
