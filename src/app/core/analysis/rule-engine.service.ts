import { Injectable } from '@angular/core';
import { ParsedTrace } from '../models/trace-event.model';
import { AnalysisResult } from '../models/analysis-result.model';
import { ActionItem } from '../models/action-item.model';
import { MetricScore } from '../models/metric-score.model';
import { AnalysisRule } from './analysis-rule';
import type { HeapAnalysisRule } from './heap-analysis-rule';
import type { ParsedHeapSnapshot, HeapComparison } from '../models/heap-snapshot.model';
import { LongTasksRule } from './rules/long-tasks.rule';
import { LcpBreakdownRule } from './rules/lcp-breakdown.rule';
import { ForcedReflowRule } from './rules/forced-reflow.rule';
import { RenderBlockingRule } from './rules/render-blocking.rule';
import { InpBreakdownRule } from './rules/inp-breakdown.rule';
import { ClsCulpritsRule } from './rules/cls-culprits.rule';
import { ThirdPartyImpactRule } from './rules/third-party-impact.rule';
import { NetworkChainRule } from './rules/network-chain.rule';
import { ImageDeliveryRule } from './rules/image-delivery.rule';
import { UnusedJsRule } from './rules/unused-js.rule';

const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

@Injectable({ providedIn: 'root' })
export class RuleEngineService {
  private readonly heapRules: HeapAnalysisRule[] = [];

  private readonly rules: AnalysisRule[] = [
    new LongTasksRule(),
    new LcpBreakdownRule(),
    new ForcedReflowRule(),
    new RenderBlockingRule(),
    new InpBreakdownRule(),
    new ClsCulpritsRule(),
    new ThirdPartyImpactRule(),
    new NetworkChainRule(),
    new ImageDeliveryRule(),
    new UnusedJsRule(),
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
    const coreMetrics: Array<{ short: string; full: string; unit: string }> = [
      { short: 'FCP', full: 'First Contentful Paint', unit: 'ms' },
      { short: 'LCP', full: 'Largest Contentful Paint', unit: 'ms' },
      { short: 'TBT', full: 'Total Blocking Time', unit: 'ms' },
      { short: 'INP', full: 'Interaction to Next Paint', unit: 'ms' },
      { short: 'CLS', full: 'Cumulative Layout Shift', unit: '' },
    ];
    for (const { short, full, unit } of coreMetrics) {
      if (!metricNames.has(short)) {
        allMetrics.push({
          name: full,
          shortName: short,
          value: -1,
          displayValue: 'N/A',
          unit,
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

  analyzeHeapSnapshot(
    snapshot: ParsedHeapSnapshot,
    comparison?: HeapComparison
  ): { actionItems: ActionItem[]; metrics: MetricScore[] } {
    const allItems: ActionItem[] = [];
    const allMetrics: MetricScore[] = [];

    for (const rule of this.heapRules) {
      const result = rule.analyze(snapshot, comparison);
      allItems.push(...result.actionItems);
      allMetrics.push(...result.metrics);
    }

    allItems.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99));

    return { actionItems: allItems, metrics: allMetrics };
  }
}
