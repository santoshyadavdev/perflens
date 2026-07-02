import { Injectable } from '@angular/core';
import { FileFormat } from '../models/trace-event.model';
import { isGzipped, readFileText } from './gzip.util';

@Injectable({ providedIn: 'root' })
export class FormatDetectorService {
  async detect(file: File): Promise<FileFormat> {
    const headBuffer = await file.slice(0, 4096).arrayBuffer();

    // If gzipped, decompress first then detect the inner content
    if (isGzipped(headBuffer)) {
      const text = await readFileText(file);
      return this.detectFromText(text);
    }

    const head = new TextDecoder().decode(headBuffer);
    return this.detectFromHead(head);
  }

  private detectFromHead(head: string): FileFormat {
    if (this.isV8Log(head)) return 'v8-log';

    const trimmed = head.trimStart();

    // Array format: [{"ph":...}]
    if (trimmed.startsWith('[')) {
      if (/\{\s*"ph"\s*:/.test(trimmed)) return 'perf-trace';
      return 'unknown';
    }

    if (trimmed.startsWith('{')) {
      if (/"traceEvents"\s*:/.test(trimmed)) return 'perf-trace';
      if (/"snapshot"\s*:.*"meta"\s*:/s.test(trimmed)) return 'heap-snapshot';
      if (/"nodes"\s*:/.test(trimmed) && /"startTime"\s*:/.test(trimmed)) return 'cpu-profile';
    }

    return 'unknown';
  }

  private detectFromText(text: string): FileFormat {
    // For decompressed gzip content, use head-based detection first
    const head = text.slice(0, 4096);
    const result = this.detectFromHead(head);
    if (result !== 'unknown') return result;

    // Fall back to full parse for ambiguous cases
    try {
      const json = JSON.parse(text);
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

}
