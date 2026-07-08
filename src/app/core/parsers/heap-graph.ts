import type { RawHeapSnapshot, HeapNode, HeapEdge } from '../models/heap-snapshot.model';

export class HeapGraph {
  readonly nodes: HeapNode[];
  readonly edges: HeapEdge[];
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly strings: string[];

  private readonly nodeFieldCount: number;
  private readonly edgeFieldCount: number;
  private readonly nodeTypes: string[];
  private readonly edgeTypes: string[];

  private readonly outgoingEdges: Map<number, HeapEdge[]> = new Map();
  private readonly retainerEdges: Map<number, HeapEdge[]> = new Map();

  constructor(raw: RawHeapSnapshot) {
    const meta = raw.snapshot.meta;
    this.nodeFieldCount = meta.node_fields.length;
    this.edgeFieldCount = meta.edge_fields.length;
    this.nodeTypes = meta.node_types[0] as string[];
    this.edgeTypes = meta.edge_types[0] as string[];
    this.strings = raw.strings;
    this.nodeCount = raw.snapshot.node_count;
    this.edgeCount = raw.snapshot.edge_count;

    const nf = meta.node_fields;
    const typeIdx = nf.indexOf('type');
    const nameIdx = nf.indexOf('name');
    const idIdx = nf.indexOf('id');
    const sizeIdx = nf.indexOf('self_size');
    const edgeCountIdx = nf.indexOf('edge_count');
    const detachIdx = nf.indexOf('detachedness');

    this.nodes = [];
    let edgeOffset = 0;
    for (let i = 0; i < this.nodeCount; i++) {
      const base = i * this.nodeFieldCount;
      const ec = raw.nodes[base + edgeCountIdx];
      this.nodes.push({
        ordinal: i,
        type: this.nodeTypes[raw.nodes[base + typeIdx]],
        name: raw.strings[raw.nodes[base + nameIdx]],
        id: raw.nodes[base + idIdx],
        selfSize: raw.nodes[base + sizeIdx],
        edgeCount: ec,
        detachedness: detachIdx >= 0 ? raw.nodes[base + detachIdx] : 0,
        retainedSize: 0,
        dominatorOrdinal: -1,
        firstEdgeIndex: edgeOffset,
      });
      edgeOffset += ec;
    }

    const ef = meta.edge_fields;
    const eTypeIdx = ef.indexOf('type');
    const eNameIdx = ef.indexOf('name_or_index');
    const eToIdx = ef.indexOf('to_node');

    this.edges = [];
    let currentNodeOrdinal = 0;
    let edgesProcessed = 0;

    for (let i = 0; i < this.edgeCount; i++) {
      const base = i * this.edgeFieldCount;
      const edgeType = this.edgeTypes[raw.edges[base + eTypeIdx]];
      const rawName = raw.edges[base + eNameIdx];
      const toNodeOffset = raw.edges[base + eToIdx];
      const toNodeOrdinal = toNodeOffset / this.nodeFieldCount;

      while (
        currentNodeOrdinal < this.nodeCount &&
        edgesProcessed >=
          this.nodes[currentNodeOrdinal].firstEdgeIndex +
            this.nodes[currentNodeOrdinal].edgeCount
      ) {
        currentNodeOrdinal++;
      }

      const nameOrIndex =
        edgeType === 'element' || edgeType === 'hidden'
          ? rawName
          : raw.strings[rawName];

      const edge: HeapEdge = {
        type: edgeType,
        nameOrIndex,
        fromNodeOrdinal: currentNodeOrdinal,
        toNodeOrdinal,
      };

      this.edges.push(edge);
      edgesProcessed++;

      if (!this.outgoingEdges.has(currentNodeOrdinal)) {
        this.outgoingEdges.set(currentNodeOrdinal, []);
      }
      this.outgoingEdges.get(currentNodeOrdinal)!.push(edge);

      if (!this.retainerEdges.has(toNodeOrdinal)) {
        this.retainerEdges.set(toNodeOrdinal, []);
      }
      this.retainerEdges.get(toNodeOrdinal)!.push(edge);
    }
  }

  getOutgoingEdges(nodeOrdinal: number): HeapEdge[] {
    return this.outgoingEdges.get(nodeOrdinal) ?? [];
  }

  getRetainers(nodeOrdinal: number): HeapEdge[] {
    return this.retainerEdges.get(nodeOrdinal) ?? [];
  }

  getNode(ordinal: number): HeapNode {
    return this.nodes[ordinal];
  }
}
