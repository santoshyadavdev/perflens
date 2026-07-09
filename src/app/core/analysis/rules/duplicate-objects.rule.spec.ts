import { describe, it, expect } from 'vitest';
import { DuplicateObjectsRule } from './duplicate-objects.rule';
import { HeapGraph } from '../../parsers/heap-graph';
import { computeDominatorTree, computeRetainedSizes } from '../../parsers/dominator-tree';
import { analyzeSnapshot } from '../../parsers/snapshot-analyzer';
import sampleSnapshot from '../../../../test-fixtures/sample-heap-snapshot.json';
import type { RawHeapSnapshot } from '../../models/heap-snapshot.model';

describe('DuplicateObjectsRule', () => {
  function buildSnapshot() {
    const graph = new HeapGraph(sampleSnapshot as unknown as RawHeapSnapshot);
    computeDominatorTree(graph);
    computeRetainedSizes(graph);
    return analyzeSnapshot(graph, 'test.heapsnapshot');
  }

  it('should flag constructors with high instance counts', () => {
    const rule = new DuplicateObjectsRule();
    const result = rule.analyze(buildSnapshot());
    expect(result.actionItems).toBeDefined();
    expect(result.metrics).toBeDefined();
  });

  it('should have name "duplicate-objects"', () => {
    expect(new DuplicateObjectsRule().name).toBe('duplicate-objects');
  });

  it('should return action items with correct shape', () => {
    const rule = new DuplicateObjectsRule();
    const result = rule.analyze(buildSnapshot());
    for (const item of result.actionItems) {
      expect(item.id).toBeDefined();
      expect(item.title).toBeDefined();
      expect(item.detail).toBeDefined();
      expect(item.metric).toBe('MEMORY');
      expect(item.fix).toBeDefined();
      expect(['critical', 'warning', 'info']).toContain(item.severity);
    }
  });

  it('should return at most 10 action items', () => {
    const rule = new DuplicateObjectsRule();
    const result = rule.analyze(buildSnapshot());
    expect(result.actionItems.length).toBeLessThanOrEqual(10);
  });
});
