import { Component, computed, input } from '@angular/core';
import { ParsedTrace } from '../../core/models/trace-event.model';

export type EventCategory = 'scripting' | 'layout' | 'painting' | 'rendering' | 'system' | 'idle';

export interface TimelineEntry {
  name: string;
  category: EventCategory;
  startMs: number;
  durationMs: number;
}

export interface CategoryBreakdown {
  scripting: number;
  layout: number;
  painting: number;
  rendering: number;
  system: number;
  idle: number;
}

const EVENT_CATEGORIES: Record<string, EventCategory> = {
  EvaluateScript: 'scripting',
  FunctionCall: 'scripting',
  'v8.compile': 'scripting',
  GCEvent: 'scripting',
  Layout: 'layout',
  UpdateLayoutTree: 'layout',
  RecalculateStyles: 'rendering',
  Paint: 'painting',
  PaintImage: 'painting',
  CompositeLayers: 'painting',
  PrePaint: 'painting',
  RunTask: 'system',
};

const CATEGORY_COLORS: Record<EventCategory, string> = {
  scripting: '#f59e0b',
  layout: '#8b5cf6',
  painting: '#22c55e',
  rendering: '#3b82f6',
  system: '#6b7280',
  idle: '#1f2937',
};

const MAX_ENTRIES = 2000;

@Component({
  selector: 'app-timeline',
  template: `
    <div class="bg-[#1a1f2e] rounded-lg p-4 space-y-4">
      <h3 class="text-gray-300 text-sm font-semibold">Main Thread Activity</h3>

      <!-- Breakdown bar -->
      <div class="flex rounded-full overflow-hidden h-6">
        @for (cat of breakdownEntries(); track cat.category) {
          <div [style.width.%]="cat.percentage" [style.background-color]="cat.color"
               class="flex items-center justify-center text-xs text-white font-mono"
               [title]="cat.category + ': ' + cat.durationMs.toFixed(0) + 'ms'">
            @if (cat.percentage > 8) { {{ cat.percentage.toFixed(0) }}% }
          </div>
        }
      </div>

      <!-- Legend -->
      <div class="flex flex-wrap gap-4 text-xs">
        @for (cat of breakdownEntries(); track cat.category) {
          <div class="flex items-center gap-1.5">
            <div class="w-3 h-3 rounded" [style.background-color]="cat.color"></div>
            <span class="text-gray-400">{{ cat.category }}: {{ cat.durationMs.toFixed(0) }}ms</span>
          </div>
        }
      </div>

      <!-- Timeline -->
      <div class="relative h-12 bg-[#0f1420] rounded overflow-hidden">
        @for (entry of visibleEntries(); track $index) {
          <div class="absolute h-full opacity-80 hover:opacity-100 transition-opacity"
               [style.left.%]="entry.leftPct" [style.width.%]="entry.widthPct"
               [style.background-color]="entry.color"
               [title]="entry.name + ' (' + entry.durationMs.toFixed(1) + 'ms)'"></div>
        }
      </div>

      <!-- Time axis -->
      <div class="flex justify-between text-xs text-gray-600 font-mono">
        <span>0ms</span>
        <span>{{ totalDurationMs().toFixed(0) }}ms</span>
      </div>
    </div>
  `,
})
export class TimelineComponent {
  trace = input.required<ParsedTrace>();

  totalDurationMs = computed(() => {
    const t = this.trace();
    return (t.metadata.traceEndTime - t.metadata.traceStartTime) / 1000;
  });

  private timelineEntries = computed(() => this.buildTimeline(this.trace()));

  breakdownEntries = computed(() => {
    const breakdown = this.computeBreakdown(this.trace());
    const total = Object.values(breakdown).reduce((a, b) => a + b, 0) || 1;
    return (Object.keys(breakdown) as EventCategory[])
      .map(cat => ({
        category: cat,
        durationMs: breakdown[cat],
        percentage: (breakdown[cat] / total) * 100,
        color: CATEGORY_COLORS[cat],
      }))
      .filter(e => e.durationMs > 0)
      .sort((a, b) => b.durationMs - a.durationMs);
  });

  visibleEntries = computed(() => {
    const totalMs = this.totalDurationMs() || 1;
    const entries = this.timelineEntries();
    const sampled =
      entries.length <= MAX_ENTRIES
        ? entries
        : entries.filter((_, i) => i % Math.ceil(entries.length / MAX_ENTRIES) === 0);

    return sampled
      .map(entry => ({
        ...entry,
        leftPct: (entry.startMs / totalMs) * 100,
        widthPct: Math.max((entry.durationMs / totalMs) * 100, 0.05),
        color: CATEGORY_COLORS[entry.category],
      }));
  });

  buildTimeline(trace: ParsedTrace): TimelineEntry[] {
    const startUs = trace.metadata.traceStartTime;
    return trace.traceEvents
      .filter(
        e =>
          e.ph === 'X' &&
          e.tid === trace.mainThreadId &&
          (e.dur ?? 0) > 500,
      )
      .map(e => ({
        name: e.name,
        category: EVENT_CATEGORIES[e.name] ?? 'system',
        startMs: (e.ts - startUs) / 1000,
        durationMs: (e.dur ?? 0) / 1000,
      }));
  }

  computeBreakdown(trace: ParsedTrace): CategoryBreakdown {
    const breakdown: CategoryBreakdown = {
      scripting: 0,
      layout: 0,
      painting: 0,
      rendering: 0,
      system: 0,
      idle: 0,
    };
    for (const e of trace.traceEvents) {
      if (e.ph === 'X' && e.tid === trace.mainThreadId && (e.dur ?? 0) > 0) {
        const cat = EVENT_CATEGORIES[e.name] ?? 'system';
        breakdown[cat] += (e.dur ?? 0) / 1000;
      }
    }
    return breakdown;
  }
}
