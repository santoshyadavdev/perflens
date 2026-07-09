/** Raw V8 CPU Profile format (input from .cpuprofile files) */
export interface CpuProfileRaw {
  nodes: CpuProfileNodeRaw[];
  startTime: number;      // microseconds
  endTime: number;        // microseconds
  samples: number[];      // node IDs sampled at each tick
  timeDeltas: number[];   // microsecond deltas between samples
}

export interface CpuProfileNodeRaw {
  id: number;
  callFrame: CallFrame;
  hitCount: number;
  children?: number[];
  deoptReason?: string;
  positionTicks?: PositionTick[];
}

export interface CallFrame {
  functionName: string;
  scriptId: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
}

export interface PositionTick {
  line: number;
  ticks: number;
}

/** Processed call tree node */
export interface CallTreeNode {
  id: number;
  callFrame: CallFrame;
  selfTime: number;      // ms
  totalTime: number;     // ms
  children: CallTreeNode[];
  depth: number;
}

/** Flat profile entry (aggregated by callFrame) */
export interface FlatProfileEntry {
  callFrame: CallFrame;
  selfTime: number;      // ms
  totalTime: number;     // ms
  selfPercent: number;   // 0-100
  totalPercent: number;  // 0-100
  hitCount: number;
  deoptReason?: string;
}

/** Single sample tick */
export interface SampleTick {
  nodeId: number;
  timestamp: number;     // ms from profile start
  delta: number;         // ms since previous sample
}

/** Deoptimization event */
export interface DeoptEvent {
  callFrame: CallFrame;
  reason: string;
  hitCount: number;
  selfTime: number;      // ms
}

/** Fully parsed CPU profile */
export interface ParsedCpuProfile {
  fileName: string;
  totalTime: number;               // ms
  root: CallTreeNode;              // top-down call tree
  flatProfile: FlatProfileEntry[]; // sorted by self time desc
  samples: SampleTick[];           // time-series sample data
  deoptEvents: DeoptEvent[];       // nodes with deopt reasons
}

/** 2-profile comparison */
export interface CpuProfileComparison {
  baseline: ParsedCpuProfile;
  current: ParsedCpuProfile;
  added: FlatProfileEntry[];
  removed: FlatProfileEntry[];
  changed: CpuProfileDiff[];
}

export interface CpuProfileDiff {
  callFrame: CallFrame;
  baselineSelfTime: number;
  currentSelfTime: number;
  selfTimeDelta: number;
  baselineTotalTime: number;
  currentTotalTime: number;
  totalTimeDelta: number;
}

/** Worker message types */
export type CpuWorkerMessage =
  | { type: 'progress'; phase: string; percent: number }
  | { type: 'result'; profile: ParsedCpuProfile }
  | { type: 'error'; message: string };

/** Combined CPU analysis result */
export interface CpuAnalysisResult {
  profile: ParsedCpuProfile;
  comparison?: CpuProfileComparison;
}
