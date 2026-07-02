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
});
