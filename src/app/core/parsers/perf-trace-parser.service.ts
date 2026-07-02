import { Injectable } from '@angular/core';
import { TraceEvent, ParsedTrace, TraceMetadata } from '../models/trace-event.model';
import { readFileText } from './gzip.util';

@Injectable({ providedIn: 'root' })
export class PerfTraceParserService {
  parse(rawData: unknown): ParsedTrace {
    const traceEvents = this.extractEvents(rawData);
    const mainThreadId = this.findMainThreadId(traceEvents);
    const navigationStart = this.findNavigationStart(traceEvents);
    const metadata = this.extractMetadata(traceEvents);

    return { traceEvents, metadata, mainThreadId, navigationStart };
  }

  async parseFile(file: File): Promise<ParsedTrace> {
    const text = await readFileText(file);
    const json = JSON.parse(text);
    return this.parse(json);
  }

  private extractEvents(rawData: unknown): TraceEvent[] {
    if (Array.isArray(rawData)) {
      return rawData as TraceEvent[];
    }
    if (typeof rawData === 'object' && rawData !== null && 'traceEvents' in rawData) {
      return (rawData as { traceEvents: TraceEvent[] }).traceEvents;
    }
    throw new Error('Unrecognized trace format: expected array or object with traceEvents');
  }

  private findMainThreadId(events: TraceEvent[]): number {
    const mainThreadMeta = events.find(
      e => e.name === 'thread_name' &&
           e.cat === '__metadata' &&
           (e.args as Record<string, unknown>)?.['name'] === 'CrRendererMain'
    );
    if (mainThreadMeta) return mainThreadMeta.tid;

    // Fallback: thread with most devtools.timeline events
    const tidCounts = new Map<number, number>();
    for (const e of events) {
      if (e.cat?.includes('devtools.timeline')) {
        tidCounts.set(e.tid, (tidCounts.get(e.tid) ?? 0) + 1);
      }
    }
    let maxTid = 0;
    let maxCount = 0;
    for (const [tid, count] of tidCounts) {
      if (count > maxCount) {
        maxTid = tid;
        maxCount = count;
      }
    }
    return maxTid;
  }

  private findNavigationStart(events: TraceEvent[]): number {
    const navStart = events.find(
      e => e.name === 'navigationStart' && e.cat === 'blink.user_timing'
    );
    return navStart?.ts ?? events[0]?.ts ?? 0;
  }

  private extractMetadata(events: TraceEvent[]): TraceMetadata {
    let traceStartTime = Infinity;
    let traceEndTime = -Infinity;

    for (const e of events) {
      if (e.ts > 0) {
        if (e.ts < traceStartTime) traceStartTime = e.ts;
        const end = e.ts + (e.dur ?? 0);
        if (end > traceEndTime) traceEndTime = end;
      }
    }

    return {
      traceStartTime: traceStartTime === Infinity ? 0 : traceStartTime,
      traceEndTime: traceEndTime === -Infinity ? 0 : traceEndTime,
    };
  }
}
