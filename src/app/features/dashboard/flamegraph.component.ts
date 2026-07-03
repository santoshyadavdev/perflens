import { isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  Component,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  OnDestroy,
  PLATFORM_ID,
  viewChild,
} from '@angular/core';
import flamegraph from 'd3-flame-graph';
import { select } from 'd3-selection';
import { ParsedTrace, TraceEvent } from '../../core/models/trace-event.model';

interface FlameNode {
  name: string;
  value: number;
  children: FlameNode[];
}

interface StackEntry {
  node: FlameNode;
  endTs: number;
}

interface TraceEventData {
  functionName?: string;
  url?: string;
}

@Component({
  selector: 'app-flamegraph',
  template: `
    <div class="bg-[#1a1f2e] rounded-lg p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-gray-300 text-sm font-semibold">CPU Flamegraph — Main Thread</h3>
        <div class="flex gap-2 text-xs text-gray-500">
          <span>Click to zoom • Right-click to reset</span>
        </div>
      </div>
      <div #chartContainer class="w-full overflow-x-auto" style="min-height: 300px;"></div>
    </div>
  `,
})
export class FlamegraphComponent implements OnDestroy {
  trace = input.required<ParsedTrace>();
  readonly chartContainer = viewChild<ElementRef<HTMLDivElement>>('chartContainer');

  private readonly platformId = inject(PLATFORM_ID);
  private chart?: ReturnType<typeof flamegraph>;
  private renderVersion = 0;

  constructor() {
    const injector = inject(Injector);
    afterNextRender(() => {
      effect(() => {
        const trace = this.trace();
        const container = this.chartContainer()?.nativeElement;
        if (!container) return;
        this.renderFlamegraph(trace, container);
      }, { injector });
    });
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  public buildHierarchy(trace: ParsedTrace): FlameNode {
    const root: FlameNode = {
      name: 'Main Thread',
      value: 0,
      children: [],
    };
    const stack: StackEntry[] = [];

    const events = trace.traceEvents
      .filter((event) => event.tid === trace.mainThreadId && event.ph === 'X' && (event.dur ?? 0) >= 500)
      .sort((left, right) => left.ts - right.ts || (right.dur ?? 0) - (left.dur ?? 0));

    for (const event of events) {
      const duration = event.dur ?? 0;
      const node: FlameNode = {
        name: this.getNodeName(event),
        value: duration / 1000,
        children: [],
      };

      while (stack.length > 0 && stack[stack.length - 1]!.endTs <= event.ts) {
        stack.pop();
      }

      const parent = stack[stack.length - 1]?.node ?? root;
      parent.children.push(node);
      stack.push({ node, endTs: event.ts + duration });
    }

    root.value = root.children.reduce((total, child) => total + child.value, 0);
    return root;
  }

  private renderFlamegraph(trace: ParsedTrace, container: HTMLDivElement): void {
    const currentVersion = ++this.renderVersion;

    if (!isPlatformBrowser(this.platformId) || this.isTestEnvironment()) {
      return;
    }

    if (currentVersion !== this.renderVersion) return;

    this.chart?.destroy();
    this.chart = undefined;
    container.oncontextmenu = null;
    container.replaceChildren();

    const hierarchy = this.buildHierarchy(trace);
    if (hierarchy.children.length === 0) {
      this.renderEmptyState(container, 'No main-thread activity above 0.5ms to visualize.');
      return;
    }

    try {
      const chart = flamegraph()
        .width(Math.max(container.clientWidth, 800))
        .cellHeight(18)
        .minFrameSize(2)
        .transitionDuration(250)
        .setDetailsHandler(() => undefined);

      select(container).datum(hierarchy).call(chart);
      container.oncontextmenu = (event) => {
        event.preventDefault();
        chart.resetZoom();
      };
      this.chart = chart;
    } catch (error) {
      console.error('Failed to render flamegraph:', error);
      this.renderEmptyState(container, 'Unable to render flamegraph.');
    }
  }

  private getNodeName(event: TraceEvent): string {
    const data = this.getEventData(event);
    const functionName = typeof data.functionName === 'string' && data.functionName.trim().length > 0
      ? data.functionName.trim()
      : event.name;
    const fileName = this.getFileName(data.url);

    return fileName ? `${functionName} (${fileName})` : functionName;
  }

  private getEventData(event: TraceEvent): TraceEventData {
    const data = event.args && typeof event.args === 'object'
      ? (event.args as { data?: unknown }).data
      : undefined;

    return data && typeof data === 'object' ? (data as TraceEventData) : {};
  }

  private getFileName(url: unknown): string | null {
    if (typeof url !== 'string' || url.length === 0) {
      return null;
    }

    const sanitizedUrl = url.split('?')[0]?.split('#')[0] ?? url;
    const segments = sanitizedUrl.split('/').filter(Boolean);
    return segments.at(-1) ?? null;
  }

  private renderEmptyState(container: HTMLDivElement, message: string): void {
    const state = document.createElement('div');
    state.className = 'rounded border border-white/5 bg-black/10 px-4 py-16 text-center text-sm text-gray-500';
    state.textContent = message;
    container.replaceChildren(state);
  }

  private isTestEnvironment(): boolean {
    return typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
  }
}
