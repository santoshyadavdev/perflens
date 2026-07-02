import { AnalysisRule, RuleResult } from '../analysis-rule';
import { ParsedTrace, TraceEvent } from '../../models/trace-event.model';
import { ActionItem, Severity } from '../../models/action-item.model';
import { MetricScore, rateMetric } from '../../models/metric-score.model';

const LONG_TASK_THRESHOLD_US = 50_000; // 50ms in microseconds

export class LongTasksRule implements AnalysisRule {
  readonly name = 'long-tasks';

  analyze(trace: ParsedTrace): RuleResult {
    const mainThreadEvents = trace.traceEvents.filter(
      e => e.tid === trace.mainThreadId && e.ph === 'X' && (e.dur ?? 0) > LONG_TASK_THRESHOLD_US
    );

    const topLevelTasks = this.findTopLevelTasks(mainThreadEvents);
    const actionItems = mainThreadEvents.map((task, i) => this.taskToActionItem(task, trace, i));
    const tbt = this.computeTbt(topLevelTasks);

    const tbtMetric: MetricScore = {
      name: 'Total Blocking Time',
      shortName: 'TBT',
      value: tbt,
      displayValue: `${tbt.toFixed(0)}ms`,
      unit: 'ms',
      rating: rateMetric('TBT', tbt),
    };

    return { actionItems, metrics: [tbtMetric] };
  }

  private findTopLevelTasks(events: TraceEvent[]): TraceEvent[] {
    const sorted = [...events].sort((a, b) => a.ts - b.ts);
    const topLevel: TraceEvent[] = [];
    let lastEnd = 0;

    for (const event of sorted) {
      if (event.ts >= lastEnd) {
        topLevel.push(event);
        lastEnd = event.ts + (event.dur ?? 0);
      }
    }
    return topLevel;
  }

  private taskToActionItem(task: TraceEvent, trace: ParsedTrace, index: number): ActionItem {
    const durMs = (task.dur ?? 0) / 1000;
    const data = task.args?.['data'] as Record<string, unknown> | undefined;
    const functionName = (data?.['functionName'] as string) ?? task.name;
    const scriptUrl = data?.['url'] as string | undefined;
    const lineNumber = data?.['lineNumber'] as number | undefined;
    const fileName = scriptUrl ? scriptUrl.split('/').pop() : undefined;

    const severity: Severity = durMs > 200 ? 'critical' : durMs > 100 ? 'warning' : 'info';

    return {
      id: `long-task-${index}`,
      severity,
      title: `Long task: ${functionName} (${durMs.toFixed(0)}ms)`,
      detail: `${functionName} ran for ${durMs.toFixed(0)}ms on the main thread${fileName ? ` in ${fileName}:${lineNumber ?? '?'}` : ''}. Tasks over 50ms block user interactions.`,
      metric: 'TBT',
      fix: durMs > 200
        ? `Break ${functionName} into smaller chunks using \`scheduler.yield()\` or \`requestIdleCallback()\`. Consider moving heavy computation to a Web Worker.`
        : `Consider deferring ${functionName} or splitting it into smaller tasks.`,
      source: {
        functionName,
        scriptUrl,
        lineNumber: lineNumber ?? undefined,
      },
    };
  }

  private computeTbt(topLevelTasks: TraceEvent[]): number {
    let tbt = 0;
    for (const task of topLevelTasks) {
      const durMs = (task.dur ?? 0) / 1000;
      if (durMs > 50) {
        tbt += durMs - 50;
      }
    }
    return tbt;
  }
}
