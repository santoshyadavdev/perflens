import type { HeapGraph } from './heap-graph';
import type {
  ParsedHeapSnapshot,
  ConstructorSummary,
  TypeSummary,
  TreemapNode,
  DetachedDOMNode,
} from '../models/heap-snapshot.model';

export function analyzeSnapshot(graph: HeapGraph, fileName: string): ParsedHeapSnapshot {
  return {
    fileName,
    graphData: {
      nodes: graph.nodes,
      edges: graph.edges,
      rootNodeOrdinal: 0,
      nodeCount: graph.nodeCount,
      edgeCount: graph.edgeCount,
      totalSize: graph.nodes.reduce((s, n) => s + n.selfSize, 0),
      strings: graph.strings,
    },
    constructorSummaries: buildConstructorSummaries(graph),
    typeSummaries: buildTypeSummaries(graph),
    treemapRoot: buildTreemapRoot(graph),
    detachedDOMNodes: findDetachedDOMNodes(graph),
  };
}

function buildConstructorSummaries(graph: HeapGraph): ConstructorSummary[] {
  const map = new Map<string, ConstructorSummary>();

  for (const node of graph.nodes) {
    // Skip synthetic/hidden root nodes
    if (node.type === 'synthetic' || (node.type === 'hidden' && node.selfSize === 0)) continue;

    const name = node.name || `(${node.type})`;
    const existing = map.get(name);
    if (existing) {
      existing.count++;
      existing.shallowSize += node.selfSize;
      existing.retainedSize += node.retainedSize;
    } else {
      map.set(name, {
        name,
        count: 1,
        shallowSize: node.selfSize,
        retainedSize: node.retainedSize,
      });
    }
  }

  return [...map.values()].sort((a, b) => b.retainedSize - a.retainedSize);
}

function buildTypeSummaries(graph: HeapGraph): TypeSummary[] {
  const map = new Map<string, TypeSummary>();

  for (const node of graph.nodes) {
    const existing = map.get(node.type);
    if (existing) {
      existing.count++;
      existing.shallowSize += node.selfSize;
      existing.retainedSize += node.retainedSize;
    } else {
      map.set(node.type, {
        type: node.type,
        count: 1,
        shallowSize: node.selfSize,
        retainedSize: node.retainedSize,
      });
    }
  }

  return [...map.values()].sort((a, b) => b.retainedSize - a.retainedSize);
}

function buildTreemapRoot(graph: HeapGraph): TreemapNode {
  // Group by type → constructor
  const typeGroups = new Map<string, Map<string, number>>();

  for (const node of graph.nodes) {
    if (node.type === 'synthetic') continue;
    if (!typeGroups.has(node.type)) {
      typeGroups.set(node.type, new Map());
    }
    const constructors = typeGroups.get(node.type)!;
    const name = node.name || `(anonymous)`;
    constructors.set(name, (constructors.get(name) ?? 0) + node.retainedSize);
  }

  const children: TreemapNode[] = [];
  for (const [type, constructors] of typeGroups) {
    const typeChildren: TreemapNode[] = [];
    for (const [name, size] of constructors) {
      if (size > 0) {
        typeChildren.push({ name, value: size });
      }
    }
    if (typeChildren.length > 0) {
      const typeTotal = typeChildren.reduce((s, c) => s + c.value, 0);
      children.push({ name: type, value: typeTotal, children: typeChildren });
    }
  }

  return {
    name: 'Heap',
    value: children.reduce((s, c) => s + c.value, 0),
    children: children.sort((a, b) => b.value - a.value),
  };
}

function findDetachedDOMNodes(graph: HeapGraph): DetachedDOMNode[] {
  const detached: DetachedDOMNode[] = [];

  for (const node of graph.nodes) {
    if (node.detachedness !== 2) continue;

    // Build retainer chain (up to 5 levels)
    const chain: string[] = [];
    let current = node.ordinal;
    for (let depth = 0; depth < 5; depth++) {
      const retainers = graph.getRetainers(current);
      if (retainers.length === 0) break;
      const retainer = graph.getNode(retainers[0].fromNodeOrdinal);
      chain.push(`${retainer.name} (${retainer.type})`);
      current = retainer.ordinal;
    }

    detached.push({
      nodeOrdinal: node.ordinal,
      className: node.name,
      retainedSize: node.retainedSize,
      retainerChain: chain,
    });
  }

  return detached.sort((a, b) => b.retainedSize - a.retainedSize);
}
