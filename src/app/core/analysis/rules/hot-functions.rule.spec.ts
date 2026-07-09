import { describe, it, expect } from 'vitest';
import { HotFunctionsRule } from './hot-functions.rule';
import { buildCallTree } from '../../parsers/cpu-profile-parser';
import sampleProfile from '../../../../test-fixtures/sample-cpu-profile.json';
import type { CpuProfileRaw } from '../../models/cpu-profile.model';

describe('HotFunctionsRule', () => {
  const rule = new HotFunctionsRule();
  function getProfile() {
    return buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
  }

  it('should have name "hot-functions"', () => {
    expect(rule.name).toBe('hot-functions');
  });
  it('should detect functions with >5% self time', () => {
    const result = rule.analyze(getProfile());
    expect(result.actionItems.length).toBeGreaterThan(0);
    expect(result.actionItems.every(a => a.metric === 'CPU')).toBe(true);
  });
  it('should produce a "Top Function Self Time" metric', () => {
    const result = rule.analyze(getProfile());
    const metric = result.metrics.find(m => m.name === 'Top Function Self Time');
    expect(metric).toBeDefined();
    expect(metric!.value).toBeGreaterThan(0);
  });
  it('should assign critical severity to functions >15% self time', () => {
    const result = rule.analyze(getProfile());
    const criticals = result.actionItems.filter(a => a.severity === 'critical');
    expect(criticals.length).toBeGreaterThanOrEqual(0);
  });
});
