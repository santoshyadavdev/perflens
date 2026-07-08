import type { ParsedHeapSnapshot, HeapComparison } from '../models/heap-snapshot.model';
import type { ActionItem } from '../models/action-item.model';
import type { MetricScore } from '../models/metric-score.model';

export interface HeapRuleResult {
  actionItems: ActionItem[];
  metrics: MetricScore[];
}

export interface HeapAnalysisRule {
  readonly name: string;
  analyze(snapshot: ParsedHeapSnapshot, comparison?: HeapComparison): HeapRuleResult;
}
