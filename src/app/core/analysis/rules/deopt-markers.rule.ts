import type { CpuAnalysisRule, CpuRuleResult } from '../cpu-analysis-rule';
import type { ParsedCpuProfile } from '../../models/cpu-profile.model';

const HOT_THRESHOLD = 5; // % self time

export class DeoptMarkersRule implements CpuAnalysisRule {
  readonly name = 'deopt-markers';

  analyze(profile: ParsedCpuProfile): CpuRuleResult {
    const actionItems = profile.deoptEvents.map((deopt, i) => {
      const selfPercent = profile.totalTime > 0
        ? (deopt.selfTime / profile.totalTime) * 100
        : 0;
      const isHot = selfPercent > HOT_THRESHOLD;

      return {
        id: `deopt-${deopt.callFrame.functionName}-${i}`,
        title: `${deopt.callFrame.functionName} was deoptimized: ${deopt.reason}`,
        detail: `"${deopt.callFrame.functionName}" at ${deopt.callFrame.url || '(unknown)'}:${deopt.callFrame.lineNumber} was deoptimized by V8.${isHot ? ' This function is also a hot path.' : ''}`,
        severity: (isHot ? 'critical' : 'warning') as 'critical' | 'warning',
        metric: 'V8' as const,
        fix: `Reason: "${deopt.reason}". Ensure consistent types in function arguments and avoid hidden class transitions. Use monomorphic call sites.`,
        source: {
          functionName: deopt.callFrame.functionName,
          scriptUrl: deopt.callFrame.url,
          lineNumber: deopt.callFrame.lineNumber,
        },
      };
    });

    return {
      actionItems,
      metrics: [{
        name: 'Deoptimizations',
        shortName: 'V8',
        value: profile.deoptEvents.length,
        displayValue: `${profile.deoptEvents.length}`,
        unit: '',
        rating: profile.deoptEvents.length > 5 ? 'poor' : profile.deoptEvents.length > 0 ? 'needs-improvement' : 'good',
      }],
    };
  }
}
