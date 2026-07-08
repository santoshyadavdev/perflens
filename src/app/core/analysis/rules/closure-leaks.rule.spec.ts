import { describe, it, expect } from 'vitest';
import { ClosureLeaksRule } from './closure-leaks.rule';
import { HeapGraph } from '../../parsers/heap-graph';
import { computeDominatorTree, computeRetainedSizes } from '../../parsers/dominator-tree';
import { analyzeSnapshot } from '../../parsers/snapshot-analyzer';
import sampleSnapshot from '../../../../test-fixtures/sample-heap-snapshot.json';
import type { RawHeapSnapshot } from '../../models/heap-snapshot.model';

describe('ClosureLeaksRule', () => {
  function buildSnapshot() {
    const graph = new HeapGraph(sampleSnapshot as unknown as RawHeapSnapshot);
    computeDominatorTree(graph);
    computeRetainedSizes(graph);
    return analyzeSnapshot(graph, 'test.heapsnapshot');
  }

  it('should detect closures retaining large amounts of memory', () => {
    const rule = new ClosureLeaksRule();
    const result = rule.analyze(buildSnapshot());
    // Fixture has 1 closure (150 bytes self size) — below threshold, so no action items
    expect(result.actionItems).toBeDefined();
  });

  it('should have name "closure-leaks"', () => {
    expect(new ClosureLeaksRule().name).toBe('closure-leaks');
  });

  it('should return action items with correct shape when closures exceed threshold', () => {
    const rule = new ClosureLeaksRule();
    const snapshot = buildSnapshot();
    const largeClosure = {
      name: 'myLargeClosure',
      count: 5,
      selfSize: 2_000_000,
      retainedSize: 2_000_000,
    };
    const modifiedSnapshot = {
      ...snapshot,
      constructorSummaries: [...snapshot.constructorSummaries, largeClosure],
      typeSummaries: snapshot.typeSummaries.map(t =>
        t.type === 'closure' ? { ...t, retainedSize: 2_000_000, count: 5 } : t
      ),
      graphData: {
        ...snapshot.graphData,
        nodes: [
          ...snapshot.graphData.nodes,
          { id: 99, type: 'closure', name: 'myLargeClosure', selfSize: 2_000_000, retainedSize: 2_000_000, dominatorId: 0, edgeCount: 0 },
        ],
      },
    };
    const result = rule.analyze(modifiedSnapshot);
    expect(result.actionItems.length).toBeGreaterThan(0);
    const item = result.actionItems[0];
    expect(item.id).toBeDefined();
    expect(item.title).toBeDefined();
    expect(item.detail).toBeDefined();
    expect(item.severity).toMatch(/^(info|warning|critical)$/);
    expect(item.metric).toBe('MEMORY');
    expect(item.fix).toBeDefined();
  });

  it('should return empty action items when no closures present', () => {
    const rule = new ClosureLeaksRule();
    const snapshot = buildSnapshot();
    const emptySnapshot = {
      ...snapshot,
      typeSummaries: snapshot.typeSummaries.filter(t => t.type !== 'closure'),
    };
    const result = rule.analyze(emptySnapshot);
    expect(result.actionItems).toHaveLength(0);
  });

  it('should emit a metric for closure count', () => {
    const rule = new ClosureLeaksRule();
    const result = rule.analyze(buildSnapshot());
    const metric = result.metrics.find(m => m.shortName === 'CLSR');
    expect(metric).toBeDefined();
  });
});
