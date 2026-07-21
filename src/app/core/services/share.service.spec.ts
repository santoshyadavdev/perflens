import { TestBed } from '@angular/core/testing';
import { ShareService } from './share.service';
import { AnalysisResult } from '../models/analysis-result.model';
import { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { CompressionStream as NodeCompressionStream, DecompressionStream as NodeDecompressionStream } from 'node:stream/web';

// Polyfill streaming APIs for jsdom
if (typeof globalThis.ReadableStream === 'undefined') {
  (globalThis as any).ReadableStream = NodeReadableStream;
}
if (typeof globalThis.CompressionStream === 'undefined') {
  (globalThis as any).CompressionStream = NodeCompressionStream;
}
if (typeof globalThis.DecompressionStream === 'undefined') {
  (globalThis as any).DecompressionStream = NodeDecompressionStream;
}

const EMPTY_TRACE = {
  traceEvents: [],
  metadata: { traceStartTime: 0, traceEndTime: 0 },
  mainThreadId: 0,
  navigationStart: 0,
};

function makeResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    fileName: 'trace.json',
    fileSize: 1024,
    analyzedAt: new Date('2026-07-21T12:00:00Z'),
    metrics: [{ name: 'LCP', shortName: 'LCP', value: 2000, displayValue: '2.0s', unit: 'ms', rating: 'good' }],
    actionItems: [{ id: 'a1', severity: 'critical', title: 'Fix LCP', detail: 'Detail', metric: 'LCP', fix: 'Fix' }],
    parsedTrace: EMPTY_TRACE,
    ...overrides,
  };
}

describe('ShareService', () => {
  let service: ShareService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ShareService],
    });
    service = TestBed.inject(ShareService);
  });

  it('should encode and decode a result roundtrip', async () => {
    const result = makeResult();
    const encoded = await service.encode(result, 'perf-trace');

    expect(encoded.url).toBeTruthy();
    expect(encoded.tooLarge).toBe(false);

    const hash = encoded.url!.split('#')[1];
    const decoded = await service.decode(`#${hash}`);

    expect(decoded.fn).toBe('trace.json');
    expect(decoded.fs).toBe(1024);
    expect(decoded.fmt).toBe('perf-trace');
    expect(decoded.m).toHaveLength(1);
    expect(decoded.m[0].shortName).toBe('LCP');
    expect(decoded.ai).toHaveLength(1);
    expect(decoded.ai[0].id).toBe('a1');
  });

  it('should flag tooLarge when encoded data exceeds limit', async () => {
    const bigItems = Array.from({ length: 500 }, (_, i) => ({
      id: `item-${i}`,
      severity: 'critical' as const,
      title: `Issue ${i} with a very long title that takes up space ${'x'.repeat(100)}`,
      detail: `Detail for issue ${i} ${'y'.repeat(200)}`,
      metric: 'LCP' as const,
      fix: `Fix for issue ${i} ${'z'.repeat(200)}`,
    }));

    const result = makeResult({ actionItems: bigItems });
    const encoded = await service.encode(result, 'perf-trace');

    expect(encoded.tooLarge).toBe(true);
    expect(encoded.url).toBeNull();
  });

  it('should throw on invalid hash data', async () => {
    await expect(service.decode('#share=invaliddata!!!')).rejects.toThrow();
  });

  it('should build a .perflens file blob', () => {
    const result = makeResult();
    const blob = service.buildPerflensBlob(result, 'perf-trace');

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/json');
  });
});
