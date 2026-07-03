import { ClsCulpritsRule } from './cls-culprits.rule';
import { ParsedTrace, TraceEvent } from '../../models/trace-event.model';

function buildTrace(events: TraceEvent[]): ParsedTrace {
  return {
    traceEvents: events,
    metadata: { traceStartTime: 0, traceEndTime: 10_000_000 },
    mainThreadId: 1,
    navigationStart: 0,
  };
}

function makeLayoutShift(ts: number, score: number, hadRecentInput: boolean, impactedNodes = 1): TraceEvent {
  return {
    name: 'LayoutShift',
    cat: 'loading',
    ph: 'I',
    ts,
    pid: 1,
    tid: 1,
    args: {
      data: {
        had_recent_input: hadRecentInput,
        score,
        impacted_nodes: Array.from({ length: impactedNodes }, (_, i) => ({
          node_id: i + 1,
          old_rect: [0, i * 100, 200, 50],
          new_rect: [0, i * 100 + 30, 200, 50],
        })),
      },
    },
  };
}

describe('ClsCulpritsRule', () => {
  let rule: ClsCulpritsRule;

  beforeEach(() => {
    rule = new ClsCulpritsRule();
  });

  it('computes CLS metric from LayoutShift events', () => {
    const trace = buildTrace([
      makeLayoutShift(1_000_000, 0.05, false),
      makeLayoutShift(2_000_000, 0.08, false),
    ]);
    const result = rule.analyze(trace);
    const cls = result.metrics.find(m => m.shortName === 'CLS');
    expect(cls).toBeDefined();
    expect(cls!.value).toBeCloseTo(0.13, 5);
    expect(cls!.rating).toBe('needs-improvement');
  });

  it('ignores layout shifts with recent input (CLS = 0, good)', () => {
    const trace = buildTrace([
      makeLayoutShift(1_000_000, 0.3, true),
      makeLayoutShift(2_000_000, 0.2, true),
    ]);
    const result = rule.analyze(trace);
    const cls = result.metrics.find(m => m.shortName === 'CLS');
    expect(cls).toBeDefined();
    expect(cls!.value).toBe(0);
    expect(cls!.rating).toBe('good');
  });

  it('produces action items for poor CLS', () => {
    const trace = buildTrace([
      makeLayoutShift(1_000_000, 0.15, false, 2),
      makeLayoutShift(2_000_000, 0.12, false, 1),
      makeLayoutShift(3_000_000, 0.05, false, 1),
    ]);
    const result = rule.analyze(trace);
    const cls = result.metrics.find(m => m.shortName === 'CLS');
    expect(cls!.rating).not.toBe('good');
    expect(result.actionItems.length).toBeGreaterThanOrEqual(1);
    expect(result.actionItems.every(a => a.metric === 'CLS')).toBe(true);
    // Top shift (0.15) should be critical
    const topItem = result.actionItems.find(a => a.id.startsWith('cls-shift-'));
    expect(topItem).toBeDefined();
    expect(topItem!.severity).toBe('critical');
  });

  it('returns good CLS with info item for stable pages', () => {
    const trace = buildTrace([
      makeLayoutShift(1_000_000, 0.02, false),
      makeLayoutShift(2_000_000, 0.03, false),
    ]);
    const result = rule.analyze(trace);
    const cls = result.metrics.find(m => m.shortName === 'CLS');
    expect(cls!.rating).toBe('good');
    expect(result.actionItems.length).toBe(1);
    expect(result.actionItems[0].severity).toBe('info');
    expect(result.actionItems[0].metric).toBe('CLS');
  });
});
