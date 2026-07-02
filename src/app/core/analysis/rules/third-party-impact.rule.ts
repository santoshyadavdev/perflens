import { AnalysisRule, RuleResult } from '../analysis-rule';
import { ParsedTrace } from '../../models/trace-event.model';
import { ActionItem, Severity } from '../../models/action-item.model';

const SCRIPT_EVENT_NAMES = new Set(['EvaluateScript', 'FunctionCall', 'v8.compile']);
const MIN_BLOCKING_MS = 10;
const TOP_N = 10;

function getHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function getRegistrableDomain(hostname: string): string {
  // Known limitation: this naive split does not handle PSL cases like co.uk.
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;
  return parts.slice(-2).join('.');
}

function sumMergedIntervalsUs(intervals: Array<{ start: number; end: number }>): number {
  if (intervals.length === 0) return 0;

  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  let total = 0;
  let currentStart = sorted[0].start;
  let currentEnd = sorted[0].end;

  for (const interval of sorted.slice(1)) {
    if (interval.start <= currentEnd) {
      currentEnd = Math.max(currentEnd, interval.end);
      continue;
    }

    total += currentEnd - currentStart;
    currentStart = interval.start;
    currentEnd = interval.end;
  }

  return total + (currentEnd - currentStart);
}

export class ThirdPartyImpactRule implements AnalysisRule {
  readonly name = 'third-party-impact';

  analyze(trace: ParsedTrace): RuleResult {
    const pageHostname = trace.metadata.url
      ? getHostname(trace.metadata.url)
      : this.detectOriginFromRequests(trace);
    const pageRegistrable = pageHostname ? getRegistrableDomain(pageHostname) : null;

    const domainIntervals = new Map<string, Array<{ start: number; end: number }>>();

    for (const event of trace.traceEvents) {
      if (event.ph !== 'X' || event.tid !== trace.mainThreadId) continue;
      if (!SCRIPT_EVENT_NAMES.has(event.name)) continue;

      const data = event.args?.['data'] as Record<string, unknown> | undefined;
      const url = data?.['url'] as string | undefined;
      if (!url) continue;

      const hostname = getHostname(url);
      if (!hostname) continue;

      const registrable = getRegistrableDomain(hostname);
      if (pageRegistrable && registrable === pageRegistrable) continue;

      const durationUs = event.dur ?? 0;
      if (durationUs <= 0) continue;

      const intervals = domainIntervals.get(registrable) ?? [];
      intervals.push({ start: event.ts, end: event.ts + durationUs });
      domainIntervals.set(registrable, intervals);
    }

    const actionItems: ActionItem[] = Array.from(domainIntervals.entries())
      .map(([domain, intervals]) => ({ domain, totalUs: sumMergedIntervalsUs(intervals) }))
      .map(({ domain, totalUs }) => ({ domain, totalMs: totalUs / 1000 }))
      .filter(({ totalMs }) => totalMs > MIN_BLOCKING_MS)
      .sort((a, b) => b.totalMs - a.totalMs)
      .slice(0, TOP_N)
      .map(({ domain, totalMs }, i) => this.buildActionItem(domain, totalMs, i));

    return { actionItems, metrics: [] };
  }

  private buildActionItem(domain: string, totalMs: number, index: number): ActionItem {
    const severity: Severity = totalMs > 500 ? 'critical' : totalMs > 100 ? 'warning' : 'info';
    return {
      id: `third-party-${index}`,
      severity,
      title: `Third-party: ${domain} (${totalMs.toFixed(0)}ms main thread)`,
      detail: `Scripts from ${domain} spent ${totalMs.toFixed(0)}ms blocking the main thread. Third-party scripts run in your page's main thread budget and contribute directly to Total Blocking Time.`,
      metric: 'TBT',
      fix: [
        `1. Add \`async\` or \`defer\` to script tags loading from ${domain} to prevent render blocking`,
        `2. Use a facade pattern (e.g. a click-to-load placeholder) to delay loading until user interaction`,
        `3. Add \`<link rel="preconnect" href="https://${domain}">\` in <head> to reduce connection latency`,
        `4. Audit whether scripts from ${domain} are necessary — remove unused third parties`,
      ].join('\n'),
    };
  }

  private detectOriginFromRequests(trace: ParsedTrace): string | null {
    const counts = new Map<string, number>();
    for (const event of trace.traceEvents) {
      if (event.name !== 'ResourceSendRequest') continue;
      const data = event.args?.['data'] as Record<string, unknown> | undefined;
      const url = data?.['url'] as string | undefined;
      if (!url) continue;
      const hostname = getHostname(url);
      if (!hostname) continue;
      const registrable = getRegistrableDomain(hostname);
      counts.set(registrable, (counts.get(registrable) ?? 0) + 1);
    }
    let max = 0, result: string | null = null;
    for (const [domain, count] of counts) {
      if (count > max) { max = count; result = domain; }
    }
    return result;
  }
}
