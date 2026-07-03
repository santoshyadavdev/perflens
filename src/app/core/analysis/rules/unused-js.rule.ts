import { AnalysisRule, RuleResult } from '../analysis-rule';
import { ParsedTrace } from '../../models/trace-event.model';
import { ActionItem, Severity } from '../../models/action-item.model';

const MIN_SCRIPT_SIZE = 50_000; // 50KB in bytes
const LOW_UTILIZATION_RATIO = 0.5; // ms execution per KB

function isJsUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.endsWith('.js') || pathname.endsWith('.mjs') || pathname.endsWith('.cjs');
  } catch {
    return url.toLowerCase().includes('.js');
  }
}

function getFileName(url: string): string {
  try {
    return new URL(url).pathname.split('/').pop() ?? url;
  } catch {
    return url.split('/').pop() ?? url;
  }
}

export class UnusedJsRule implements AnalysisRule {
  readonly name = 'unused-js';

  analyze(trace: ParsedTrace): RuleResult {
    // Step 1: Build requestId → url map from ResourceSendRequest
    const requestToUrl = new Map<string, string>();
    for (const e of trace.traceEvents) {
      if (e.name === 'ResourceSendRequest') {
        const data = e.args?.['data'] as Record<string, unknown> | undefined;
        const requestId = data?.['requestId'] as string | undefined;
        const url = data?.['url'] as string | undefined;
        if (requestId && url && isJsUrl(url)) {
          requestToUrl.set(requestId, url);
        }
      }
    }

    // Step 2: Build url → size map from ResourceFinish
    const urlToSize = new Map<string, number>();
    for (const e of trace.traceEvents) {
      if (e.name === 'ResourceFinish') {
        const data = e.args?.['data'] as Record<string, unknown> | undefined;
        const requestId = data?.['requestId'] as string | undefined;
        const size = data?.['encodedDataLength'] as number | undefined;
        if (requestId && size !== undefined) {
          const url = requestToUrl.get(requestId);
          if (url) {
            urlToSize.set(url, size);
          }
        }
      }
    }

    // Step 3: Sum execution time per url from EvaluateScript and v8.compile on main thread
    const urlToExecUs = new Map<string, number>();
    for (const e of trace.traceEvents) {
      if (
        e.ph === 'X' &&
        e.tid === trace.mainThreadId &&
        (e.name === 'EvaluateScript' || e.name === 'v8.compile')
      ) {
        const data = e.args?.['data'] as Record<string, unknown> | undefined;
        const url = data?.['url'] as string | undefined;
        if (url) {
          urlToExecUs.set(url, (urlToExecUs.get(url) ?? 0) + (e.dur ?? 0));
        }
      }
    }

    // Step 4: Flag scripts with low utilization ratio
    const actionItems: ActionItem[] = [];
    let index = 0;

    for (const [url, sizeBytes] of urlToSize) {
      if (sizeBytes < MIN_SCRIPT_SIZE) continue;

      const sizeKb = sizeBytes / 1000;
      const execUs = urlToExecUs.get(url) ?? 0;
      const execMs = execUs / 1000;
      const ratio = execMs / sizeKb;

      if (ratio < LOW_UTILIZATION_RATIO) {
        const fileName = getFileName(url);
        const severity: Severity = sizeBytes > 200_000 ? 'warning' : 'info';

        actionItems.push({
          id: `unused-js-${index++}`,
          severity,
          title: `Potentially unused JS: ${fileName} (${sizeKb.toFixed(0)}KB, ${execMs.toFixed(0)}ms exec)`,
          detail:
            `${fileName} is ${sizeKb.toFixed(0)}KB but only executed for ${execMs.toFixed(0)}ms ` +
            `(${ratio.toFixed(2)} ms/KB). Most of this script may never be used during page load.`,
          metric: 'SIZE',
          fix:
            '1. Use the Chrome Coverage tab (DevTools → More tools → Coverage) to identify unused bytes\n' +
            '2. Code-split with dynamic `import()` to load only what is needed on each route\n' +
            '3. Tree-shake your bundle to eliminate dead code (ensure side-effect-free modules)\n' +
            '4. Replace heavy libraries with lighter alternatives (e.g. date-fns instead of moment.js)',
        });
      }
    }

    return { actionItems, metrics: [] };
  }
}
