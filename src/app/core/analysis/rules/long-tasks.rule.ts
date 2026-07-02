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
    const taskEnd = task.ts + (task.dur ?? 0);

    // Find actual JS functions running inside this task
    const childFunctions = trace.traceEvents
      .filter(e =>
        e.tid === trace.mainThreadId &&
        e.ts >= task.ts &&
        (e.ts + (e.dur ?? 0)) <= taskEnd &&
        (e.name === 'FunctionCall' || e.name === 'EvaluateScript' || e.name === 'v8.compile') &&
        e !== task
      )
      .map(e => {
        const data = e.args?.['data'] as Record<string, unknown> | undefined;
        return {
          functionName: (data?.['functionName'] as string) || e.name,
          scriptUrl: data?.['url'] as string | undefined,
          lineNumber: data?.['lineNumber'] as number | undefined,
          durMs: (e.dur ?? 0) / 1000,
        };
      })
      .filter(f => f.durMs > 5)
      .sort((a, b) => b.durMs - a.durMs)
      .slice(0, 5);

    const topFunction = childFunctions[0];
    const displayName = topFunction?.functionName && topFunction.functionName !== 'EvaluateScript'
      ? topFunction.functionName
      : (childFunctions.find(f => f.scriptUrl)?.scriptUrl?.split('/').pop() ?? task.name);

    const severity: Severity = durMs > 200 ? 'critical' : durMs > 100 ? 'warning' : 'info';
    const relativeTime = ((task.ts - trace.navigationStart) / 1000 / 1000).toFixed(1);

    let detail = `A ${durMs.toFixed(0)}ms task blocked the main thread at ${relativeTime}s after page load.`;
    if (childFunctions.length > 0) {
      detail += '\n\nBreakdown of work inside this task:';
      for (const fn of childFunctions) {
        const fileName = fn.scriptUrl ? fn.scriptUrl.split('/').pop() : '';
        const loc = fileName ? ` (${fileName}${fn.lineNumber ? ':' + fn.lineNumber : ''})` : '';
        detail += `\n  • ${fn.functionName}${loc} — ${fn.durMs.toFixed(0)}ms`;
      }
    }
    detail += '\n\nTasks over 50ms block user interactions like clicks, typing, and scrolling.';

    let fix = '';
    if (childFunctions.some(f => f.functionName === 'EvaluateScript')) {
      const scripts = childFunctions.filter(f => f.functionName === 'EvaluateScript');
      const scriptNames = scripts.map(s => s.scriptUrl?.split('/').pop()).filter(Boolean).join(', ');
      fix = `Scripts being evaluated: ${scriptNames || 'inline scripts'}.\n\n`;
      fix += '1. Add `defer` or `async` to non-critical script tags\n';
      fix += '2. Use dynamic `import()` to code-split and lazy-load modules\n';
      fix += '3. Move non-essential initialization to `requestIdleCallback()`';
    } else if (durMs > 200) {
      fix = `This task takes ${durMs.toFixed(0)}ms — over 4× the 50ms budget.\n\n`;
      fix += '1. Break the work into chunks using `scheduler.yield()` between iterations\n';
      fix += '2. Move pure computation to a Web Worker\n';
      fix += '3. If doing DOM updates, batch them with `requestAnimationFrame()`';
    } else {
      fix = `This task is ${(durMs / 50).toFixed(1)}× the 50ms budget.\n\n`;
      fix += '1. Defer non-critical work with `requestIdleCallback()`\n';
      fix += '2. Split the function into smaller units that yield back to the browser';
    }

    return {
      id: `long-task-${index}`,
      severity,
      title: `Long task: ${displayName} (${durMs.toFixed(0)}ms)`,
      detail,
      metric: 'TBT',
      fix,
      source: topFunction ? {
        functionName: topFunction.functionName,
        scriptUrl: topFunction.scriptUrl,
        lineNumber: topFunction.lineNumber,
      } : undefined,
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
