import type { CpuAnalysisRule, CpuRuleResult } from '../cpu-analysis-rule';
import type { ParsedCpuProfile, CallTreeNode } from '../../models/cpu-profile.model';

const WARNING_DEPTH = 30;
const CRITICAL_DEPTH = 50;

export class DeepCallStacksRule implements CpuAnalysisRule {
  readonly name = 'deep-call-stacks';

  analyze(profile: ParsedCpuProfile): CpuRuleResult {
    let maxDepth = 0;
    let deepestFrame = '';

    function walk(node: CallTreeNode): void {
      if (node.depth > maxDepth) {
        maxDepth = node.depth;
        deepestFrame = node.callFrame.functionName;
      }
      for (const child of node.children) {
        walk(child);
      }
    }

    walk(profile.root);

    const actionItems = maxDepth > WARNING_DEPTH ? [{
      id: `deep-stack-${maxDepth}`,
      title: `Call stack depth reaches ${maxDepth} frames`,
      detail: `Deepest frame: "${deepestFrame}". Deep stacks increase memory pressure and make debugging harder.`,
      severity: (maxDepth > CRITICAL_DEPTH ? 'critical' : 'warning') as 'critical' | 'warning',
      metric: 'CPU' as const,
      fix: 'Flatten recursion using iteration, add memoization, or use a trampoline pattern to reduce stack depth.',
      source: { functionName: deepestFrame },
    }] : [];

    return {
      actionItems,
      metrics: [{
        name: 'Max Stack Depth',
        shortName: 'CPU',
        value: maxDepth,
        displayValue: `${maxDepth}`,
        unit: 'frames',
        rating: maxDepth > CRITICAL_DEPTH ? 'poor' : maxDepth > WARNING_DEPTH ? 'needs-improvement' : 'good',
      }],
    };
  }
}
