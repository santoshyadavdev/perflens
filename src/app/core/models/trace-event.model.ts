export interface TraceEvent {
  name: string;
  cat: string;
  ph: string; // 'B' begin, 'E' end, 'X' complete, 'I' instant, 'R' mark
  ts: number; // microseconds
  dur?: number; // microseconds (for 'X' complete events)
  pid: number;
  tid: number;
  args?: Record<string, unknown>;
  s?: string; // scope
}

export interface ParsedTrace {
  traceEvents: TraceEvent[];
  metadata: TraceMetadata;
  mainThreadId: number;
  navigationStart: number; // ts of navigationStart in microseconds
}

export interface TraceMetadata {
  userAgent?: string;
  url?: string;
  traceStartTime: number;
  traceEndTime: number;
}

export type FileFormat = 'perf-trace' | 'heap-snapshot' | 'cpu-profile' | 'v8-log' | 'unknown';

export interface DetectedFile {
  file: File;
  format: FileFormat;
  name: string;
  size: number;
}
