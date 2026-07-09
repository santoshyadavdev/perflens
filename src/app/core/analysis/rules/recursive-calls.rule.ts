import type { CpuAnalysisRule, CpuRuleResult } from '../cpu-analysis-rule';
import type { ParsedCpuProfile, CallTreeNode } from '../../models/cpu-profile.model';

export class RecursiveCallsRule implements CpuAnalysisRule {
  readonly name = 'recursive-calls';

  analyze(profile: ParsedCpuProfile): CpuRuleResult {
    const recursiveFunctions = new Set<string>();

    function walk(node: CallTreeNode, ancestors: Set<string>): void {
      const key = `${node.callFrame.functionName}|${node.callFrame.url}|${node.callFrame.lineNumber}`;
      if (ancestors.has(key) && node.callFrame.functionName !== '(root)') {
        recursiveFunctions.add(node.callFrame.functionName);
      }
      const next = new Set(ancestors);
      next.add(key);
      for (const child of node.children) {
        walk(child, next);
      }
    }

    walk(profile.root, new Set());

    const actionItems = Array.from(recursiveFunctions).map(name => ({
      id: `recursive-${name}`,
      title: `${name} is called recursively`,
      detail: `"${name}" appears multiple times in the same call stack, indicating direct or mutual recursion.`,
      severity: 'warning' as const,
      metric: 'CPU' as const,
      fix: `Convert "${name}" to an iterative implementation, add memoization, or use tail-call optimization if possible.`,
      source: { functionName: name },
    }));

    return { actionItems, metrics: [] };
  }
}
