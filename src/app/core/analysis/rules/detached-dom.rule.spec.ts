import { describe, it, expect } from 'vitest';
import { DetachedDomRule } from './detached-dom.rule';
import { HeapGraph } from '../../parsers/heap-graph';
import { computeDominatorTree, computeRetainedSizes } from '../../parsers/dominator-tree';
import { analyzeSnapshot } from '../../parsers/snapshot-analyzer';
import sampleSnapshot from '../../../../test-fixtures/sample-heap-snapshot.json';
import type { RawHeapSnapshot } from '../../models/heap-snapshot.model';

describe('DetachedDomRule', () => {
  function buildSnapshot() {
    const graph = new HeapGraph(sampleSnapshot as unknown as RawHeapSnapshot);
    computeDominatorTree(graph);
    computeRetainedSizes(graph);
    return analyzeSnapshot(graph, 'test.heapsnapshot');
  }

  it('should flag detached DOM elements', () => {
    const rule = new DetachedDomRule();
    const result = rule.analyze(buildSnapshot());
    expect(result.actionItems.length).toBe(2);
  });

  it('should rate severity based on count', () => {
    const rule = new DetachedDomRule();
    const result = rule.analyze(buildSnapshot());
    const metric = result.metrics.find(m => m.name === 'Detached DOM Nodes');
    expect(metric).toBeDefined();
    expect(metric!.value).toBe(2);
  });
});
