import { Injectable } from '@angular/core';
import { ParsedTrace } from '../models/trace-event.model';
import { AnalysisResult } from '../models/analysis-result.model';
import { ActionItem } from '../models/action-item.model';
import { MetricScore } from '../models/metric-score.model';
import { AnalysisRule } from './analysis-rule';
import { LongTasksRule } from './rules/long-tasks.rule';
import { LcpBreakdownRule } from './rules/lcp-breakdown.rule';
import { ForcedReflowRule } from './rules/forced-reflow.rule';
import { RenderBlockingRule } from './rules/render-blocking.rule';

const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

@Injectable({ providedIn: 'root' })
export class RuleEngineService {
  private readonly rules: AnalysisRule[] = [
    new LongTasksRule(),
    new LcpBreakdownRule(),
    new ForcedReflowRule(),
    new RenderBlockingRule(),
  ];

  analyze(trace: ParsedTrace, fileName: string, fileSize: number): AnalysisResult {
    const allActionItems: ActionItem[] = [];
    const allMetrics: MetricScore[] = [];

    for (const rule of this.rules) {
      const result = rule.analyze(trace);
      allActionItems.push(...result.actionItems);
      allMetrics.push(...result.metrics);
    }

    // Add placeholder metrics for missing CWVs
    const metricNames = new Set(allMetrics.map(m => m.shortName));
    const coreMetrics: Array<{ short: string; full: string }> = [
      { short: 'FCP', full: 'First Contentful Paint' },
      { short: 'LCP', full: 'Largest Contentful Paint' },
      { short: 'TBT', full: 'Total Blocking Time' },
      { short: 'INP', full: 'Interaction to Next Paint' },
      { short: 'CLS', full: 'Cumulative Layout Shift' },
    ];
    for (const { short, full } of coreMetrics) {
      if (!metricNames.has(short)) {
        allMetrics.push({
          name: full,
          shortName: short,
          value: -1,
          displayValue: 'N/A',
          unit: 'ms',
          rating: 'needs-improvement' as const,
        });
      }
    }

    // Sort metrics: FCP, LCP, TBT, INP, CLS
    const metricOrder = ['FCP', 'LCP', 'TBT', 'INP', 'CLS'];
    allMetrics.sort((a, b) => {
      const ai = metricOrder.indexOf(a.shortName);
      const bi = metricOrder.indexOf(b.shortName);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    allActionItems.sort(
      (a, b) => (SEVERITY_ORDER[a.severity] ?? 2) - (SEVERITY_ORDER[b.severity] ?? 2)
    );

    return {
      fileName,
      fileSize,
      analyzedAt: new Date(),
      metrics: allMetrics,
      actionItems: allActionItems,
      parsedTrace: trace,
    };
  }
}
