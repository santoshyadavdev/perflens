import { describe, it, expect } from 'vitest';
import { EventListenerLeaksRule } from './event-listener-leaks.rule';
import { HeapGraph } from '../../parsers/heap-graph';
import { computeDominatorTree, computeRetainedSizes } from '../../parsers/dominator-tree';
import { analyzeSnapshot } from '../../parsers/snapshot-analyzer';
import sampleSnapshot from '../../../../test-fixtures/sample-heap-snapshot.json';
import type { RawHeapSnapshot } from '../../models/heap-snapshot.model';

describe('EventListenerLeaksRule', () => {
  function buildSnapshot() {
    const graph = new HeapGraph(sampleSnapshot as unknown as RawHeapSnapshot);
    computeDominatorTree(graph);
    computeRetainedSizes(graph);
    return analyzeSnapshot(graph, 'test.heapsnapshot');
  }

  it('should detect EventListener objects', () => {
    const rule = new EventListenerLeaksRule();
    const result = rule.analyze(buildSnapshot());
    expect(result.actionItems).toBeDefined();
    // Our fixture has 1 EventListener node
    expect(result.actionItems.length).toBe(1);
  });

  it('should have name "event-listener-leaks"', () => {
    expect(new EventListenerLeaksRule().name).toBe('event-listener-leaks');
  });

  it('should produce action items with correct shape', () => {
    const rule = new EventListenerLeaksRule();
    const result = rule.analyze(buildSnapshot());
    const item = result.actionItems[0];
    expect(item.id).toBeDefined();
    expect(item.title).toBeDefined();
    expect(item.detail).toBeDefined();
    expect(item.severity).toMatch(/^(info|warning|critical)$/);
    expect(item.metric).toBe('MEMORY');
    expect(item.fix).toBeDefined();
  });

  it('should return empty action items for snapshot with no listeners', () => {
    const rule = new EventListenerLeaksRule();
    const snapshot = buildSnapshot();
    const emptySnapshot = { ...snapshot, constructorSummaries: [] };
    const result = rule.analyze(emptySnapshot);
    expect(result.actionItems).toHaveLength(0);
  });

  it('should emit a metric for listener count', () => {
    const rule = new EventListenerLeaksRule();
    const result = rule.analyze(buildSnapshot());
    const metric = result.metrics.find(m => m.shortName === 'EVTL');
    expect(metric).toBeDefined();
    expect(metric!.value).toBeGreaterThanOrEqual(1);
  });
});
