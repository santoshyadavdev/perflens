import type { HeapAnalysisRule, HeapRuleResult } from '../heap-analysis-rule';
import type { ParsedHeapSnapshot } from '../../models/heap-snapshot.model';
import type { ActionItem } from '../../models/action-item.model';
import type { MetricScore } from '../../models/metric-score.model';

export class RetainedSizeRule implements HeapAnalysisRule {
  readonly name = 'retained-size-breakdown';

  analyze(snapshot: ParsedHeapSnapshot): HeapRuleResult {
    const totalSize = snapshot.graphData.totalSize;
    const summaries = snapshot.constructorSummaries;

    const topRetainers = summaries.slice(0, 5);

    const metrics: MetricScore[] = [
      {
        name: 'Total Heap Size',
        shortName: 'HEAP',
        value: totalSize,
        displayValue: formatBytes(totalSize),
        unit: 'bytes',
        rating: totalSize > 50_000_000 ? 'poor' : totalSize > 20_000_000 ? 'needs-improvement' : 'good',
      },
    ];

    const actionItems: ActionItem[] = topRetainers.map((s, i) => {
      const pct = totalSize > 0 ? ((s.retainedSize / totalSize) * 100).toFixed(1) : '0.0';
      const isCritical = i === 0 && s.retainedSize > totalSize * 0.3;
      return {
        id: `retained-size-${s.name}-${i}`,
        title: `${s.name} retains ${formatBytes(s.retainedSize)} (${pct}% of heap)`,
        detail: `${s.count} instance(s) of "${s.name}" retain ${formatBytes(s.retainedSize)} total. Review whether all instances are needed.`,
        severity: isCritical ? 'critical' : 'info',
        metric: 'MEMORY',
        fix: `Audit "${s.name}" instances. Remove unused references, use WeakRef/WeakMap where appropriate, or reduce instance count.`,
      };
    });

    return { actionItems, metrics };
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
