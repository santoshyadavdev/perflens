import type { CpuAnalysisRule, CpuRuleResult } from '../cpu-analysis-rule';
import type { ParsedCpuProfile, CpuProfileComparison } from '../../models/cpu-profile.model';
import type { ActionItem } from '../../models/action-item.model';

const HOT_THRESHOLD = 5;
const CRITICAL_THRESHOLD = 15;

export class HotFunctionsRule implements CpuAnalysisRule {
  readonly name = 'hot-functions';

  analyze(profile: ParsedCpuProfile, comparison?: CpuProfileComparison): CpuRuleResult {
    const hotFunctions = profile.flatProfile.filter(
      e => e.selfPercent > HOT_THRESHOLD &&
           e.callFrame.functionName !== '(idle)' &&
           e.callFrame.functionName !== '(root)'
    );

    const actionItems: ActionItem[] = hotFunctions.map((fn, i) => ({
      id: `hot-fn-${fn.callFrame.functionName}-${i}`,
      title: `${fn.callFrame.functionName} uses ${fn.selfPercent.toFixed(1)}% CPU (self time)`,
      detail: `"${fn.callFrame.functionName}" at ${fn.callFrame.url || '(unknown)'}:${fn.callFrame.lineNumber} consumed ${fn.selfTime.toFixed(1)}ms of self time (${fn.selfPercent.toFixed(1)}% of profile).`,
      severity: fn.selfPercent > CRITICAL_THRESHOLD ? 'critical' : 'warning',
      metric: 'CPU' as const,
      fix: `Profile "${fn.callFrame.functionName}" for optimization. Consider memoization, algorithmic improvements, or offloading to a Web Worker.`,
      source: {
        functionName: fn.callFrame.functionName,
        scriptUrl: fn.callFrame.url,
        lineNumber: fn.callFrame.lineNumber,
      },
    }));

    if (comparison) {
      for (const diff of comparison.changed) {
        if (diff.selfTimeDelta > 0) {
          const deltaPercent = comparison.baseline.totalTime > 0
            ? (diff.selfTimeDelta / comparison.baseline.totalTime) * 100
            : 0;
          if (deltaPercent > 2) {
            actionItems.push({
              id: `hot-fn-regression-${diff.callFrame.functionName}`,
              title: `${diff.callFrame.functionName} regressed by ${diff.selfTimeDelta.toFixed(1)}ms`,
              detail: `Self time increased from ${diff.baselineSelfTime.toFixed(1)}ms to ${diff.currentSelfTime.toFixed(1)}ms (+${deltaPercent.toFixed(1)}%).`,
              severity: 'warning',
              metric: 'CPU',
              fix: `Investigate what changed in "${diff.callFrame.functionName}" that increased its CPU time.`,
              source: {
                functionName: diff.callFrame.functionName,
                scriptUrl: diff.callFrame.url,
                lineNumber: diff.callFrame.lineNumber,
              },
            });
          }
        }
      }
    }

    const topSelfPercent = hotFunctions.length > 0 ? hotFunctions[0].selfPercent : 0;

    return {
      actionItems,
      metrics: [{
        name: 'Top Function Self Time',
        shortName: 'CPU',
        value: topSelfPercent,
        displayValue: `${topSelfPercent.toFixed(1)}%`,
        unit: '%',
        rating: topSelfPercent > CRITICAL_THRESHOLD ? 'poor' : topSelfPercent > HOT_THRESHOLD ? 'needs-improvement' : 'good',
      }],
    };
  }
}
