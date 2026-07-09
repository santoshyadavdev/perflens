import type { HeapAnalysisRule, HeapRuleResult } from '../heap-analysis-rule';
import type { ParsedHeapSnapshot, HeapComparison } from '../../models/heap-snapshot.model';
import type { ActionItem } from '../../models/action-item.model';
import type { MetricScore } from '../../models/metric-score.model';
import { formatBytes } from '../../utils/format';

export class GrowthPatternRule implements HeapAnalysisRule {
  readonly name = 'growth-pattern';

  analyze(snapshot: ParsedHeapSnapshot, comparison?: HeapComparison): HeapRuleResult {
    if (!comparison) {
      return { actionItems: [], metrics: [] };
    }

    const actionItems: ActionItem[] = [];

    for (const added of comparison.addedConstructors.slice(0, 5)) {
      actionItems.push({
        id: `growth-pattern-added-${added.name}`,
        title: `New object type "${added.name}" appeared (${added.count} instances, ${formatBytes(added.shallowSize)})`,
        detail: `"${added.name}" was not present in the previous snapshot. This may indicate a leak if the type persists across interactions.`,
        severity: added.shallowSize > 100_000 ? 'warning' as const : 'info' as const,
        metric: 'MEMORY' as const,
        fix: `Investigate why "${added.name}" objects appear after this interaction. If they are not expected, check for missing cleanup or dispose calls.`,
      });
    }

    for (const grown of comparison.grownConstructors.slice(0, 5)) {
      const prevCount = grown.count - grown.countDelta;
      actionItems.push({
        id: `growth-pattern-grown-${grown.name}`,
        title: `"${grown.name}" grew by ${grown.countDelta} instances (+${formatBytes(grown.sizeDelta)})`,
        detail: `"${grown.name}" increased from ${prevCount} to ${grown.count} instances. Steady growth across snapshots suggests a memory leak.`,
        severity: grown.sizeDelta > 500_000 ? 'warning' as const : 'info' as const,
        metric: 'MEMORY' as const,
        fix: `Check retention paths for "${grown.name}" in DevTools. Look for event listeners, caches, or closures that hold references beyond expected lifetime.`,
      });
    }

    const metrics: MetricScore[] = [
      {
        name: 'Heap Growth',
        shortName: 'GRWTH',
        value: comparison.totalSizeDelta,
        displayValue: formatBytes(comparison.totalSizeDelta),
        unit: 'bytes',
        rating: comparison.totalSizeDelta > 10_000_000
          ? 'poor' as const
          : comparison.totalSizeDelta > 1_000_000
            ? 'needs-improvement' as const
            : 'good' as const,
      },
    ];

    return { actionItems, metrics };
  }
}

