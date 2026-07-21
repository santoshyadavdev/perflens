import { ActionItem } from './action-item.model';
import { MetricScore } from './metric-score.model';

export interface SharePayload {
  v: 1;
  fn: string;
  fs: number;
  fmt: string;
  at: string;
  m: MetricScore[];
  ai: ActionItem[];
}

export const SHARE_HASH_PREFIX = '#share=';
export const MAX_URL_LENGTH = 8000;
