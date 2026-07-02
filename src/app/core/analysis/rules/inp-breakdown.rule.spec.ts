import { InpBreakdownRule } from './inp-breakdown.rule';
import { ParsedTrace } from '../../models/trace-event.model';

function makeParsedTrace(overrides: Partial<ParsedTrace> = {}): ParsedTrace {
  return {
    traceEvents: [],
    metadata: { traceStartTime: 0, traceEndTime: 10_000_000 },
    mainThreadId: 1,
    navigationStart: 1_000_000,
    ...overrides,
  };
}

/** Build a synthetic EventTiming trace event.
 *  @param ts          event start in microseconds
 *  @param durationMs  total interaction duration in milliseconds (args.data.duration)
 *  @param processingStartUs offset from ts in microseconds when handler starts
 *  @param processingEndUs  offset from ts in microseconds when handler ends
 */
function makeEventTiming(
  interactionId: number,
  ts: number,
  durationMs: number,
  processingStartUs: number,
  processingEndUs: number,
  type = 'click',
) {
  return {
    name: 'EventTiming',
    cat: 'devtools.timeline',
    ph: 'R' as const,
    ts,
    pid: 1,
    tid: 1,
    args: {
      data: {
        interactionId,
        type,
        duration: durationMs,
        processingStart: ts + processingStartUs,
        processingEnd: ts + processingEndUs,
      },
    },
  };
}

describe('InpBreakdownRule', () => {
  let rule: InpBreakdownRule;

  beforeEach(() => {
    rule = new InpBreakdownRule();
  });

  it('returns INP metric from EventTiming events (worst = 300ms → poor)', () => {
    const trace = makeParsedTrace({
      traceEvents: [
        makeEventTiming(1, 2_000_000, 100, 10_000, 60_000),  // 100ms – good
        makeEventTiming(2, 3_000_000, 300, 20_000, 200_000), // 300ms – needs-improvement / poor
      ],
    });

    const { metrics } = rule.analyze(trace);
    const inp = metrics.find(m => m.shortName === 'INP');

    expect(inp).toBeDefined();
    expect(inp!.value).toBe(300);
    expect(inp!.rating).toBe('needs-improvement');
  });

  it('reports action item for slow interactions with breakdown detail', () => {
    const trace = makeParsedTrace({
      traceEvents: [
        makeEventTiming(1, 2_000_000, 250, 30_000, 200_000), // 250ms > 200ms threshold
      ],
    });

    const { actionItems } = rule.analyze(trace);

    expect(actionItems.length).toBeGreaterThanOrEqual(1);
    const item = actionItems[0];
    expect(item.metric).toBe('INP');
    expect(item.severity).toBe('warning');
    expect(item.detail).toContain('250ms');
  });

  it('returns empty results when no EventTiming events exist', () => {
    const trace = makeParsedTrace({
      traceEvents: [
        { name: 'Paint', cat: 'devtools.timeline', ph: 'X', ts: 2_000_000, dur: 5000, pid: 1, tid: 1 },
      ],
    });

    const { metrics, actionItems } = rule.analyze(trace);

    expect(metrics).toHaveLength(0);
    expect(actionItems).toHaveLength(0);
  });

  it('decomposes INP into input delay, processing, and presentation delay', () => {
    // ts = 2_000_000µs, processingStart offset = 50_000µs (50ms input delay)
    // processingEnd offset = 150_000µs (100ms processing)
    // total duration = 300ms → presentation delay = 300 - 50 - 100 = 150ms
    const trace = makeParsedTrace({
      traceEvents: [
        makeEventTiming(1, 2_000_000, 300, 50_000, 150_000),
      ],
    });

    const { actionItems } = rule.analyze(trace);
    const item = actionItems.find(a => a.metric === 'INP');

    expect(item).toBeDefined();
    expect(item!.detail).toContain('Input delay: 50ms');
    expect(item!.detail).toContain('Processing: 100ms');
    expect(item!.detail).toContain('Presentation delay: 150ms');
  });

  it('clamps negative input delay and processing values to zero', () => {
    const trace = makeParsedTrace({
      traceEvents: [
        makeEventTiming(1, 2_000_000, 250, -10_000, -20_000),
      ],
    });

    const { actionItems } = rule.analyze(trace);
    const item = actionItems.find(a => a.metric === 'INP');

    expect(item).toBeDefined();
    expect(item!.detail).toContain('Input delay: 0ms');
    expect(item!.detail).toContain('Processing: 0ms');
  });
});
