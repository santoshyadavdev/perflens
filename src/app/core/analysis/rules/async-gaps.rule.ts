import type { CpuAnalysisRule, CpuRuleResult } from '../cpu-analysis-rule';
import type { ParsedCpuProfile } from '../../models/cpu-profile.model';

const WARNING_GAP_MS = 10;
const CRITICAL_GAP_MS = 50;

export class AsyncGapsRule implements CpuAnalysisRule {
  readonly name = 'async-gaps';

  analyze(profile: ParsedCpuProfile): CpuRuleResult {
    let maxGap = 0;
    let maxGapIndex = 0;
    const largeGaps: Array<{ index: number; delta: number; timestamp: number }> = [];

    for (const sample of profile.samples) {
      if (sample.delta > WARNING_GAP_MS) {
        largeGaps.push({ index: profile.samples.indexOf(sample), delta: sample.delta, timestamp: sample.timestamp });
        if (sample.delta > maxGap) {
          maxGap = sample.delta;
          maxGapIndex = profile.samples.indexOf(sample);
        }
      }
    }

    const actionItems = largeGaps.map((gap, i) => ({
      id: `async-gap-${i}`,
      title: `${gap.delta.toFixed(1)}ms gap between samples at ${gap.timestamp.toFixed(1)}ms`,
      detail: `A ${gap.delta.toFixed(1)}ms gap between consecutive samples suggests event loop blockage or a long synchronous task.`,
      severity: (gap.delta > CRITICAL_GAP_MS ? 'critical' : 'warning') as 'critical' | 'warning',
      metric: 'INP' as const,
      fix: 'Break up long synchronous work with scheduler.yield() or setTimeout to allow the event loop to process other tasks.',
    }));

    return {
      actionItems,
      metrics: [{
        name: 'Max Async Gap',
        shortName: 'INP',
        value: maxGap,
        displayValue: `${maxGap.toFixed(1)}ms`,
        unit: 'ms',
        rating: maxGap > CRITICAL_GAP_MS ? 'poor' : maxGap > WARNING_GAP_MS ? 'needs-improvement' : 'good',
      }],
    };
  }
}
