export interface TraceEvent {
  name: string;
  cat: string;
  ph: 'X' | 'B' | 'E' | 'I' | 'C' | 'M' | 'N' | 'R' | 'S' | 'T' | 'F' | 'P';
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

export type FileFormat = 'perf-trace' | 'heap-snapshot' | 'cpu-profile' | 'v8-log' | 'perflens' | 'unknown';

export interface DetectedFile {
  file: File;
  format: FileFormat;
  name: string;
  size: number;
}
