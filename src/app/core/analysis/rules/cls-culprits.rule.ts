import { AnalysisRule, RuleResult } from '../analysis-rule';
import { ParsedTrace } from '../../models/trace-event.model';
import { ActionItem, Severity } from '../../models/action-item.model';
import { MetricScore, rateMetric } from '../../models/metric-score.model';

interface ImpactedNode {
  node_id: number;
  old_rect: [number, number, number, number];
  new_rect: [number, number, number, number];
}

interface LayoutShiftData {
  had_recent_input: boolean;
  score: number;
  impacted_nodes?: ImpactedNode[];
}

interface ShiftEntry {
  ts: number;
  score: number;
  nodes: ImpactedNode[];
}

export class ClsCulpritsRule implements AnalysisRule {
  readonly name = 'cls-culprits';

  analyze(trace: ParsedTrace): RuleResult {
    const metrics: MetricScore[] = [];
    const actionItems: ActionItem[] = [];

    const shiftEvents = trace.traceEvents.filter(
      e => e.name === 'LayoutShift' && e.cat === 'loading' && e.ph === 'I'
    );

    if (shiftEvents.length === 0) {
      const cls = this.buildMetric(0);
      metrics.push(cls);
      actionItems.push({
        id: 'cls-no-shifts',
        severity: 'info',
        title: 'No layout shifts detected',
        detail: 'No LayoutShift events were found in this trace. The page appears visually stable.',
        metric: 'CLS',
        fix: 'No action needed.',
      });
      return { actionItems, metrics };
    }

    const unexpected: ShiftEntry[] = [];
    for (const e of shiftEvents) {
      const data = e.args?.['data'] as LayoutShiftData | undefined;
      if (!data || data.had_recent_input) continue;
      unexpected.push({
        ts: e.ts,
        score: data.score,
        nodes: data.impacted_nodes ?? [],
      });
    }

    const cls = unexpected.reduce((sum, s) => sum + s.score, 0);
    const metric = this.buildMetric(cls);
    metrics.push(metric);

    if (metric.rating === 'good') {
      actionItems.push({
        id: 'cls-good',
        severity: 'info',
        title: `CLS is good at ${cls.toFixed(3)}`,
        detail: `Cumulative Layout Shift is ${cls.toFixed(3)}, well under the 0.1 threshold. The page is visually stable.`,
        metric: 'CLS',
        fix: 'No action needed. To maintain this, avoid dynamically injecting content above existing content and always reserve space for images and ads.',
      });
      return { actionItems, metrics };
    }

    const top = [...unexpected].sort((a, b) => b.score - a.score).slice(0, 5);
    for (let i = 0; i < top.length; i++) {
      const shift = top[i];
      const timeMs = ((shift.ts - trace.navigationStart) / 1000).toFixed(0);
      const severity: Severity = shift.score > 0.1 ? 'critical' : 'warning';
      const nodeDesc = shift.nodes.length > 0
        ? shift.nodes.map(n => {
            const dy = n.new_rect[1] - n.old_rect[1];
            const dx = n.new_rect[0] - n.old_rect[0];
            return `node #${n.node_id} moved ${dx !== 0 ? `${dx}px horizontally ` : ''}${dy !== 0 ? `${dy}px vertically` : ''}`.trim();
          }).join('; ')
        : 'no node details available';

      actionItems.push({
        id: `cls-shift-${i + 1}`,
        severity,
        title: `Layout shift at ${timeMs}ms (score: ${shift.score.toFixed(3)})`,
        detail: `Unexpected layout shift with score ${shift.score.toFixed(3)} at ${timeMs}ms. Affected elements: ${nodeDesc}.`,
        metric: 'CLS',
        fix: 'Reserve explicit dimensions (width/height) for images, ads, and embeds. Avoid inserting DOM nodes above existing content. Use CSS transform instead of layout-affecting properties for animations.',
      });
    }

    return { actionItems, metrics };
  }

  private buildMetric(cls: number): MetricScore {
    return {
      name: 'Cumulative Layout Shift',
      shortName: 'CLS',
      value: cls,
      displayValue: cls.toFixed(3),
      unit: '',
      rating: rateMetric('CLS', cls),
    };
  }
}
