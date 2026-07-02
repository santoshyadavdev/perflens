import { NetworkChainRule } from './network-chain.rule';
import { ParsedTrace, TraceEvent } from '../../models/trace-event.model';

function makeTrace(events: TraceEvent[]): ParsedTrace {
  return {
    traceEvents: events,
    metadata: {},
    mainThreadId: 1,
    navigationStart: 0,
  };
}

function sendRequest(requestId: string, url: string, ts: number): TraceEvent {
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

function finishRequest(requestId: string, ts: number, encodedDataLength = 1024): TraceEvent {
  return {
    name: 'ResourceFinish',
    cat: 'devtools.timeline',
    ph: 'I',
    ts,
    pid: 1,
    tid: 1,
    args: { data: { requestId, encodedDataLength } },
  };
}

describe('NetworkChainRule', () => {
  let rule: NetworkChainRule;

  beforeEach(() => {
    rule = new NetworkChainRule();
  });

  it('detects a chain of 3 sequential requests', () => {
    // A: 0 -> 100ms, B: 100ms -> 300ms, C: 310ms -> 500ms
    // All in microseconds
    const events: TraceEvent[] = [
      sendRequest('req-a', 'index.html', 0),
      finishRequest('req-a', 100_000),
      sendRequest('req-b', 'styles.css', 100_000),
      finishRequest('req-b', 300_000),
      sendRequest('req-c', 'font.woff2', 310_000),
      finishRequest('req-c', 500_000),
    ];

    const result = rule.analyze(makeTrace(events));
    expect(result.actionItems.length).toBeGreaterThanOrEqual(1);

    const item = result.actionItems[0];
    expect(item.title).toContain('3 requests');
    expect(item.title).toContain('500ms');
    expect(item.detail).toContain('index.html');
    expect(item.detail).toContain('styles.css');
    expect(item.detail).toContain('font.woff2');
    expect(item.detail).toContain('→');
    expect(item.metric).toBe('LCP');
  });

  it('does not flag parallel requests as a chain', () => {
    // A and B both start near 0 — parallel, not sequential
    const events: TraceEvent[] = [
      sendRequest('req-a', 'index.html', 0),
      sendRequest('req-b', 'styles.css', 5_000),
      finishRequest('req-a', 200_000),
      finishRequest('req-b', 300_000),
      sendRequest('req-c', 'font.woff2', 310_000),
      finishRequest('req-c', 500_000),
    ];

    const result = rule.analyze(makeTrace(events));
    // No 3-link chain exists: A and B start in parallel, C follows B but that's only 2 links
    expect(result.actionItems.length).toBe(0);
  });

  it('returns empty metrics array', () => {
    const result = rule.analyze(makeTrace([]));
    expect(result.metrics).toEqual([]);
  });

  it('marks chain >2000ms as critical severity', () => {
    // A: 0 -> 1000ms, B: 1000ms -> 2000ms, C: 2000ms -> 2500ms
    const events: TraceEvent[] = [
      sendRequest('req-a', 'index.html', 0),
      finishRequest('req-a', 1_000_000),
      sendRequest('req-b', 'styles.css', 1_000_000),
      finishRequest('req-b', 2_000_000),
      sendRequest('req-c', 'font.woff2', 2_000_000),
      finishRequest('req-c', 2_500_000),
    ];

    const result = rule.analyze(makeTrace(events));
    expect(result.actionItems.length).toBeGreaterThanOrEqual(1);
    expect(result.actionItems[0].severity).toBe('critical');
  });
});
