import type { HeapAnalysisRule, HeapRuleResult } from '../heap-analysis-rule';
import type { ParsedHeapSnapshot } from '../../models/heap-snapshot.model';
import type { ActionItem } from '../../models/action-item.model';
import type { MetricScore } from '../../models/metric-score.model';
import { formatBytes } from '../../utils/format';

const LISTENER_PATTERNS = ['EventListener', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver'];
const HIGH_COUNT_THRESHOLD = 50;

export class EventListenerLeaksRule implements HeapAnalysisRule {
  readonly name = 'event-listener-leaks';

  analyze(snapshot: ParsedHeapSnapshot): HeapRuleResult {
    const listenerSummaries = snapshot.constructorSummaries.filter(s =>
      LISTENER_PATTERNS.some(pattern => s.name.includes(pattern))
    );

    const actionItems: ActionItem[] = listenerSummaries
      .filter(s => s.count >= 1)
      .map((s, i) => ({
        id: `event-listener-leaks-${s.name}-${i}`,
        title: `${s.count} ${s.name} instance(s) found (${formatBytes(s.retainedSize)} retained)`,
        detail: `Found ${s.count} "${s.name}" objects retaining ${formatBytes(s.retainedSize)}. ${
          s.count > HIGH_COUNT_THRESHOLD
            ? 'High count suggests leaked listeners — ensure removeEventListener or unsubscribe is called on cleanup.'
            : 'Review if all listeners are necessary and properly cleaned up.'
        }`,
        severity: s.count > HIGH_COUNT_THRESHOLD ? ('warning' as const) : ('info' as const),
        metric: 'MEMORY' as const,
        fix: `For each "${s.name}", ensure cleanup is performed: call removeEventListener, disconnect(), or unsubscribe() in the component/class teardown lifecycle (e.g. ngOnDestroy, AbortController).`,
      }));

    const totalListeners = listenerSummaries.reduce((sum, s) => sum + s.count, 0);

    const metrics: MetricScore[] = [
      {
        name: 'Event Listener Count',
        shortName: 'EVTL',
        value: totalListeners,
        displayValue: String(totalListeners),
        unit: '',
        rating:
          totalListeners > HIGH_COUNT_THRESHOLD
            ? ('poor' as const)
            : totalListeners > 20
              ? ('needs-improvement' as const)
              : ('good' as const),
      },
    ];

    return { actionItems, metrics };
  }
}

