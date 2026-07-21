import { ActionItem } from './action-item.model';
import { AnalysisResult } from './analysis-result.model';
import { MetricScore } from './metric-score.model';

export interface TraceComparison {
  current: AnalysisResult;
  baseline: AnalysisResult;
  metricDiffs: MetricDiff[];
  newActionItems: ActionItem[];
  resolvedActionItems: ActionItem[];
  unchangedActionItems: ActionItem[];
}

export interface MetricDiff {
  name: string;
  shortName: string;
  current: MetricScore;
  baseline: MetricScore;
  delta: number;
  deltaPercent: number;
  improved: boolean;
}
