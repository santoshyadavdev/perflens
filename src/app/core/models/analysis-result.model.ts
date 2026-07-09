import { ActionItem } from './action-item.model';
import { CpuAnalysisResult } from './cpu-profile.model';
import { HeapAnalysisResult } from './heap-snapshot.model';
import { MetricScore } from './metric-score.model';
import { ParsedTrace } from './trace-event.model';

export interface AnalysisResult {
  fileName: string;
  fileSize: number;
  analyzedAt: Date;
  metrics: MetricScore[];
  actionItems: ActionItem[];
  parsedTrace: ParsedTrace;
  heapResult?: HeapAnalysisResult;
  cpuResult?: CpuAnalysisResult;
}
