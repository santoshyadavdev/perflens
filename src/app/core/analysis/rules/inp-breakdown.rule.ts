import { AnalysisRule, RuleResult } from '../analysis-rule';
import { ParsedTrace, TraceEvent } from '../../models/trace-event.model';
import { ActionItem } from '../../models/action-item.model';
import { MetricScore, rateMetric } from '../../models/metric-score.model';

interface InteractionData {
  interactionId: number;
  type: string;
  durationMs: number;
  inputDelayMs: number;
  processingMs: number;
  presentationDelayMs: number;
}

function extractInteractionData(event: TraceEvent): InteractionData | null {
  const data = event.args?.['data'] as Record<string, unknown> | undefined;
  if (!data) return null;

  const interactionId = data['interactionId'] as number | undefined;
  const durationMs = data['duration'] as number | undefined;
  const processingStart = data['processingStart'] as number | undefined;
  const processingEnd = data['processingEnd'] as number | undefined;
  const type = (data['type'] as string | undefined) ?? 'unknown';

  if (
    interactionId == null ||
    !durationMs ||
    processingStart == null ||
    processingEnd == null
  ) {
    return null;
  }

  const rawInputDelay = Math.round((processingStart - event.ts) / 1000);
  const rawProcessing = Math.round((processingEnd - processingStart) / 1000);
  const rawPresentation = durationMs - rawInputDelay - rawProcessing;
  const inputDelayMs = Math.max(0, rawInputDelay);
  const processingMs = Math.max(0, rawProcessing);
  const presentationDelayMs = Math.max(0, rawPresentation);

  return { interactionId, type, durationMs, inputDelayMs, processingMs, presentationDelayMs };
}

function bottleneckDescription(interaction: InteractionData): string {
  const { inputDelayMs, processingMs, presentationDelayMs } = interaction;
  const max = Math.max(inputDelayMs, processingMs, presentationDelayMs);
  if (max === inputDelayMs) return 'main bottleneck: input delay (other work blocking event dispatch)';
  if (max === processingMs) return 'main bottleneck: event handler processing time';
  return 'main bottleneck: presentation / rendering delay';
}

export class InpBreakdownRule implements AnalysisRule {
  readonly name = 'inp-breakdown';

  analyze(trace: ParsedTrace): RuleResult {
    const metrics: MetricScore[] = [];
    const actionItems: ActionItem[] = [];

    const eventTimingEvents = trace.traceEvents.filter(
      e => e.name === 'EventTiming' && e.cat?.includes('devtools.timeline'),
    );

    if (eventTimingEvents.length === 0) {
      return { actionItems, metrics };
    }

    // Deduplicate by interactionId – keep the highest-duration entry per id
    const byId = new Map<number, InteractionData>();
    for (const event of eventTimingEvents) {
      const data = extractInteractionData(event);
      if (!data || data.interactionId === 0) continue;
      const existing = byId.get(data.interactionId);
      if (!existing || data.durationMs > existing.durationMs) {
        byId.set(data.interactionId, data);
      }
    }

    const interactions = Array.from(byId.values());
    if (interactions.length === 0) {
      return { actionItems, metrics };
    }

    // INP = worst interaction (simplified; real INP uses p98 for >50 interactions)
    interactions.sort((a, b) => b.durationMs - a.durationMs);
    const worst = interactions[0];

    metrics.push({
      name: 'Interaction to Next Paint',
      shortName: 'INP',
      value: worst.durationMs,
      displayValue: `${worst.durationMs}ms`,
      unit: 'ms',
      rating: rateMetric('INP', worst.durationMs),
    });

    // Report action items for interactions > 200ms (up to 5)
    const slowInteractions = interactions.filter(i => i.durationMs > 200).slice(0, 5);
    for (const interaction of slowInteractions) {
      const severity = interaction.durationMs > 500 ? 'critical' : 'warning';
      const { inputDelayMs, processingMs, presentationDelayMs } = interaction;

      const detail =
        `Interaction (${interaction.type}) took ${interaction.durationMs}ms. ` +
        `Input delay: ${inputDelayMs}ms | Processing: ${processingMs}ms | Presentation delay: ${presentationDelayMs}ms. ` +
        `${bottleneckDescription(interaction)}.`;

      const fix =
        severity === 'critical'
          ? 'Break up long event handlers with scheduler.postTask() or setTimeout(0). Avoid synchronous layout/style reads inside handlers. Use requestAnimationFrame for visual updates.'
          : 'Reduce event handler work. Debounce high-frequency events. Defer non-critical work with setTimeout or queueMicrotask.';

      const actionItem: ActionItem = {
        id: `inp-slow-${interaction.interactionId}`,
        severity,
        title: `Slow ${interaction.type} interaction: ${interaction.durationMs}ms`,
        detail,
        metric: 'INP',
        fix,
      };

      actionItems.push(actionItem);
    }

    return { actionItems, metrics };
  }
}
