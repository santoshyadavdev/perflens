import type { ParsedCpuProfile, CpuProfileComparison } from '../models/cpu-profile.model';
import type { ActionItem } from '../models/action-item.model';
import type { MetricScore } from '../models/metric-score.model';

export interface CpuRuleResult {
  actionItems: ActionItem[];
  metrics: MetricScore[];
}

export interface CpuAnalysisRule {
  readonly name: string;
  analyze(profile: ParsedCpuProfile, comparison?: CpuProfileComparison): CpuRuleResult;
}
