import { ActionItem } from './action-item.model';
import { MetricScore } from './metric-score.model';

export interface AnalysisResult {
  fileName: string;
  fileSize: number;
  analyzedAt: Date;
  metrics: MetricScore[];
  actionItems: ActionItem[];
}
