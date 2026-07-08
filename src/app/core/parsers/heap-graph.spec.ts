import { describe, it, expect } from 'vitest';
import { HeapGraph } from './heap-graph';
import sampleSnapshot from '../../../test-fixtures/sample-heap-snapshot.json';
import type { RawHeapSnapshot } from '../models/heap-snapshot.model';

describe('HeapGraph', () => {
  it('should parse nodes from flat array', () => {
    const graph = new HeapGraph(sampleSnapshot as unknown as RawHeapSnapshot);
    expect(graph.nodeCount).toBe(8);
    expect(graph.nodes[0].name).toBe('(GC roots)');
    expect(graph.nodes[0].type).toBe('synthetic');
    expect(graph.nodes[0].selfSize).toBe(0);
    expect(graph.nodes[1].name).toBe('Window');
    expect(graph.nodes[1].type).toBe('object');
    expect(graph.nodes[1].selfSize).toBe(100);
  });

  it('should parse edges with correct from/to ordinals', () => {
    const graph = new HeapGraph(sampleSnapshot as unknown as RawHeapSnapshot);
    const rootEdges = graph.getOutgoingEdges(0);
    expect(rootEdges.length).toBe(2);
    expect(rootEdges[0].fromNodeOrdinal).toBe(0);
    const targets = rootEdges.map(e => e.toNodeOrdinal).sort();
    expect(targets).toEqual([1, 2]);
  });

  it('should detect detached nodes', () => {
    const graph = new HeapGraph(sampleSnapshot as unknown as RawHeapSnapshot);
    const detached = graph.nodes.filter(n => n.detachedness === 2);
    expect(detached.length).toBe(2);
    expect(detached.map(n => n.name).sort()).toEqual(['HTMLDivElement', 'HTMLSpanElement']);
  });

  it('should compute total shallow size', () => {
    const graph = new HeapGraph(sampleSnapshot as unknown as RawHeapSnapshot);
    const total = graph.nodes.reduce((sum, n) => sum + n.selfSize, 0);
    expect(total).toBe(680);
  });

  it('should build retainer index', () => {
    const graph = new HeapGraph(sampleSnapshot as unknown as RawHeapSnapshot);
    const retainers = graph.getRetainers(5);
    expect(retainers.length).toBe(2);
    const retainerOrdinals = retainers.map(e => e.fromNodeOrdinal).sort();
    expect(retainerOrdinals).toEqual([2, 6]);
  });
});
