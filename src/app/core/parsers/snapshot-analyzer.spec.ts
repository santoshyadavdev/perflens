import { describe, it, expect } from 'vitest';
import { HeapGraph } from './heap-graph';
import { computeDominatorTree, computeRetainedSizes } from './dominator-tree';
import { analyzeSnapshot } from './snapshot-analyzer';
import sampleSnapshot from '../../../test-fixtures/sample-heap-snapshot.json';
import type { RawHeapSnapshot } from '../models/heap-snapshot.model';

function buildGraph(): HeapGraph {
  const graph = new HeapGraph(sampleSnapshot as unknown as RawHeapSnapshot);
  computeDominatorTree(graph);
  computeRetainedSizes(graph);
  return graph;
}

describe('analyzeSnapshot', () => {
  it('should produce constructor summaries grouped by name', () => {
    const graph = buildGraph();
    const result = analyzeSnapshot(graph, 'test.heapsnapshot');
    const myApp = result.constructorSummaries.find(s => s.name === 'MyApp');
    expect(myApp).toBeDefined();
    expect(myApp!.count).toBe(1);
    expect(myApp!.shallowSize).toBe(200);
  });

  it('should produce type summaries', () => {
    const graph = buildGraph();
    const result = analyzeSnapshot(graph, 'test.heapsnapshot');
    const objectType = result.typeSummaries.find(s => s.type === 'object');
    expect(objectType).toBeDefined();
    expect(objectType!.count).toBeGreaterThanOrEqual(4);
  });

  it('should build treemap root', () => {
    const graph = buildGraph();
    const result = analyzeSnapshot(graph, 'test.heapsnapshot');
    expect(result.treemapRoot.name).toBe('Heap');
    expect(result.treemapRoot.children).toBeDefined();
    expect(result.treemapRoot.children!.length).toBeGreaterThan(0);
  });

  it('should find detached DOM nodes', () => {
    const graph = buildGraph();
    const result = analyzeSnapshot(graph, 'test.heapsnapshot');
    expect(result.detachedDOMNodes.length).toBe(2);
    const names = result.detachedDOMNodes.map(d => d.className).sort();
    expect(names).toEqual(['HTMLDivElement', 'HTMLSpanElement']);
  });
});
