import { ImageDeliveryRule } from './image-delivery.rule';
import { ParsedTrace, TraceEvent } from '../../models/trace-event.model';

function makeTrace(events: TraceEvent[]): ParsedTrace {
  return {
    traceEvents: events,
    metadata: {},
    mainThreadId: 1,
    navigationStart: 0,
  };
}

function sendRequest(requestId: string, url: string, ts = 0): TraceEvent {
  return {
    name: 'ResourceSendRequest',
    cat: 'devtools.timeline',
    ph: 'I',
    ts,
    pid: 1,
    tid: 1,
    args: { data: { requestId, url } },
  };
}

function receiveResponse(requestId: string, mimeType: string, encodedDataLength = 0): TraceEvent {
  return {
    name: 'ResourceReceiveResponse',
    cat: 'devtools.timeline',
    ph: 'I',
    ts: 10,
    pid: 1,
    tid: 1,
    args: { data: { requestId, mimeType, encodedDataLength } },
  };
}

function finishRequest(requestId: string, encodedDataLength: number): TraceEvent {
  return {
    name: 'ResourceFinish',
    cat: 'devtools.timeline',
    ph: 'I',
    ts: 20,
    pid: 1,
    tid: 1,
    args: { data: { requestId, encodedDataLength } },
  };
}

describe('ImageDeliveryRule', () => {
  let rule: ImageDeliveryRule;

  beforeEach(() => {
    rule = new ImageDeliveryRule();
  });

  it('flags a large JPEG (512KB) and suggests WebP/AVIF conversion', () => {
    const sizeBytes = 512 * 1024; // 512KB
    const events: TraceEvent[] = [
      sendRequest('req-1', 'https://example.com/hero.jpg'),
      receiveResponse('req-1', 'image/jpeg'),
      finishRequest('req-1', sizeBytes),
    ];

    const result = rule.analyze(makeTrace(events));

    expect(result.actionItems.length).toBeGreaterThanOrEqual(1);
    const item = result.actionItems[0];
    expect(item.severity).toBe('critical');
    expect(item.metric).toBe('LCP');
    expect(item.title.toLowerCase()).toContain('hero.jpg');
    expect(item.fix.toLowerCase()).toMatch(/webp|avif/);
  });

  it('does not flag svg images for raster format conversion', () => {
    const sizeBytes = 600 * 1024;
    const events: TraceEvent[] = [
      sendRequest('req-svg', 'https://example.com/logo.svg'),
      receiveResponse('req-svg', 'image/svg+xml'),
      finishRequest('req-svg', sizeBytes),
    ];

    const result = rule.analyze(makeTrace(events));

    expect(result.actionItems).toHaveLength(0);
  });

  it('only marks the largest flagged image as LCP and qualifies fetchpriority guidance', () => {
    const heroBytes = 700 * 1024;
    const galleryBytes = 120 * 1024;
    const events: TraceEvent[] = [
      sendRequest('hero', 'https://example.com/hero.jpg'),
      receiveResponse('hero', 'image/jpeg'),
      finishRequest('hero', heroBytes),
      sendRequest('gallery', 'https://example.com/gallery.jpg'),
      receiveResponse('gallery', 'image/jpeg'),
      finishRequest('gallery', galleryBytes),
    ];

    const result = rule.analyze(makeTrace(events));

    const hero = result.actionItems.find(item => item.title.includes('hero.jpg'));
    const gallery = result.actionItems.find(item => item.title.includes('gallery.jpg'));

    expect(hero?.metric).toBe('LCP');
    expect(hero?.fix).toContain('if this is the LCP image');
    expect(gallery?.metric).toBe('SIZE');
    expect(gallery?.fix).toContain('if this is the LCP image');
  });

  it('accumulates ResourceReceivedData chunks when response and finish sizes are zero', () => {
    const chunkSizes = [60 * 1024, 40 * 1024];
    const events: TraceEvent[] = [
      sendRequest('req-4', 'https://example.com/photo.jpg'),
      receiveResponse('req-4', 'image/jpeg', 0),
      {
        name: 'ResourceReceivedData',
        cat: 'devtools.timeline',
        ph: 'I',
        ts: 15,
        pid: 1,
        tid: 1,
        args: { data: { requestId: 'req-4', encodedDataLength: chunkSizes[0] } },
      },
      {
        name: 'ResourceReceivedData',
        cat: 'devtools.timeline',
        ph: 'I',
        ts: 16,
        pid: 1,
        tid: 1,
        args: { data: { requestId: 'req-4', encodedDataLength: chunkSizes[1] } },
      },
      finishRequest('req-4', 0),
    ];

    const result = rule.analyze(makeTrace(events));

    expect(result.actionItems).toHaveLength(1);
    expect(result.actionItems[0].title).toContain('100KB');
  });

  it('does not flag a small PNG (5KB)', () => {
    const sizeBytes = 5 * 1024; // 5KB — below the 50KB threshold
    const events: TraceEvent[] = [
      sendRequest('req-2', 'https://example.com/icon.png'),
      receiveResponse('req-2', 'image/png'),
      finishRequest('req-2', sizeBytes),
    ];

    const result = rule.analyze(makeTrace(events));

    expect(result.actionItems).toHaveLength(0);
  });

  it('does not flag a modern-format image (200KB WebP)', () => {
    const sizeBytes = 200 * 1024; // 200KB WebP — modern format, size between 50KB and 500KB
    const events: TraceEvent[] = [
      sendRequest('req-3', 'https://example.com/photo.webp'),
      receiveResponse('req-3', 'image/webp'),
      finishRequest('req-3', sizeBytes),
    ];

    const result = rule.analyze(makeTrace(events));

    expect(result.actionItems).toHaveLength(0);
  });
});
