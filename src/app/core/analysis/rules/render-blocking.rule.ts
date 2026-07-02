import { AnalysisRule, RuleResult } from '../analysis-rule';
import { ParsedTrace, TraceEvent } from '../../models/trace-event.model';
import { ActionItem } from '../../models/action-item.model';

interface ScriptEval {
  url: string;
  startTs: number;
  durUs: number;
  size?: number;
}

export class RenderBlockingRule implements AnalysisRule {
  readonly name = 'render-blocking';

  analyze(trace: ParsedTrace): RuleResult {
    const fcpEvent = trace.traceEvents.find(
      e => e.name === 'firstContentfulPaint' && e.cat?.includes('blink.user_timing')
    );
    if (!fcpEvent) return { actionItems: [], metrics: [] };

    const fcpTs = fcpEvent.ts;
    const resourceSizes = this.buildResourceSizeMap(trace.traceEvents);

    const scriptEvals = trace.traceEvents
      .filter(
        e => e.name === 'EvaluateScript' &&
             e.tid === trace.mainThreadId &&
             e.ph === 'X' &&
             e.ts < fcpTs
      )
      .map(e => {
        const data = e.args?.['data'] as Record<string, unknown> | undefined;
        const url = (data?.['url'] as string) ?? 'unknown';
        return {
          url,
          startTs: e.ts,
          durUs: e.dur ?? 0,
          size: resourceSizes.get(url),
        };
      })
      .filter(s => s.durUs > 10_000); // >10ms eval time

    const actionItems: ActionItem[] = scriptEvals.map((script, i) => {
      const durMs = script.durUs / 1000;
      const fileName = script.url.split('/').pop() ?? script.url;
      const sizeKb = script.size ? (script.size / 1024).toFixed(0) : null;

      return {
        id: `render-blocking-${i}`,
        severity: durMs > 500 ? 'critical' : 'warning',
        title: `Render-blocking script: ${fileName} (${durMs.toFixed(0)}ms)`,
        detail: `${fileName}${sizeKb ? ` (${sizeKb}KB)` : ''} blocks rendering for ${durMs.toFixed(0)}ms. It is evaluated synchronously before First Contentful Paint.`,
        metric: 'LCP' as const,
        fix: `${fileName} blocks rendering for ${durMs.toFixed(0)}ms before First Contentful Paint.${sizeKb ? ` File size: ${sizeKb}KB.` : ''}\n\n` +
          `1. Add \`defer\` attribute: \`<script src="${fileName}" defer>\`\n` +
          `2. If third-party, load after FCP: \`<script async src="${fileName}">\`\n` +
          `3. Code-split with dynamic import: \`const module = await import('./${fileName.replace(/\.[^.]+$/, '')}')\``,
        source: { scriptUrl: script.url },
      };
    });

    return { actionItems, metrics: [] };
  }

  private buildResourceSizeMap(events: TraceEvent[]): Map<string, number> {
    const sizes = new Map<string, number>();
    for (const e of events) {
      if (e.name === 'ResourceFinish' || e.name === 'ResourceReceiveResponse') {
        const data = e.args?.['data'] as Record<string, unknown> | undefined;
        const requestId = data?.['requestId'] as string;
        const size = (data?.['encodedDataLength'] as number) ??
                     (data?.['decodedBodyLength'] as number);
        if (requestId && size) {
          const sendEvent = events.find(
            se => se.name === 'ResourceSendRequest' &&
                  (se.args?.['data'] as Record<string, unknown>)?.['requestId'] === requestId
          );
          if (sendEvent) {
            const url = (sendEvent.args?.['data'] as Record<string, unknown>)?.['url'] as string;
            if (url) sizes.set(url, size);
          }
        }
      }
    }
    return sizes;
  }
}
