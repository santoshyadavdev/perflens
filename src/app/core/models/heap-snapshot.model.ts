/** Raw V8 heap snapshot JSON structure */
export interface RawHeapSnapshot {
  snapshot: {
    meta: {
      node_fields: string[];
      node_types: (string | string[])[];
      edge_fields: string[];
      edge_types: (string | string[])[];
    };
    node_count: number;
    edge_count: number;
  };
  nodes: number[];
  edges: number[];
  strings: string[];
  samples?: number[];
  locations?: number[];
  trace_function_infos?: number[];
  trace_tree?: unknown[];
}

/** Parsed heap node with resolved fields */
export interface HeapNode {
  ordinal: number;
  type: string;
  name: string;
  id: number;
  selfSize: number;
  edgeCount: number;
  detachedness: number; // 0=UNKNOWN, 1=ATTACHED, 2=DETACHED
  retainedSize: number;
  dominatorOrdinal: number;
  firstEdgeIndex: number;
}

/** Parsed heap edge with resolved fields */
export interface HeapEdge {
  type: string;
  nameOrIndex: string | number;
  fromNodeOrdinal: number;
  toNodeOrdinal: number;
}

/** Result of parsing + analysis */
export interface HeapGraphData {
  nodes: HeapNode[];
  edges: HeapEdge[];
  rootNodeOrdinal: number;
  nodeCount: number;
  edgeCount: number;
  totalSize: number;
  strings: string[];
}

/** Constructor-grouped summary */
export interface ConstructorSummary {
  name: string;
  count: number;
  shallowSize: number;
  retainedSize: number;
}

/** Type-grouped summary (hidden, object, closure, etc.) */
export interface TypeSummary {
  type: string;
  count: number;
  shallowSize: number;
  retainedSize: number;
}

/** Treemap node for visualization */
export interface TreemapNode {
  name: string;
  value: number; // retained size
  children?: TreemapNode[];
}

/** Detached DOM node info */
export interface DetachedDOMNode {
  nodeOrdinal: number;
  className: string;
  retainedSize: number;
  retainerChain: string[];
}

/** 2-snapshot comparison result */
export interface HeapComparison {
  addedConstructors: ConstructorSummary[];
  removedConstructors: ConstructorSummary[];
  grownConstructors: Array<ConstructorSummary & { countDelta: number; sizeDelta: number }>;
  totalSizeDelta: number;
}

/** Fully parsed heap snapshot ready for analysis */
export interface ParsedHeapSnapshot {
  fileName: string;
  graphData: HeapGraphData;
  constructorSummaries: ConstructorSummary[];
  typeSummaries: TypeSummary[];
  treemapRoot: TreemapNode;
  detachedDOMNodes: DetachedDOMNode[];
}

/** Worker message types */
export type HeapWorkerMessage =
  | { type: 'progress'; phase: string; percent: number }
  | { type: 'result'; snapshot: ParsedHeapSnapshot }
  | { type: 'error'; message: string };

/** Combined heap analysis result */
export interface HeapAnalysisResult {
  snapshot: ParsedHeapSnapshot;
  comparison?: HeapComparison;
}
