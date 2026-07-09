import type { CpuAnalysisRule, CpuRuleResult } from '../cpu-analysis-rule';
import type { ParsedCpuProfile } from '../../models/cpu-profile.model';

const GC_NAMES_EXACT = new Set(['(garbage collector)', 'MinorGC', 'MajorGC', 'Scavenge', 'GC']);
const WARNING_THRESHOLD = 5;
const CRITICAL_THRESHOLD = 15;

export class GcPressureRule implements CpuAnalysisRule {
  readonly name = 'gc-pressure';

  analyze(profile: ParsedCpuProfile): CpuRuleResult {
    const gcEntries = profile.flatProfile.filter(
      e => GC_NAMES_EXACT.has(e.callFrame.functionName)
    );

    const gcTime = gcEntries.reduce((sum, e) => sum + e.selfTime, 0);
    const gcPercent = profile.totalTime > 0 ? (gcTime / profile.totalTime) * 100 : 0;

    const actionItems = gcPercent > WARNING_THRESHOLD ? [{
      id: 'gc-pressure',
      title: `GC takes ${gcPercent.toFixed(1)}% of CPU time (${gcTime.toFixed(1)}ms)`,
      detail: `Garbage collection consumed ${gcPercent.toFixed(1)}% of the profile. This suggests high allocation pressure.`,
      severity: (gcPercent > CRITICAL_THRESHOLD ? 'critical' : 'warning') as 'critical' | 'warning',
      metric: 'MEMORY' as const,
      fix: 'Reduce object allocations in hot paths. Use object pooling, avoid creating short-lived objects in loops, and reuse buffers.',
    }] : [];

    return {
      actionItems,
      metrics: [{
        name: 'GC Time',
        shortName: 'MEM',
        value: gcPercent,
        displayValue: `${gcPercent.toFixed(1)}%`,
        unit: '%',
        rating: gcPercent > CRITICAL_THRESHOLD ? 'poor' : gcPercent > WARNING_THRESHOLD ? 'needs-improvement' : 'good',
      }],
    };
  }
}
