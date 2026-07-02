export type Rating = 'good' | 'needs-improvement' | 'poor';

export interface MetricScore {
  name: string;
  shortName: string;
  value: number;
  displayValue: string;
  unit: string;
  rating: Rating;
}

export const CWV_THRESHOLDS = {
  LCP: { good: 2500, poor: 4000 },      // ms
  INP: { good: 200, poor: 500 },         // ms
  CLS: { good: 0.1, poor: 0.25 },        // score
  TBT: { good: 200, poor: 600 },         // ms
  FCP: { good: 1800, poor: 3000 },        // ms
} as const;

export function rateMetric(
  metricName: keyof typeof CWV_THRESHOLDS,
  value: number
): Rating {
  const thresholds = CWV_THRESHOLDS[metricName];
  if (value <= thresholds.good) return 'good';
  if (value <= thresholds.poor) return 'needs-improvement';
  return 'poor';
}
