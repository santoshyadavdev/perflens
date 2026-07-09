import { describe, it, expect } from 'vitest';
import { DeepCallStacksRule } from './deep-call-stacks.rule';
import { buildCallTree } from '../../parsers/cpu-profile-parser';
import sampleProfile from '../../../../test-fixtures/sample-cpu-profile.json';
import type { CpuProfileRaw } from '../../models/cpu-profile.model';

describe('DeepCallStacksRule', () => {
  const rule = new DeepCallStacksRule();
  it('should have name "deep-call-stacks"', () => {
    expect(rule.name).toBe('deep-call-stacks');
  });
  it('should produce a "Max Stack Depth" metric', () => {
    const profile = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    const result = rule.analyze(profile);
    const metric = result.metrics.find(m => m.name === 'Max Stack Depth');
    expect(metric).toBeDefined();
    expect(metric!.value).toBeGreaterThan(0);
  });
  it('should detect deep stacks when depth > 30', () => {
    const profile = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    const result = rule.analyze(profile);
    expect(result.metrics[0].rating).toBe('good');
  });
});
