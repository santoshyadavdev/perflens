import { describe, it, expect } from 'vitest';
import { buildCallTree, buildFlatProfile, compareCpuProfiles } from './cpu-profile-parser';
import sampleProfile from '../../../test-fixtures/sample-cpu-profile.json';
import sampleProfile2 from '../../../test-fixtures/sample-cpu-profile-2.json';
import type { CpuProfileRaw } from '../models/cpu-profile.model';

describe('buildCallTree', () => {
  it('should return a root node with children', () => {
    const result = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    expect(result.root.callFrame.functionName).toBe('(root)');
    expect(result.root.children.length).toBeGreaterThan(0);
  });

  it('should compute totalTime close to profile duration', () => {
    const result = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    // totalTime is sum of all timeDeltas in ms
    expect(result.totalTime).toBeGreaterThan(50);
    expect(result.totalTime).toBeLessThan(200);
  });

  it('should compute selfTime for leaf nodes from samples', () => {
    const result = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    const idleNode = findNode(result.root, '(idle)');
    expect(idleNode).toBeDefined();
    expect(idleNode!.selfTime).toBeGreaterThan(0);
  });

  it('should compute totalTime >= selfTime for every node', () => {
    const result = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    const allNodes = flattenTree(result.root);
    for (const node of allNodes) {
      expect(node.totalTime).toBeGreaterThanOrEqual(node.selfTime);
    }
  });

  it('should extract deopt events', () => {
    const result = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    expect(result.deoptEvents.length).toBeGreaterThan(0);
    expect(result.deoptEvents[0].reason).toBe('not a Smi');
  });

  it('should produce sample ticks', () => {
    const result = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    expect(result.samples.length).toBe(sampleProfile.samples.length);
    expect(result.samples[0].delta).toBeGreaterThan(0);
  });
});

describe('buildFlatProfile', () => {
  it('should aggregate entries by callFrame identity', () => {
    const parsed = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    const flat = buildFlatProfile(parsed);
    const processDataEntries = flat.filter(e => e.callFrame.functionName === 'processData');
    expect(processDataEntries.length).toBe(1);
    expect(processDataEntries[0].selfTime).toBeGreaterThan(0);
  });

  it('should be sorted by selfTime descending', () => {
    const parsed = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    const flat = buildFlatProfile(parsed);
    for (let i = 1; i < flat.length; i++) {
      expect(flat[i - 1].selfTime).toBeGreaterThanOrEqual(flat[i].selfTime);
    }
  });

  it('should compute selfPercent summing to ~100', () => {
    const parsed = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    const flat = buildFlatProfile(parsed);
    const totalPercent = flat.reduce((s, e) => s + e.selfPercent, 0);
    expect(totalPercent).toBeGreaterThan(95);
    expect(totalPercent).toBeLessThanOrEqual(101);
  });

  it('should include deoptReason on deopt entries', () => {
    const parsed = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    const flat = buildFlatProfile(parsed);
    const processData = flat.find(e => e.callFrame.functionName === 'processData');
    expect(processData?.deoptReason).toBe('not a Smi');
  });
});

describe('compareCpuProfiles', () => {
  it('should detect added functions', () => {
    const p1 = buildCallTree(sampleProfile as CpuProfileRaw, 'baseline.cpuprofile');
    const p2 = buildCallTree(sampleProfile2 as CpuProfileRaw, 'current.cpuprofile');
    const comparison = compareCpuProfiles(p1, p2);
    const addedNames = comparison.added.map(e => e.callFrame.functionName);
    expect(addedNames).toContain('newFeature');
  });

  it('should detect removed functions', () => {
    const p1 = buildCallTree(sampleProfile as CpuProfileRaw, 'baseline.cpuprofile');
    const p2 = buildCallTree(sampleProfile2 as CpuProfileRaw, 'current.cpuprofile');
    const comparison = compareCpuProfiles(p1, p2);
    const removedNames = comparison.removed.map(e => e.callFrame.functionName);
    expect(removedNames).toContain('rasterize');
  });

  it('should detect changed functions with time deltas', () => {
    const p1 = buildCallTree(sampleProfile as CpuProfileRaw, 'baseline.cpuprofile');
    const p2 = buildCallTree(sampleProfile2 as CpuProfileRaw, 'current.cpuprofile');
    const comparison = compareCpuProfiles(p1, p2);
    expect(comparison.changed.length).toBeGreaterThan(0);
    const processDataDiff = comparison.changed.find(d => d.callFrame.functionName === 'processData');
    expect(processDataDiff).toBeDefined();
  });
});

function findNode(node: { callFrame: { functionName: string }; children: any[] }, name: string): any {
  if (node.callFrame.functionName === name) return node;
  for (const child of node.children) {
    const found = findNode(child, name);
    if (found) return found;
  }
  return undefined;
}

function flattenTree(node: { children: any[] }): any[] {
  const result = [node];
  for (const child of node.children) {
    result.push(...flattenTree(child));
  }
  return result;
}
