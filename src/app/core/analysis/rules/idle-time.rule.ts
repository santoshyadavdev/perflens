import type { CpuAnalysisRule, CpuRuleResult } from '../cpu-analysis-rule';
import type { ParsedCpuProfile } from '../../models/cpu-profile.model';

const WARNING_BUSY = 50;  // %
const CRITICAL_BUSY = 80; // %

export class IdleTimeRule implements CpuAnalysisRule {
  readonly name = 'idle-time';

  analyze(profile: ParsedCpuProfile): CpuRuleResult {
    const idleEntry = profile.flatProfile.find(
      e => e.callFrame.functionName === '(idle)'
    );

    const idlePercent = idleEntry?.selfPercent ?? 0;
    const busyPercent = 100 - idlePercent;

    const actionItems = busyPercent > WARNING_BUSY ? [{
      id: 'cpu-busy',
      title: `CPU is busy ${busyPercent.toFixed(1)}% of the time`,
      detail: `Only ${idlePercent.toFixed(1)}% of the profile is idle. The main thread is heavily utilized.`,
      severity: (busyPercent > CRITICAL_BUSY ? 'warning' : 'info') as 'warning' | 'info',
      metric: 'CPU' as const,
      fix: 'Defer non-critical work with requestIdleCallback, break up long computations with scheduler.yield(), or offload to a Web Worker.',
    }] : [];

    return {
      actionItems,
      metrics: [{
        name: 'CPU Busy',
        shortName: 'CPU',
        value: busyPercent,
        displayValue: `${busyPercent.toFixed(1)}%`,
        unit: '%',
        rating: busyPercent > CRITICAL_BUSY ? 'poor' : busyPercent > WARNING_BUSY ? 'needs-improvement' : 'good',
      }],
    };
  }
}
