import type { HeapAnalysisRule, HeapRuleResult } from '../heap-analysis-rule';
import type { ParsedHeapSnapshot } from '../../models/heap-snapshot.model';
import type { ActionItem } from '../../models/action-item.model';
import type { MetricScore } from '../../models/metric-score.model';
import { formatBytes } from '../../utils/format';

const LARGE_CLOSURE_RETAINED = 1_000_000; // 1MB
const WARN_CLOSURE_RETAINED = 100_000; // 100KB

export class ClosureLeaksRule implements HeapAnalysisRule {
  readonly name = 'closure-leaks';

  analyze(snapshot: ParsedHeapSnapshot): HeapRuleResult {
    const closureSummary = snapshot.typeSummaries.find(t => t.type === 'closure');

    const totalClosures = closureSummary?.count ?? 0;

    const metrics: MetricScore[] = [
      {
        name: 'Closure Count',
        shortName: 'CLSR',
        value: totalClosures,
        displayValue: String(totalClosures),
        unit: '',
        rating:
          totalClosures > 500
            ? ('poor' as const)
            : totalClosures > 100
              ? ('needs-improvement' as const)
              : ('good' as const),
      },
    ];

    if (!closureSummary || closureSummary.count === 0) {
      return { actionItems: [], metrics };
    }

    // Build closure summaries directly from nodes with type === 'closure'
    // to avoid matching non-closure objects that share the same name.
    const closureNodes = snapshot.graphData.nodes.filter(n => n.type === 'closure');
    const closureByName = new Map<string, { count: number; retainedSize: number }>();
    for (const node of closureNodes) {
      const entry = closureByName.get(node.name);
      if (entry) {
        entry.count++;
        entry.retainedSize += node.retainedSize;
      } else {
        closureByName.set(node.name, { count: 1, retainedSize: node.retainedSize });
      }
    }

    const closureConstructors = Array.from(closureByName.entries())
      .map(([name, { count, retainedSize }]) => ({ name, count, retainedSize }))
      .filter(s => s.retainedSize > WARN_CLOSURE_RETAINED)
      .sort((a, b) => b.retainedSize - a.retainedSize);

    const actionItems: ActionItem[] = closureConstructors.slice(0, 10).map((s, i) => ({
      id: `closure-leaks-${s.name}-${i}`,
      title: `Closure "${s.name}" retains ${formatBytes(s.retainedSize)}`,
      detail: `${s.count} closure(s) named "${s.name}" retain ${formatBytes(s.retainedSize)}. Large closures often capture unnecessary variables in their scope.`,
      severity: s.retainedSize > LARGE_CLOSURE_RETAINED ? ('warning' as const) : ('info' as const),
      metric: 'MEMORY' as const,
      fix: `Review closure "${s.name}" for captured scope variables. Consider extracting large objects outside the closure, using WeakRef, or nullifying captured references on cleanup.`,
    }));

    if (closureSummary.retainedSize > LARGE_CLOSURE_RETAINED) {
      actionItems.unshift({
        id: 'closure-leaks-total',
        title: `${closureSummary.count} closures retain ${formatBytes(closureSummary.retainedSize)} total`,
        detail: `Total closure memory is significant. Review closures for captured scope variables that prevent garbage collection.`,
        severity: 'warning' as const,
        metric: 'MEMORY' as const,
        fix: `Audit closures for large captured variables. Use browser DevTools' "Allocation instrumentation on timeline" to find closures that capture unexpected references.`,
      });
    }

    return { actionItems, metrics };
  }
}

