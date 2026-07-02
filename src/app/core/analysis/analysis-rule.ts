import { ActionItem } from '../models/action-item.model';
import { MetricScore } from '../models/metric-score.model';
import { ParsedTrace } from '../models/trace-event.model';

export interface AnalysisRule {
  readonly name: string;
  analyze(trace: ParsedTrace): RuleResult;
}

export interface RuleResult {
  actionItems: ActionItem[];
  metrics: MetricScore[];
}
