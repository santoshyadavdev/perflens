import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { RuleEngineService } from '../../core/analysis/rule-engine.service';
import { AnalysisResult } from '../../core/models/analysis-result.model';
import { ParsedHeapSnapshot } from '../../core/models/heap-snapshot.model';
import { ParsedTrace } from '../../core/models/trace-event.model';
import { PerfTraceParserService } from '../../core/parsers/perf-trace-parser.service';
import { HeapSnapshotParserService } from '../../core/services/heap-snapshot-parser.service';
import { TraceStoreService } from '../../core/services/trace-store.service';
import { ActionItemsComponent } from './action-items.component';
import { DetachedDomListComponent } from './detached-dom-list.component';
import { FlamegraphComponent } from './flamegraph.component';
import { HeapBreakdownComponent } from './heap-breakdown.component';
import { HeapTreemapComponent } from './heap-treemap.component';
import { NetworkWaterfallComponent } from './network-waterfall.component';
import { ScoreCardsComponent } from './score-cards.component';
import { TabDef, TabPanelComponent } from './tab-panel.component';
import { TimelineComponent } from './timeline.component';

const EMPTY_PARSED_TRACE: ParsedTrace = {
  traceEvents: [],
  metadata: {
    traceStartTime: 0,
    traceEndTime: 0,
  },
  mainThreadId: 0,
  navigationStart: 0,
};

@Component({
  selector: 'app-dashboard',
  imports: [
    ScoreCardsComponent,
    ActionItemsComponent,
    TabPanelComponent,
    FlamegraphComponent,
    TimelineComponent,
    NetworkWaterfallComponent,
    HeapTreemapComponent,
    HeapBreakdownComponent,
    DetachedDomListComponent,
  ],
  template: `
    <div class="min-h-screen">
      <nav class="bg-[#161b26] px-5 py-3 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span class="text-emerald-400 font-bold text-lg cursor-pointer">⚡ PerfLens</span>
          @if (result(); as r) {
            <span class="text-gray-500 text-sm">{{ r.fileName }}</span>
          }
        </div>
        <div class="flex items-center gap-4 text-sm text-gray-400">
          <button class="hover:text-white transition-colors" disabled>🤖 AI Dive</button>
          <button class="hover:text-white transition-colors" disabled>Share</button>
          <button class="hover:text-white transition-colors" disabled>Export</button>
        </div>
      </nav>

      @if (result(); as r) {
        <div class="p-5 space-y-5">
          <app-score-cards [metrics]="r.metrics" />

          <app-tab-panel
            [tabs]="dashboardTabs()"
            [activeTab]="activeTab()"
            (tabChange)="setActiveTab($event)"
          />

          <div
            id="tab-panel-action-items"
            role="tabpanel"
            aria-labelledby="tab-action-items"
            [hidden]="activeTab() !== 'action-items'"
          >
            @if (activeTab() === 'action-items') {
              <app-action-items [items]="r.actionItems" />
            }
          </div>

          <div
            id="tab-panel-flamegraph"
            role="tabpanel"
            aria-labelledby="tab-flamegraph"
            [hidden]="activeTab() !== 'flamegraph'"
          >
            @if (activeTab() === 'flamegraph') {
              <app-flamegraph [trace]="r.parsedTrace" />
            }
          </div>

          <div
            id="tab-panel-timeline"
            role="tabpanel"
            aria-labelledby="tab-timeline"
            [hidden]="activeTab() !== 'timeline'"
          >
            @if (activeTab() === 'timeline') {
              <app-timeline [trace]="r.parsedTrace" />
            }
          </div>

          <div
            id="tab-panel-network"
            role="tabpanel"
            aria-labelledby="tab-network"
            [hidden]="activeTab() !== 'network'"
          >
            @if (activeTab() === 'network') {
              <app-network-waterfall [trace]="r.parsedTrace" />
            }
          </div>

          <div
            id="tab-panel-memory"
            role="tabpanel"
            aria-labelledby="tab-memory"
            [hidden]="activeTab() !== 'memory'"
          >
            @if (activeTab() === 'memory') {
              @if (heapParser.status() === 'parsing') {
                <div class="flex flex-col items-center justify-center py-12">
                  <div class="text-lg text-gray-300 mb-2">{{ heapParser.progressPhase() }}</div>
                  <div class="w-64 bg-gray-700 rounded-full h-3">
                    <div
                      class="bg-blue-500 h-3 rounded-full transition-all"
                      [style.width.%]="heapParser.progress()"
                    ></div>
                  </div>
                  <div class="text-sm text-gray-400 mt-2">{{ heapParser.progress() }}%</div>
                </div>
              } @else if (heapParser.status() === 'error') {
                <div class="text-red-400 py-4">{{ heapParser.error() }}</div>
              } @else if (heapSnapshot()) {
                <div class="space-y-6">
                  <h3 class="text-lg font-semibold text-gray-200">Retained Size Treemap</h3>
                  <app-heap-treemap [treemapData]="heapSnapshot()!.treemapRoot" />

                  <h3 class="text-lg font-semibold text-gray-200">Object Breakdown</h3>
                  <app-heap-breakdown
                    [summaries]="heapSnapshot()!.constructorSummaries"
                    [totalSize]="heapSnapshot()!.graphData.totalSize"
                  />

                  <h3 class="text-lg font-semibold text-gray-200">Detached DOM Nodes</h3>
                  <app-detached-dom-list [nodes]="heapSnapshot()!.detachedDOMNodes" />
                </div>
              }
            }
          </div>

          <div
            id="tab-panel-v8-internals"
            role="tabpanel"
            aria-labelledby="tab-v8-internals"
            hidden
          ></div>
        </div>
      } @else if (error()) {
        <div class="flex items-center justify-center min-h-[60vh]">
          <div class="text-red-400 bg-red-500/10 px-6 py-4 rounded-lg">{{ error() }}</div>
        </div>
      } @else {
        <div class="flex items-center justify-center min-h-[60vh]">
          <div class="text-gray-400 animate-pulse">Analyzing trace...</div>
        </div>
      }
    </div>
  `,
})
export class DashboardComponent {
  private readonly parser = inject(PerfTraceParserService);
  private readonly ruleEngine = inject(RuleEngineService);
  private readonly router = inject(Router);
  private readonly traceStore = inject(TraceStoreService);
  readonly heapParser = inject(HeapSnapshotParserService);

