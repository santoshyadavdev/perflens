import { AnalysisRule, RuleResult } from '../analysis-rule';
import { ParsedTrace } from '../../models/trace-event.model';
import { ActionItem } from '../../models/action-item.model';
import { MetricScore, rateMetric } from '../../models/metric-score.model';

export class LcpBreakdownRule implements AnalysisRule {
  readonly name = 'lcp-breakdown';

  analyze(trace: ParsedTrace): RuleResult {
    const metrics: MetricScore[] = [];
    const actionItems: ActionItem[] = [];

    const lcpEvent = trace.traceEvents.find(
      e => e.name === 'largestContentfulPaint::Candidate' && e.cat === 'loading'
    );

    const fcpEvent = trace.traceEvents.find(
      e => e.name === 'firstContentfulPaint' && e.cat === 'blink.user_timing'
    );

    if (fcpEvent) {
      const fcpMs = (fcpEvent.ts - trace.navigationStart) / 1000;
      metrics.push({
        name: 'First Contentful Paint',
        shortName: 'FCP',
        value: fcpMs,
        displayValue: `${(fcpMs / 1000).toFixed(1)}s`,
        unit: 'ms',
        rating: rateMetric('FCP', fcpMs),
      });
    }

    if (!lcpEvent) {
      return { actionItems, metrics };
    }

    const lcpMs = (lcpEvent.ts - trace.navigationStart) / 1000;
    const rating = rateMetric('LCP', lcpMs);

    metrics.push({
      name: 'Largest Contentful Paint',
      shortName: 'LCP',
      value: lcpMs,
      displayValue: `${(lcpMs / 1000).toFixed(1)}s`,
      unit: 'ms',
      rating,
    });

    if (rating !== 'good') {
      const lcpData = lcpEvent.args?.['data'] as Record<string, unknown> | undefined;
      const elementType = (lcpData?.['type'] as string) ?? 'unknown';
      const elementUrl = lcpData?.['url'] as string | undefined;

      const fcpMs = fcpEvent ? (fcpEvent.ts - trace.navigationStart) / 1000 : undefined;
      const renderDelay = fcpMs ? lcpMs - fcpMs : undefined;

      let detail = `LCP is ${(lcpMs / 1000).toFixed(1)}s (threshold: 2.5s). `;
      detail += `LCP element: <${elementType}>`;
      if (elementUrl) detail += ` (${elementUrl.split('/').pop()})`;
      detail += '.';
      if (renderDelay && renderDelay > 1000) {
        detail += ` ${(renderDelay / 1000).toFixed(1)}s between FCP and LCP — the LCP resource may be loading late or render-blocked.`;
      }

      let fix = '';
      if (elementType === 'image') {
        fix = 'Preload the LCP image with `<link rel="preload" as="image">`. Consider using `fetchpriority="high"` on the `<img>` tag. Ensure the image is served in modern format (WebP/AVIF) and appropriately sized.';
      } else {
        fix = 'Ensure the LCP element renders early. Remove render-blocking resources, inline critical CSS, and preload key resources.';
      }

      actionItems.push({
        id: 'lcp-slow',
        severity: rating === 'poor' ? 'critical' : 'warning',
        title: `LCP is ${rating === 'poor' ? 'poor' : 'slow'} at ${(lcpMs / 1000).toFixed(1)}s`,
        detail,
        metric: 'LCP',
        fix,
      });
    }

    return { actionItems, metrics };
  }
}
