import { describe, it, expect } from 'vitest';
import { RecursiveCallsRule } from './recursive-calls.rule';
import { buildCallTree } from '../../parsers/cpu-profile-parser';
import sampleProfile from '../../../../test-fixtures/sample-cpu-profile.json';
import type { CpuProfileRaw } from '../../models/cpu-profile.model';

describe('RecursiveCallsRule', () => {
  const rule = new RecursiveCallsRule();
  it('should have name "recursive-calls"', () => {
    expect(rule.name).toBe('recursive-calls');
  });
  it('should detect recursive calls (processData appears twice in call stack)', () => {
    const profile = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    const result = rule.analyze(profile);
    expect(result.actionItems.length).toBeGreaterThan(0);
    const names = result.actionItems.map(a => a.title);
    expect(names.some(n => n.includes('processData'))).toBe(true);
  });
  it('should assign warning severity', () => {
    const profile = buildCallTree(sampleProfile as CpuProfileRaw, 'test.cpuprofile');
    const result = rule.analyze(profile);
    expect(result.actionItems.every(a => a.severity === 'warning')).toBe(true);
  });
});
