export type Severity = 'critical' | 'warning' | 'info';

export type MetricTag = 'LCP' | 'INP' | 'CLS' | 'TBT' | 'FCP' | 'SIZE' | 'MEMORY' | 'V8' | 'CPU';

export interface ActionItem {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  metric: MetricTag;
  fix: string;
  source?: SourceLocation;
}

export interface SourceLocation {
  functionName?: string;
  scriptUrl?: string;
  lineNumber?: number;
}
