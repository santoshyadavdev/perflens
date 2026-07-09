import { describe, it, expect } from 'vitest';
import { RetainedSizeRule } from './retained-size.rule';
import { HeapGraph } from '../../parsers/heap-graph';
import { computeDominatorTree, computeRetainedSizes } from '../../parsers/dominator-tree';
import { analyzeSnapshot } from '../../parsers/snapshot-analyzer';
import sampleSnapshot from '../../../../test-fixtures/sample-heap-snapshot.json';
import type { RawHeapSnapshot } from '../../models/heap-snapshot.model';

describe('RetainedSizeRule', () => {
  function buildSnapshot() {
    const graph = new HeapGraph(sampleSnapshot as unknown as RawHeapSnapshot);
    computeDominatorTree(graph);
    computeRetainedSizes(graph);
    return analyzeSnapshot(graph, 'test.heapsnapshot');
  }

  it('should produce a metric with total heap size', () => {
    const rule = new RetainedSizeRule();
    const result = rule.analyze(buildSnapshot());
    const metric = result.metrics.find(m => m.name === 'Total Heap Size');
    expect(metric).toBeDefined();
    expect(metric!.value).toBeGreaterThan(0);
  });

  it('should produce action items for largest retainers', () => {
    const rule = new RetainedSizeRule();
    const result = rule.analyze(buildSnapshot());
    expect(result.actionItems.length).toBeGreaterThan(0);
    expect(result.actionItems[0].metric).toBe('MEMORY');
  });

  it('should have name "retained-size-breakdown"', () => {
    expect(new RetainedSizeRule().name).toBe('retained-size-breakdown');
  });

  it('should assign severity based on retained size proportion', () => {
    const rule = new RetainedSizeRule();
    const result = rule.analyze(buildSnapshot());
    const severities = result.actionItems.map(a => a.severity);
    expect(severities.every(s => ['critical', 'warning', 'info'].includes(s))).toBe(true);
  });

  it('should include shortName and displayValue in total heap size metric', () => {
    const rule = new RetainedSizeRule();
    const result = rule.analyze(buildSnapshot());
    const metric = result.metrics.find(m => m.name === 'Total Heap Size');
    expect(metric!.shortName).toBe('HEAP');
    expect(metric!.displayValue).toBeTruthy();
  });
});
