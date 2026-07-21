import { ActionItem } from './action-item.model';
import { MetricScore } from './metric-score.model';

export interface SavedSession {
  id: string;
  fileName: string;
  fileSize: number;
  format: 'perf-trace' | 'heap-snapshot' | 'cpu-profile';
  analyzedAt: string; // ISO 8601
  metrics: MetricScore[];
  actionItems: ActionItem[];
  rawDataStored: boolean;
}

export const SESSION_HISTORY_DB = 'perflens-history';
export const SESSIONS_STORE = 'sessions';
export const RAW_DATA_STORE = 'raw-data';
export const MAX_SESSIONS = 10;