  private readonly fileFormat = signal<'perf-trace' | 'heap-snapshot' | null>(null);

  readonly dashboardTabs = computed<TabDef[]>(() => {
    const format = this.fileFormat();
    const isHeapSnapshot = format === 'heap-snapshot';
    const isPerfTrace = format === 'perf-trace';

    return [
      { id: 'action-items', label: 'Action Items', icon: '🎯', disabled: !isHeapSnapshot && !isPerfTrace },
      { id: 'flamegraph', label: 'Flamegraph', icon: '🔥', disabled: !isPerfTrace },
      { id: 'timeline', label: 'Timeline', icon: '📊', disabled: !isPerfTrace },
      { id: 'network', label: 'Network', icon: '🌊', disabled: !isPerfTrace },
      { id: 'memory', label: 'Memory', icon: '🧠', disabled: !isHeapSnapshot },
      { id: 'v8-internals', label: 'V8 Internals', icon: '⚙️', disabled: true },
    ];
  });

  result = signal<AnalysisResult | null>(null);
  error = signal<string | null>(null);
  activeTab = signal('action-items');
  heapSnapshot = signal<ParsedHeapSnapshot | null>(null);

  constructor() {
    if (!this.traceStore.hasFiles()) {
      this.router.navigate(['/']);
      return;
    }

    const files = this.traceStore.files();
    const file = files[0];
    if (!file) {
      this.router.navigate(['/']);
      return;
    }

    if (file.format === 'perf-trace') {
      this.fileFormat.set('perf-trace');
      this.activeTab.set('action-items');

      try {
        const parsed = this.parser.parse(file.content);
        const analysis = this.ruleEngine.analyze(parsed, file.name, file.size);
        this.result.set(analysis);
      } catch (e) {
        console.error('Failed to analyze trace:', e);
        this.error.set('Failed to analyze trace. The file may be corrupted or in an unsupported format.');
      }
      return;
    }

    if (file.format === 'heap-snapshot') {
      this.fileFormat.set('heap-snapshot');
      this.activeTab.set('memory');

      // Set a placeholder result immediately so the tab panel (and the memory
      // tab's parsing/progress UI) render while the snapshot parses in the background.
      this.result.set({
        fileName: file.name,
        fileSize: file.size,
        analyzedAt: new Date(),
        metrics: [],
        actionItems: [],
        parsedTrace: EMPTY_PARSED_TRACE,
      });

      effect(() => {
        const snapshot = this.heapParser.result();
        if (!snapshot) {
          return;
        }

        this.heapSnapshot.set(snapshot);
        const { actionItems, metrics } = this.ruleEngine.analyzeHeapSnapshot(snapshot);

        this.result.set({
          fileName: file.name,
          fileSize: file.size,
          analyzedAt: new Date(),
          metrics,
          actionItems,
          parsedTrace: EMPTY_PARSED_TRACE,
          heapResult: { snapshot },
        });
      });

      this.heapParser.parse(file.content as File).catch((e) => {
        console.error('Failed to parse heap snapshot:', e);
        this.error.set('Failed to parse heap snapshot. The file may be corrupted or in an unsupported format.');
      });
      return;
    }

    this.error.set(`${file.format} format is not yet supported. Only performance traces (.json) and heap snapshots (.heapsnapshot) are supported.`);
  }

  setActiveTab(tabId: string): void {
    this.activeTab.set(tabId);
  }
}
