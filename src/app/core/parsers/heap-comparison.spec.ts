import { describe, it, expect } from 'vitest';
import { HeapGraph } from './heap-graph';
import { computeDominatorTree, computeRetainedSizes } from './dominator-tree';
import { analyzeSnapshot } from './snapshot-analyzer';
import { compareSnapshots } from './heap-comparison';
import snapshotA from '../../../test-fixtures/sample-heap-snapshot.json';
import snapshotB from '../../../test-fixtures/sample-heap-snapshot-b.json';
import type { RawHeapSnapshot } from '../models/heap-snapshot.model';

function buildParsed(raw: RawHeapSnapshot, name: string) {
  const graph = new HeapGraph(raw);
  computeDominatorTree(graph);
  computeRetainedSizes(graph);
  return analyzeSnapshot(graph, name);
}

describe('compareSnapshots', () => {
  it('should detect added constructors', () => {
    const a = buildParsed(snapshotA as unknown as RawHeapSnapshot, 'a.heapsnapshot');
    const b = buildParsed(snapshotB as unknown as RawHeapSnapshot, 'b.heapsnapshot');
    const result = compareSnapshots(a, b);

    const added = result.addedConstructors.map(c => c.name);
    expect(added).toContain('LeakedObject');
  });

  it('should detect grown constructors', () => {
    const a = buildParsed(snapshotA as unknown as RawHeapSnapshot, 'a.heapsnapshot');
    const b = buildParsed(snapshotB as unknown as RawHeapSnapshot, 'b.heapsnapshot');
    const result = compareSnapshots(a, b);

    const grown = result.grownConstructors.find(c => c.name === 'MyApp');
    expect(grown).toBeDefined();
    expect(grown!.countDelta).toBeGreaterThan(0);
  });

  it('should report positive total size delta', () => {
    const a = buildParsed(snapshotA as unknown as RawHeapSnapshot, 'a.heapsnapshot');
    const b = buildParsed(snapshotB as unknown as RawHeapSnapshot, 'b.heapsnapshot');
    const result = compareSnapshots(a, b);
    expect(result.totalSizeDelta).toBeGreaterThan(0);
  });
});
