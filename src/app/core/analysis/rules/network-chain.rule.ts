import { AnalysisRule, RuleResult } from '../analysis-rule';
import { ParsedTrace, TraceEvent } from '../../models/trace-event.model';
import { ActionItem } from '../../models/action-item.model';

interface NetworkRequest {
  id: string;
  url: string;
  startTs: number;
  endTs: number;
}

const CHAIN_TOLERANCE_US = 50_000;   // 50ms in microseconds
const MIN_CHAIN_DURATION_US = 500_000; // 500ms
const MIN_CHAIN_LENGTH = 3;

export class NetworkChainRule implements AnalysisRule {
  readonly name = 'network-chain';

  analyze(trace: ParsedTrace): RuleResult {
    const requests = this.buildRequests(trace.traceEvents);
    requests.sort((a, b) => a.startTs - b.startTs);

    const chains = this.findChains(requests);
    const actionItems: ActionItem[] = chains
      .filter(c => c.length >= MIN_CHAIN_LENGTH)
      .filter(c => {
        const duration = c[c.length - 1].endTs - c[0].startTs;
        return duration >= MIN_CHAIN_DURATION_US;
      })
      .map((chain, i) => this.buildActionItem(chain, i));

    return { actionItems, metrics: [] };
  }

  private buildRequests(events: TraceEvent[]): NetworkRequest[] {
    const starts = new Map<string, { url: string; ts: number }>();
    const requests: NetworkRequest[] = [];

    for (const e of events) {
      if (e.name === 'ResourceSendRequest') {
        const data = e.args?.['data'] as Record<string, unknown> | undefined;
        const requestId = data?.['requestId'] as string;
        const url = data?.['url'] as string;
        if (requestId && url) {
          starts.set(requestId, { url, ts: e.ts });
        }
      }
    }

    for (const e of events) {
      if (e.name === 'ResourceFinish') {
        const data = e.args?.['data'] as Record<string, unknown> | undefined;
        const requestId = data?.['requestId'] as string;
        if (requestId && starts.has(requestId)) {
          const start = starts.get(requestId)!;
          requests.push({ id: requestId, url: start.url, startTs: start.ts, endTs: e.ts });
        }
      }
    }

    return requests;
  }

  private findChains(requests: NetworkRequest[]): NetworkRequest[][] {
    if (requests.length === 0) return [];

    // chainEnds[i] = longest chain ending at request i
    const chainEnds: NetworkRequest[][] = requests.map(r => [r]);

    for (let i = 1; i < requests.length; i++) {
      for (let j = 0; j < i; j++) {
        const gap = requests[i].startTs - requests[j].endTs;
        if (gap >= 0 && gap <= CHAIN_TOLERANCE_US) {
          const candidate = [...chainEnds[j], requests[i]];
          if (candidate.length > chainEnds[i].length) {
            chainEnds[i] = candidate;
          }
        }
      }
    }

    // Collect only chains that are not sub-chains of a longer one
    const maxChains = chainEnds.filter((chain, i) => {
      return !chainEnds.some((other, j) => j !== i && other.length > chain.length && this.isSubChain(chain, other));
    });

    // Deduplicate by chain identity
    const seen = new Set<string>();
    return maxChains.filter(chain => {
      const key = chain.map(r => r.id).join(',');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private isSubChain(sub: NetworkRequest[], full: NetworkRequest[]): boolean {
    const subIds = sub.map(r => r.id);
    const fullIds = new Set(full.map(r => r.id));
    return subIds.every(id => fullIds.has(id));
  }

  private buildActionItem(chain: NetworkRequest[], index: number): ActionItem {
    const durationUs = chain[chain.length - 1].endTs - chain[0].startTs;
    const durationMs = Math.round(durationUs / 1000);
    const severity = durationMs > 2000 ? 'critical' : 'warning';
    const names = chain.map(r => r.url.split('/').pop() ?? r.url);

    const label = severity === 'critical' ? 'Critical' : 'Long';
    return {
      id: `network-chain-${index}`,
      severity,
      title: `${label} request chain: ${chain.length} requests (${durationMs}ms)`,
      detail: names.join(' → '),
      metric: 'LCP' as const,
      fix: [
        `This ${chain.length}-request chain adds ${durationMs}ms to page load time.`,
        '',
        '1. Preload critical resources: `<link rel="preload" href="..." as="style">`',
        '2. Inline critical CSS to eliminate CSS fetch from chain',
        '3. Use `<link rel="preconnect">` for third-party origins',
        '4. Bundle resources to reduce sequential requests',
      ].join('\n'),
    };
  }
}
