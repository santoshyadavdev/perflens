import { describe, it, expect } from 'vitest';
import { HeapGraph } from './heap-graph';
import { computeDominatorTree, computeRetainedSizes } from './dominator-tree';
import sampleSnapshot from '../../../test-fixtures/sample-heap-snapshot.json';
import type { RawHeapSnapshot } from '../models/heap-snapshot.model';

describe('Dominator Tree', () => {
  it('should compute dominator for all nodes', () => {
    const graph = new HeapGraph(sampleSnapshot as unknown as RawHeapSnapshot);
    computeDominatorTree(graph);

    // Root node dominates itself
    expect(graph.nodes[0].dominatorOrdinal).toBe(0);
    // Window (1) dominated by GC roots (0)
    expect(graph.nodes[1].dominatorOrdinal).toBe(0);
    // system (2) dominated by GC roots (0)
    expect(graph.nodes[2].dominatorOrdinal).toBe(0);
    // MyApp (3) dominated by Window (1)
    expect(graph.nodes[3].dominatorOrdinal).toBe(1);
  });

  it('should compute retained sizes', () => {
    const graph = new HeapGraph(sampleSnapshot as unknown as RawHeapSnapshot);
    computeDominatorTree(graph);
    computeRetainedSizes(graph);

    // Leaf nodes: retained = self
    expect(graph.nodes[7].retainedSize).toBe(40); // HTMLSpanElement
    // HTMLDivElement retains itself + HTMLSpanElement
    expect(graph.nodes[4].retainedSize).toBe(120); // 80 + 40
    // Root retains everything
    expect(graph.nodes[0].retainedSize).toBeGreaterThanOrEqual(680);
  });
});
