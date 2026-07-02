import { TestBed } from '@angular/core/testing';
import { FormatDetectorService } from './format-detector.service';
import { FileFormat } from '../models/trace-event.model';

describe('FormatDetectorService', () => {
  let service: FormatDetectorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FormatDetectorService);
  });

  function makeFile(content: string, name: string): File {
    return new File([content], name, { type: 'application/json' });
  }

  function makeGzipFile(content: string, name: string): File {
    // Create a file with gzip magic bytes followed by content.
    // DecompressionStream isn't available in jsdom, so we mock readFileText for actual gzip tests.
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const gzipMagic = new Uint8Array([0x1f, 0x8b]);
    const combined = new Uint8Array(gzipMagic.length + data.length);
    combined.set(gzipMagic, 0);
    combined.set(data, gzipMagic.length);
    return new File([combined], name, { type: 'application/gzip' });
  }

  it('detects Chrome perf trace with traceEvents key', async () => {
    const file = makeFile('{"traceEvents":[{"ph":"X"}]}', 'trace.json');
    const result = await service.detect(file);
    expect(result).toBe('perf-trace');
  });

  it('detects Chrome perf trace as array format', async () => {
    const file = makeFile('[{"ph":"X","cat":"devtools.timeline"}]', 'trace.json');
    const result = await service.detect(file);
    expect(result).toBe('perf-trace');
  });

  it('detects heap snapshot', async () => {
    const file = makeFile('{"snapshot":{"meta":{"node_fields":[]}}}', 'snap.heapsnapshot');
    const result = await service.detect(file);
    expect(result).toBe('heap-snapshot');
  });

  it('detects CPU profile', async () => {
    const file = makeFile('{"nodes":[{"id":1}],"startTime":0,"endTime":1}', 'prof.cpuprofile');
    const result = await service.detect(file);
    expect(result).toBe('cpu-profile');
  });

  it('detects V8 log', async () => {
    const file = makeFile('v8-version,12,0,0\ncode-creation,LazyCompile,0,0x1234,100,func', 'v8.log');
    const result = await service.detect(file);
    expect(result).toBe('v8-log');
  });

  it('returns unknown for unrecognized format', async () => {
    const file = makeFile('just some random text', 'data.txt');
    const result = await service.detect(file);
    expect(result).toBe('unknown');
  });

  it('detects gzipped file by magic bytes and decompresses', async () => {
    // Mock readFileText to simulate gzip decompression
    const gzipUtil = await import('./gzip.util');
    const spy = vi.spyOn(gzipUtil, 'readFileText').mockResolvedValue('{"traceEvents":[{"ph":"X"}]}');

    const file = makeGzipFile('ignored', 'trace.json.gz');
    const result = await service.detect(file);
    expect(result).toBe('perf-trace');
    spy.mockRestore();
  });

  it('identifies gzip magic bytes correctly', async () => {
    const { isGzipped } = await import('./gzip.util');
    const gzipBuffer = new Uint8Array([0x1f, 0x8b, 0x08, 0x00]).buffer;
    expect(isGzipped(gzipBuffer)).toBe(true);

    const jsonBuffer = new Uint8Array([0x7b, 0x22]).buffer; // {"
    expect(isGzipped(jsonBuffer)).toBe(false);
  });
});
