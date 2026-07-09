import type { CpuAnalysisRule, CpuRuleResult } from '../cpu-analysis-rule';
import type { ParsedCpuProfile, CpuProfileComparison } from '../../models/cpu-profile.model';
import type { ActionItem } from '../../models/action-item.model';

const HOT_MODULE_THRESHOLD = 20; // % total time

export class ModuleAggregationRule implements CpuAnalysisRule {
  readonly name = 'module-aggregation';

  analyze(profile: ParsedCpuProfile, comparison?: CpuProfileComparison): CpuRuleResult {
    const moduleMap = new Map<string, number>();

    for (const entry of profile.flatProfile) {
      const url = entry.callFrame.url || '(native)';
      moduleMap.set(url, (moduleMap.get(url) ?? 0) + entry.selfTime);
    }

    const modules = Array.from(moduleMap.entries())
      .map(([url, selfTime]) => ({
        url,
        selfTime,
        percent: profile.totalTime > 0 ? (selfTime / profile.totalTime) * 100 : 0,
      }))
      .filter(m => m.url !== '' && m.url !== '(native)')
      .sort((a, b) => b.selfTime - a.selfTime);

    const actionItems: ActionItem[] = modules
      .filter(m => m.percent > HOT_MODULE_THRESHOLD)
      .map(m => {
        const basename = m.url.split('/').pop() || m.url;
        return {
          id: `hot-module-${basename}`,
          title: `${basename} consumes ${m.percent.toFixed(1)}% of CPU time`,
          detail: `Script "${m.url}" accounts for ${m.selfTime.toFixed(1)}ms (${m.percent.toFixed(1)}%) of CPU self time.`,
          severity: 'warning' as const,
          metric: 'CPU' as const,
          fix: `Consider code-splitting "${basename}", lazy loading it, or moving heavy computation to a Web Worker.`,
        };
      });

    // Comparison mode
    if (comparison) {
      const baseModuleMap = new Map<string, number>();
      for (const entry of comparison.baseline.flatProfile) {
        const url = entry.callFrame.url || '(native)';
        baseModuleMap.set(url, (baseModuleMap.get(url) ?? 0) + entry.selfTime);
      }

      for (const mod of modules) {
        const baseTime = baseModuleMap.get(mod.url) ?? 0;
        const delta = mod.selfTime - baseTime;
        if (delta > 0 && (delta / profile.totalTime) * 100 > 5) {
          const basename = mod.url.split('/').pop() || mod.url;
          actionItems.push({
            id: `module-regression-${basename}`,
            title: `${basename} regressed by ${delta.toFixed(1)}ms`,
            detail: `Module time increased from ${baseTime.toFixed(1)}ms to ${mod.selfTime.toFixed(1)}ms.`,
            severity: 'warning',
            metric: 'CPU',
            fix: `Investigate what changed in "${basename}" that increased its CPU time.`,
          });
        }
      }
    }

    const hottestPercent = modules.length > 0 ? modules[0].percent : 0;

    return {
      actionItems,
      metrics: [{
        name: 'Hottest Module',
        shortName: 'CPU',
        value: hottestPercent,
        displayValue: `${hottestPercent.toFixed(1)}%`,
        unit: '%',
        rating: hottestPercent > HOT_MODULE_THRESHOLD ? 'needs-improvement' : 'good',
      }],
    };
  }
}
