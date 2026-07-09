import { describe, it, expect } from 'vitest';
import { GcPressureRule } from './gc-pressure.rule';
import { buildCallTree } from '../../parsers/cpu-profile-parser';
import sampleProfile from '../../../../test-fixtures/sample-cpu-profile.json';
import type { CpuProfileRaw } from '../../models/cpu-profile.model';

describe('GcPressureRule', () => {
  const rule = new GcPressureRule();
  it('should have name "gc-pressure"', () => {
    expect(rule.name).toBe('gc-pressure');
  });
  it('should detect GC functions in the profile', () => {
    const profile = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    const result = rule.analyze(profile);
    const metric = result.metrics.find(m => m.name === 'GC Time');
    expect(metric).toBeDefined();
    expect(metric!.value).toBeGreaterThan(0);
  });
  it('should produce MEM metric', () => {
    const profile = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    const result = rule.analyze(profile);
    expect(result.metrics[0].shortName).toBe('MEM');
  });
});
