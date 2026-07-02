import { ThirdPartyImpactRule } from './third-party-impact.rule';
import { ParsedTrace } from '../../models/trace-event.model';

function makeTrace(overrides: Partial<ParsedTrace> = {}): ParsedTrace {
  return {
    traceEvents: [],
    metadata: {
      url: 'https://example.com',
      traceStartTime: 0,
      traceEndTime: 5_000_000,
    },
    mainThreadId: 1,
    navigationStart: 0,
    ...overrides,
  };
}

describe('ThirdPartyImpactRule', () => {
  let rule: ThirdPartyImpactRule;

  beforeEach(() => {
    rule = new ThirdPartyImpactRule();
  });

  it('identifies third-party scripts and flags them, ignoring first-party scripts', () => {
    const trace = makeTrace({
      traceEvents: [
        {
          name: 'EvaluateScript',
          cat: 'devtools.timeline',
          ph: 'X',
          ts: 1_000,
          dur: 15_000, // 15ms — third-party, above 10ms threshold
          pid: 1,
          tid: 1,
          args: { data: { url: 'https://analytics.com/tracker.js' } },
        },
        {
          name: 'EvaluateScript',
          cat: 'devtools.timeline',
          ph: 'X',
          ts: 20_000,
          dur: 15_000, // 15ms — first-party, should be ignored
          pid: 1,
          tid: 1,
          args: { data: { url: 'https://example.com/app.js' } },
        },
      ],
    });

    const result = rule.analyze(trace);

    expect(result.actionItems.some(a => a.title.includes('analytics.com'))).toBe(true);
    expect(result.actionItems.some(a => a.title.includes('example.com'))).toBe(false);
  });

  it('aggregates multiple scripts from the same third-party domain', () => {
    const trace = makeTrace({
      traceEvents: [
        {
          name: 'EvaluateScript',
          cat: 'devtools.timeline',
          ph: 'X',
          ts: 1_000,
          dur: 150_000, // 150ms
          pid: 1,
          tid: 1,
          args: { data: { url: 'https://analytics.com/script1.js' } },
        },
        {
          name: 'FunctionCall',
          cat: 'devtools.timeline',
          ph: 'X',
          ts: 200_000,
          dur: 100_000, // 100ms
          pid: 1,
          tid: 1,
          args: { data: { url: 'https://analytics.com/script2.js' } },
        },
      ],
    });

    const result = rule.analyze(trace);

    const item = result.actionItems.find(a => a.title.includes('analytics.com'));
    expect(item).toBeDefined();
    expect(item!.title).toContain('250ms');
  });

  it('returns no action items when all scripts are first-party', () => {
    const trace = makeTrace({
      traceEvents: [
        {
          name: 'EvaluateScript',
          cat: 'devtools.timeline',
          ph: 'X',
          ts: 1_000,
          dur: 50_000, // 50ms — cdn.example.com is same registrable domain as example.com
          pid: 1,
          tid: 1,
          args: { data: { url: 'https://cdn.example.com/app.js' } },
        },
        {
          name: 'FunctionCall',
          cat: 'devtools.timeline',
          ph: 'X',
          ts: 60_000,
          dur: 30_000, // 30ms
          pid: 1,
          tid: 1,
          args: { data: { url: 'https://example.com/vendor.js' } },
        },
      ],
    });

    const result = rule.analyze(trace);

    expect(result.actionItems).toHaveLength(0);
  });
});
