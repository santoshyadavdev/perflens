import { AnalysisRule, RuleResult } from '../analysis-rule';
import { ParsedTrace, TraceEvent } from '../../models/trace-event.model';
import { ActionItem } from '../../models/action-item.model';

export class ForcedReflowRule implements AnalysisRule {
  readonly name = 'forced-reflow';

  analyze(trace: ParsedTrace): RuleResult {
    const mainEvents = trace.traceEvents
      .filter(e => e.tid === trace.mainThreadId && e.ph === 'X')
      .sort((a, b) => a.ts - b.ts);

    const actionItems: ActionItem[] = [];
    let reflowIndex = 0;

    for (let i = 1; i < mainEvents.length; i++) {
      const prev = mainEvents[i - 1];
      const curr = mainEvents[i];

      if (this.isJsExecution(prev) && this.isLayout(curr)) {
        const gap = curr.ts - (prev.ts + (prev.dur ?? 0));
        // Layout happening during or immediately after JS (within 5ms gap)
        if (gap < 5000) {
          const data = prev.args?.['data'] as Record<string, unknown> | undefined;
          const functionName = (data?.['functionName'] as string) ?? prev.name;
          const scriptUrl = data?.['url'] as string | undefined;
          const fileName = scriptUrl ? scriptUrl.split('/').pop() : undefined;
          const layoutDurMs = (curr.dur ?? 0) / 1000;

          actionItems.push({
            id: `forced-reflow-${reflowIndex++}`,
            severity: layoutDurMs > 10 ? 'critical' : 'warning',
            title: `Forced reflow triggered by ${functionName}`,
            detail: `${functionName}${fileName ? ` in ${fileName}` : ''} triggers a synchronous layout (${layoutDurMs.toFixed(1)}ms). This happens when JS reads layout properties (offsetHeight, getBoundingClientRect) after modifying styles.`,
            metric: 'INP',
            fix: `${functionName} triggers forced synchronous layout (${layoutDurMs.toFixed(1)}ms).\n\n` +
              `Common culprits: offsetHeight, offsetWidth, getBoundingClientRect(), scrollTop, clientHeight\n\n` +
              `1. Read all layout properties FIRST, then make DOM changes\n` +
              `2. Use \`requestAnimationFrame()\` to batch writes:\n` +
              `   requestAnimationFrame(() => { element.style.height = newHeight + 'px'; })\n` +
              `3. Consider using CSS containment: \`contain: layout\` on the affected element`,
            source: {
              functionName,
              scriptUrl,
            },
          });
        }
      }
    }

    return { actionItems, metrics: [] };
  }

  private isJsExecution(event: TraceEvent): boolean {
    return ['FunctionCall', 'EvaluateScript', 'v8.compile'].includes(event.name);
  }

  private isLayout(event: TraceEvent): boolean {
    return event.name === 'Layout';
  }
}
