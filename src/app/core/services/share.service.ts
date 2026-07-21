import { Injectable } from '@angular/core';
import { AnalysisResult } from '../models/analysis-result.model';
import { SharePayload, SHARE_HASH_PREFIX, MAX_URL_LENGTH } from '../models/share.model';
import { triggerDownload } from '../utils/download';

@Injectable({ providedIn: 'root' })
export class ShareService {
  async encode(
    result: AnalysisResult,
    format: string,
  ): Promise<{ url: string | null; tooLarge: boolean }> {
    const payload: SharePayload = {
      v: 1,
      fn: result.fileName,
      fs: result.fileSize,
      fmt: format,
      at: result.analyzedAt instanceof Date ? result.analyzedAt.toISOString() : String(result.analyzedAt),
      m: result.metrics,
      ai: result.actionItems,
    };

    const json = JSON.stringify(payload);
    const compressed = await this.compress(json);
    const base64 = this.toBase64Url(compressed);
    const hash = `${SHARE_HASH_PREFIX}${base64}`;

    if (hash.length > MAX_URL_LENGTH) {
      return { url: null, tooLarge: true };
    }

    const url = `${location.origin}${location.pathname}${hash}`;
    return { url, tooLarge: false };
  }

  async decode(hash: string): Promise<SharePayload> {
    if (!hash.startsWith(SHARE_HASH_PREFIX)) {
      throw new Error('Invalid share URL: missing #share= prefix');
    }

    const base64 = hash.slice(SHARE_HASH_PREFIX.length);
    const compressed = this.fromBase64Url(base64);
    const json = await this.decompress(compressed);
    const payload = JSON.parse(json) as SharePayload;

    if (payload.v !== 1) {
      throw new Error(`Unsupported share format version: ${payload.v}`);
    }

    return payload;
  }

  buildPerflensBlob(result: AnalysisResult, format: string): Blob {
    const payload: SharePayload = {
      v: 1,
      fn: result.fileName,
      fs: result.fileSize,
      fmt: format,
      at: result.analyzedAt instanceof Date ? result.analyzedAt.toISOString() : String(result.analyzedAt),
      m: result.metrics,
      ai: result.actionItems,
    };

    return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  }

  downloadPerflensFile(result: AnalysisResult, format: string): void {
    const blob = this.buildPerflensBlob(result, format);
    const baseName = result.fileName.replace(/\.[^.]+$/, '');
    triggerDownload(blob, `${baseName}.perflens`);
  }

  private async compress(text: string): Promise<Uint8Array> {
    const encoded = new TextEncoder().encode(text);
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(encoded);
        controller.close();
      },
    });
    const stream = readable.pipeThrough(new CompressionStream('gzip'));
    const response = new Response(stream);
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  private async decompress(data: Uint8Array): Promise<string> {
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(data);
        controller.close();
      },
    });
    const stream = readable.pipeThrough(new DecompressionStream('gzip'));
    const response = new Response(stream);
    return response.text();
  }

  private toBase64Url(data: Uint8Array): string {
    let binary = '';
    for (const byte of data) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  private fromBase64Url(base64url: string): Uint8Array {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}
