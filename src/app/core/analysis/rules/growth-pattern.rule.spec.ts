import { describe, it, expect } from 'vitest';
import { GrowthPatternRule } from './growth-pattern.rule';
import { HeapGraph } from '../../parsers/heap-graph';
import { computeDominatorTree, computeRetainedSizes } from '../../parsers/dominator-tree';
import { analyzeSnapshot } from '../../parsers/snapshot-analyzer';
import { compareSnapshots } from '../../parsers/heap-comparison';
import snapshotA from '../../../../test-fixtures/sample-heap-snapshot.json';
import snapshotB from '../../../../test-fixtures/sample-heap-snapshot-b.json';
import type { RawHeapSnapshot } from '../../models/heap-snapshot.model';

describe('GrowthPatternRule', () => {
  function buildParsed(raw: RawHeapSnapshot, name: string) {
    const graph = new HeapGraph(raw);
    computeDominatorTree(graph);
    computeRetainedSizes(graph);
    return analyzeSnapshot(graph, name);
  }

  it('should produce no action items without comparison', () => {
    const rule = new GrowthPatternRule();
    const snapshot = buildParsed(snapshotA as unknown as RawHeapSnapshot, 'a.heapsnapshot');
    const result = rule.analyze(snapshot);
    expect(result.actionItems.length).toBe(0);
  });

  it('should flag growth when comparison is provided', () => {
    const rule = new GrowthPatternRule();
    const a = buildParsed(snapshotA as unknown as RawHeapSnapshot, 'a.heapsnapshot');
    const b = buildParsed(snapshotB as unknown as RawHeapSnapshot, 'b.heapsnapshot');
    const comparison = compareSnapshots(a, b);
    const result = rule.analyze(b, comparison);

    expect(result.actionItems.length).toBeGreaterThan(0);
    expect(result.metrics.find(m => m.name === 'Heap Growth')).toBeDefined();
  });

  it('should have name "growth-pattern"', () => {
    expect(new GrowthPatternRule().name).toBe('growth-pattern');
  });
});
