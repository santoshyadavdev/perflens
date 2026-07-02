import { DecimalPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { ParsedTrace } from '../../core/models/trace-event.model';

export interface WaterfallEntry {
  url: string;
  shortName: string;
  mimeType: string;
  statusCode: number;
  startMs: number;
  ttfbMs: number;
  downloadMs: number;
  totalMs: number;
  sizeBytes: number;
}

export function getMimeColor(mimeType: string): string {
  if (mimeType.includes('javascript') || mimeType.includes('ecmascript')) return '#f59e0b';
  if (mimeType.includes('css')) return '#8b5cf6';
  if (mimeType.includes('image')) return '#22c55e';
  if (mimeType.includes('font')) return '#06b6d4';
  if (mimeType.includes('html')) return '#ef4444';
  return '#6b7280';
}

export function getMimeLabel(mimeType: string): string {
  if (mimeType.includes('javascript') || mimeType.includes('ecmascript')) return 'JS';
  if (mimeType.includes('css')) return 'CSS';
  if (mimeType.includes('image')) return 'Img';
  if (mimeType.includes('font')) return 'Font';
  if (mimeType.includes('html')) return 'HTML';
  return 'Other';
}

interface ResourceData {
  requestId?: string;
  url?: string;
  mimeType?: string;
  statusCode?: number;
  encodedDataLength?: number;
}

export function buildWaterfall(trace: ParsedTrace): WaterfallEntry[] {
  const navStart = trace.navigationStart;

  const starts = new Map<string, { url: string; startTs: number }>();
  const responses = new Map<string, { mimeType: string; statusCode: number; responseTs: number }>();
  const finishes = new Map<string, { endTs: number; sizeBytes: number }>();

  for (const event of trace.traceEvents) {
    const data = (event.args?.['data'] ?? {}) as ResourceData;
    const requestId = data.requestId;
    if (!requestId) continue;

    if (event.name === 'ResourceSendRequest' && data.url) {
      if (!starts.has(requestId)) {
        starts.set(requestId, { url: data.url, startTs: event.ts });
      }
    } else if (event.name === 'ResourceReceiveResponse') {
      responses.set(requestId, {
        mimeType: data.mimeType ?? '',
        statusCode: data.statusCode ?? 0,
        responseTs: event.ts,
      });
    } else if (event.name === 'ResourceFinish') {
      finishes.set(requestId, {
        endTs: event.ts,
        sizeBytes: data.encodedDataLength ?? 0,
      });
    }
  }

  const entries: WaterfallEntry[] = [];

  for (const [id, start] of starts) {
    const response = responses.get(id);
    const finish = finishes.get(id);
    if (!response || !finish) continue;

    const startMs = (start.startTs - navStart) / 1000;
    const ttfbMs = Math.max(0, (response.responseTs - start.startTs) / 1000);
    const downloadMs = Math.max(0, (finish.endTs - response.responseTs) / 1000);
    const totalMs = ttfbMs + downloadMs;

    const urlObj = (() => { try { return new URL(start.url); } catch { return null; } })();
    const pathParts = urlObj?.pathname.split('/').filter(Boolean) ?? [];
    const shortName = pathParts.at(-1) || urlObj?.hostname || start.url;

    entries.push({
      url: start.url,
      shortName,
      mimeType: response.mimeType,
      statusCode: response.statusCode,
      startMs,
      ttfbMs,
      downloadMs,
      totalMs,
      sizeBytes: finish.sizeBytes,
    });
  }

  entries.sort((a, b) => a.startMs - b.startMs);
  return entries;
}

@Component({
  selector: 'app-network-waterfall',
  imports: [DecimalPipe],
  template: `
    <div class="bg-[#1a1f2e] rounded-lg p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-gray-300 text-sm font-semibold">Network Waterfall</h3>
        <div class="flex gap-4 text-xs text-gray-400">
          <span>{{ totalRequests() }} requests</span>
          <span>{{ formatSize(totalSize()) }} transferred</span>
        </div>
      </div>

      @if (entries().length === 0) {
        <div class="text-center text-gray-500 py-8">No network requests found in trace</div>
      } @else {
        <!-- Header row -->
        <div class="grid text-xs text-gray-500 mb-1 px-2 gap-2" style="grid-template-columns: 1.5rem 1fr 3.5rem 3.5rem 4rem 1fr">
          <span>#</span>
          <span>Resource</span>
          <span>Type</span>
          <span>Size</span>
          <span>Time</span>
          <span class="relative">
            Waterfall
            <span class="absolute right-0 text-gray-600">{{ maxTime() | number:'1.0-0' }}ms</span>
          </span>
        </div>

        <!-- Rows -->
        @for (entry of entries(); track entry.url; let i = $index) {
          <div class="grid items-center text-xs gap-2 px-2 py-0.5 rounded hover:bg-white/5"
               style="grid-template-columns: 1.5rem 1fr 3.5rem 3.5rem 4rem 1fr">
            <span class="text-gray-600">{{ i + 1 }}</span>
            <span class="text-gray-300 truncate" [title]="entry.url">{{ entry.shortName }}</span>
            <span class="text-xs px-1 rounded font-mono"
                  [style.background]="mimeColor(entry.mimeType) + '33'"
                  [style.color]="mimeColor(entry.mimeType)">
              {{ mimeLabel(entry.mimeType) }}
            </span>
            <span class="text-gray-400">{{ formatSize(entry.sizeBytes) }}</span>
            <span class="text-gray-400">{{ entry.totalMs | number:'1.0-1' }}ms</span>
            <!-- Waterfall bar -->
            <div class="relative h-3 rounded overflow-hidden bg-white/5">
              <div class="absolute h-full rounded-sm"
                   [style.left.%]="(entry.startMs / maxTime()) * 100"
                   [style.width.%]="(entry.ttfbMs / maxTime()) * 100"
                   [style.background]="mimeColor(entry.mimeType) + '99'">
              </div>
              <div class="absolute h-full rounded-sm"
                   [style.left.%]="((entry.startMs + entry.ttfbMs) / maxTime()) * 100"
                   [style.width.%]="(entry.downloadMs / maxTime()) * 100"
                   [style.background]="mimeColor(entry.mimeType)">
              </div>
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class NetworkWaterfallComponent {
  trace = input.required<ParsedTrace>();

  entries = computed(() => buildWaterfall(this.trace()));
  totalRequests = computed(() => this.entries().length);
  totalSize = computed(() => this.entries().reduce((sum, e) => sum + e.sizeBytes, 0));
  maxTime = computed(() => {
    const es = this.entries();
    if (es.length === 0) return 1;
    return Math.max(...es.map(e => e.startMs + e.totalMs), 1);
  });

  mimeColor = getMimeColor;
  mimeLabel = getMimeLabel;

  formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
