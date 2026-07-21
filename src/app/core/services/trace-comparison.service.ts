import { Injectable } from '@angular/core';
import { AnalysisResult } from '../models/analysis-result.model';
import { MetricDiff, TraceComparison } from '../models/trace-comparison.model';

const LOWER_IS_BETTER = new Set(['LCP', 'FCP', 'INP', 'TBT', 'CLS']);

@Injectable({ providedIn: 'root' })
export class TraceComparisonService {
  compare(current: AnalysisResult, baseline: AnalysisResult): TraceComparison {
    const metricDiffs = this.diffMetrics(current, baseline);
    const currentIds = new Set(current.actionItems.map(a => a.id));
    const baselineIds = new Set(baseline.actionItems.map(a => a.id));

    return {
      current,
      baseline,
      metricDiffs,
      newActionItems: current.actionItems.filter(a => !baselineIds.has(a.id)),
      resolvedActionItems: baseline.actionItems.filter(a => !currentIds.has(a.id)),
      unchangedActionItems: current.actionItems.filter(a => baselineIds.has(a.id)),
    };
  }

  private diffMetrics(current: AnalysisResult, baseline: AnalysisResult): MetricDiff[] {
    const baselineMap = new Map(baseline.metrics.map(m => [m.shortName, m]));
    const diffs: MetricDiff[] = [];

    for (const cur of current.metrics) {
      const base = baselineMap.get(cur.shortName);
      if (!base) continue;

      const delta = cur.value - base.value;
      const deltaPercent = base.value !== 0
        ? Math.round((delta / base.value) * 100)
        : 0;

      diffs.push({
        name: cur.name,
        shortName: cur.shortName,
        current: cur,
        baseline: base,
        delta,
        deltaPercent,
        improved: LOWER_IS_BETTER.has(cur.shortName) ? delta < 0 : delta > 0,
      });
    }

    return diffs;
  }
}
