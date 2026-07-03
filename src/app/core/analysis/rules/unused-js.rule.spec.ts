import { UnusedJsRule } from './unused-js.rule';
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

describe('UnusedJsRule', () => {
  let rule: UnusedJsRule;

  beforeEach(() => {
    rule = new UnusedJsRule();
  });

  it('flags large script (300KB) with very short execution (5ms)', () => {
    // ratio = 5ms / 300KB = 0.017 < 0.5 => should flag
    const trace = makeTrace({
      traceEvents: [
        {
          name: 'ResourceSendRequest',
          cat: 'devtools.timeline',
          ph: 'I',
          ts: 1_000,
          pid: 1,
          tid: 1,
          args: { data: { requestId: 'req-1', url: 'https://example.com/vendor.js' } },
        },
        {
          name: 'ResourceFinish',
          cat: 'devtools.timeline',
          ph: 'I',
          ts: 50_000,
          pid: 1,
          tid: 1,
          args: { data: { requestId: 'req-1', encodedDataLength: 300_000 } },
        },
        {
          name: 'EvaluateScript',
          cat: 'devtools.timeline',
          ph: 'X',
          ts: 100_000,
          dur: 5_000, // 5ms in microseconds
          pid: 1,
          tid: 1,
          args: { data: { url: 'https://example.com/vendor.js' } },
        },
      ],
    });

    const result = rule.analyze(trace);

    expect(result.actionItems.length).toBe(1);
    expect(result.actionItems[0].title).toContain('vendor.js');
    expect(result.actionItems[0].title).toContain('300');
    expect(result.actionItems[0].metric).toBe('SIZE');
  });

  it('does not flag script with proportional execution (100KB, 200ms exec)', () => {
    // ratio = 200ms / 100KB = 2.0 > 0.5 => should not flag
    const trace = makeTrace({
      traceEvents: [
        {
          name: 'ResourceSendRequest',
          cat: 'devtools.timeline',
          ph: 'I',
          ts: 1_000,
          pid: 1,
          tid: 1,
          args: { data: { requestId: 'req-2', url: 'https://example.com/app.js' } },
        },
        {
          name: 'ResourceFinish',
          cat: 'devtools.timeline',
          ph: 'I',
          ts: 50_000,
          pid: 1,
          tid: 1,
          args: { data: { requestId: 'req-2', encodedDataLength: 100_000 } },
        },
        {
          name: 'EvaluateScript',
          cat: 'devtools.timeline',
          ph: 'X',
          ts: 100_000,
          dur: 200_000, // 200ms in microseconds
          pid: 1,
          tid: 1,
          args: { data: { url: 'https://example.com/app.js' } },
        },
      ],
    });

    const result = rule.analyze(trace);

    expect(result.actionItems.length).toBe(0);
  });

  it('does not flag small scripts (5KB) below MIN_SCRIPT_SIZE', () => {
    // size = 5KB < 50KB threshold => should not flag regardless of ratio
    const trace = makeTrace({
      traceEvents: [
        {
          name: 'ResourceSendRequest',
          cat: 'devtools.timeline',
          ph: 'I',
          ts: 1_000,
          pid: 1,
          tid: 1,
          args: { data: { requestId: 'req-3', url: 'https://example.com/tiny.js' } },
        },
        {
          name: 'ResourceFinish',
          cat: 'devtools.timeline',
          ph: 'I',
          ts: 50_000,
          pid: 1,
          tid: 1,
          args: { data: { requestId: 'req-3', encodedDataLength: 5_000 } },
        },
        {
          name: 'EvaluateScript',
          cat: 'devtools.timeline',
          ph: 'X',
          ts: 100_000,
          dur: 1_000, // 1ms in microseconds
          pid: 1,
          tid: 1,
          args: { data: { url: 'https://example.com/tiny.js' } },
        },
      ],
    });

    const result = rule.analyze(trace);

    expect(result.actionItems.length).toBe(0);
  });
});
