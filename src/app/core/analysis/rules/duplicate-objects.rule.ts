import type { HeapAnalysisRule, HeapRuleResult } from '../heap-analysis-rule';
import type { ParsedHeapSnapshot } from '../../models/heap-snapshot.model';
import type { ActionItem } from '../../models/action-item.model';

import { formatBytes } from '../../utils/format';
const DUPLICATE_THRESHOLD = 100;

export class DuplicateObjectsRule implements HeapAnalysisRule {
  readonly name = 'duplicate-objects';

  analyze(snapshot: ParsedHeapSnapshot): HeapRuleResult {
    const duplicates = snapshot.constructorSummaries
      .filter(s => s.count >= DUPLICATE_THRESHOLD)
      .sort((a, b) => b.count - a.count);

    const actionItems: ActionItem[] = duplicates.slice(0, 10).map((s, i) => ({
      id: `duplicate-objects-${s.name}-${i}`,
      title: `${s.count} instances of "${s.name}" found`,
      detail: `"${s.name}" has ${s.count} instances using ${formatBytes(s.shallowSize)} shallow memory. Check for object pooling opportunities or unnecessary allocations.`,
      severity: s.count > 1000 ? 'warning' as const : 'info' as const,
      metric: 'MEMORY' as const,
      fix: `Review "${s.name}" allocation sites. Consider object pooling, lazy initialization, or reducing unnecessary instance creation.`,
    }));

    return { actionItems, metrics: [] };
  }
}

