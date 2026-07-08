import type { HeapAnalysisRule, HeapRuleResult } from '../heap-analysis-rule';
import type { ParsedHeapSnapshot } from '../../models/heap-snapshot.model';
import type { ActionItem } from '../../models/action-item.model';
import type { MetricScore } from '../../models/metric-score.model';

export class DetachedDomRule implements HeapAnalysisRule {
  readonly name = 'detached-dom';

  analyze(snapshot: ParsedHeapSnapshot): HeapRuleResult {
    const detached = snapshot.detachedDOMNodes;

    const actionItems: ActionItem[] = detached.map((node, i) => ({
      id: `detached-dom-${node.nodeOrdinal}-${i}`,
      title: `Detached "${node.className}" retaining ${formatBytes(node.retainedSize)}`,
      detail: `A detached ${node.className} node is still retained in memory. Retainer chain: ${node.retainerChain.join(' → ') || 'unknown'}. Remove references to allow garbage collection.`,
      severity: node.retainedSize > 1_000_000 ? 'critical' as const : 'warning' as const,
      metric: 'MEMORY' as const,
      fix: `Remove all references to this detached ${node.className} node. Check event listeners, closures, and global variables that may hold references.`,
    }));

    const metrics: MetricScore[] = [
      {
        name: 'Detached DOM Nodes',
        shortName: 'DDOM',
        value: detached.length,
        displayValue: String(detached.length),
        unit: '',
        rating: detached.length > 50 ? 'poor' as const : detached.length > 10 ? 'needs-improvement' as const : 'good' as const,
      },
    ];

    return { actionItems, metrics };
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
