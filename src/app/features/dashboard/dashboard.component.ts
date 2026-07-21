import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { RuleEngineService } from '../../core/analysis/rule-engine.service';
import { AnalysisResult } from '../../core/models/analysis-result.model';
import { ParsedHeapSnapshot } from '../../core/models/heap-snapshot.model';
import { ParsedTrace } from '../../core/models/trace-event.model';
import { PerfTraceParserService } from '../../core/parsers/perf-trace-parser.service';
import { HeapSnapshotParserService } from '../../core/services/heap-snapshot-parser.service';
import { TraceStoreService } from '../../core/services/trace-store.service';
import { CpuProfileParserService } from '../../core/services/cpu-profile-parser.service';
import { ParsedCpuProfile, CpuProfileComparison } from '../../core/models/cpu-profile.model';
import { buildCallTree, compareCpuProfiles } from '../../core/parsers/cpu-profile-parser';
import type { CpuProfileRaw } from '../../core/models/cpu-profile.model';
import { ActionItemsComponent } from './action-items.component';
import { DetachedDomListComponent } from './detached-dom-list.component';
import { FlamegraphComponent } from './flamegraph.component';
import { HeapBreakdownComponent } from './heap-breakdown.component';
import { HeapTreemapComponent } from './heap-treemap.component';
import { NetworkWaterfallComponent } from './network-waterfall.component';
import { ScoreCardsComponent } from './score-cards.component';
import { TabDef, TabPanelComponent } from './tab-panel.component';
import { TimelineComponent } from './timeline.component';
import { CpuFlamechartComponent } from './cpu-flamechart.component';
import { CpuHotFunctionsComponent } from './cpu-hot-functions.component';
import { CpuDeoptListComponent } from './cpu-deopt-list.component';
import { ExportDialogComponent } from './export-dialog.component';
import { SessionHistoryService } from '../../core/services/session-history.service';
import { TraceComparisonService } from '../../core/services/trace-comparison.service';
import { SavedSession } from '../../core/models/session-history.model';
import { TraceComparison } from '../../core/models/trace-comparison.model';
import { ShareDialogComponent } from './share-dialog.component';
import { ComparePickerComponent } from './compare-picker.component';
import { TraceComparisonComponent } from './trace-comparison.component';
import { ToastComponent } from '../../shared/components/toast.component';

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
    CpuFlamechartComponent,
    CpuHotFunctionsComponent,
    CpuDeoptListComponent,
    ExportDialogComponent,
    ShareDialogComponent,
    ComparePickerComponent,
    TraceComparisonComponent,
    ToastComponent,
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
          @if (comparableSessions().length > 0) {
            <button class="hover:text-white transition-colors" (click)="showComparePicker.set(true)">⚖️ Compare</button>
          }
          <button class="hover:text-white transition-colors" disabled>🤖 AI Dive</button>
          <button class="hover:text-white transition-colors" (click)="showShareDialog.set(true)">Share</button>
          <button class="hover:text-white transition-colors" (click)="showExportDialog.set(true)">Export</button>
        </div>
      </nav>

      @if (result(); as r) {
        <div class="p-5 space-y-5">
          <div id="section-score-cards">
            <app-score-cards [metrics]="r.metrics" [metricDiffs]="comparison()?.metricDiffs ?? []" />
          </div>

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
            id="tab-panel-cpu-profile"
            role="tabpanel"
            aria-labelledby="tab-cpu-profile"
            [hidden]="activeTab() !== 'cpu-profile'"
          >
            @if (activeTab() === 'cpu-profile') {
              @if (cpuParser.status() === 'parsing') {
                <div class="flex flex-col items-center justify-center py-12">
                  <div class="text-lg text-gray-300 mb-2">{{ cpuParser.progressPhase() }}</div>
                  <div class="w-64 bg-gray-700 rounded-full h-3">
                    <div
                      class="bg-emerald-500 h-3 rounded-full transition-all"
                      [style.width.%]="cpuParser.progress()"
                    ></div>
                  </div>
                  <div class="text-sm text-gray-400 mt-2">{{ cpuParser.progress() }}%</div>
                </div>
              } @else if (cpuParser.status() === 'error') {
                <div class="text-red-400 py-4">{{ cpuParser.error() }}</div>
              } @else if (cpuProfile()) {
                <div class="space-y-6">
                  <h3 class="text-lg font-semibold text-gray-200">Flame Chart</h3>
                  <app-cpu-flamechart [profile]="cpuProfile()!" />

                  <h3 class="text-lg font-semibold text-gray-200">Hot Functions</h3>
                  <app-cpu-hot-functions
                    [entries]="cpuProfile()!.flatProfile"
                    [comparison]="cpuComparison() ?? undefined"
                  />
                </div>
              }
            }
          </div>

          <div
            id="tab-panel-v8-internals"
            role="tabpanel"
            aria-labelledby="tab-v8-internals"
            [hidden]="activeTab() !== 'v8-internals'"
          >
            @if (activeTab() === 'v8-internals' && cpuProfile()) {
              <div class="space-y-6">
                <h3 class="text-lg font-semibold text-gray-200">V8 Deoptimizations</h3>
                <app-cpu-deopt-list [deoptEvents]="cpuProfile()!.deoptEvents" />
              </div>
            }
          </div>

          <div
            id="tab-panel-comparison"
            role="tabpanel"
            aria-labelledby="tab-comparison"
            [hidden]="activeTab() !== 'comparison'"
          >
            @if (activeTab() === 'comparison' && comparison()) {
              <app-trace-comparison [comparison]="comparison()!" />
            }
          </div>
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

      @if (showExportDialog()) {
        <app-export-dialog
          [result]="result()!"
          [fileFormat]="fileFormat()!"
          (close)="showExportDialog.set(false)"
        />
      }

      @if (showShareDialog()) {
        <app-share-dialog
          [result]="result()!"
          [fileFormat]="fileFormat()!"
          (close)="showShareDialog.set(false)"
        />
      }

      @if (showComparePicker()) {
        <app-compare-picker
          [sessions]="comparableSessions()"
          (sessionSelect)="onCompareSelect($event)"
          (close)="showComparePicker.set(false)"
        />
      }

      <app-toast />
    </div>
  `,
})
export class DashboardComponent {
  private readonly parser = inject(PerfTraceParserService);
  private readonly ruleEngine = inject(RuleEngineService);
  private readonly router = inject(Router);
  private readonly traceStore = inject(TraceStoreService);
  readonly heapParser = inject(HeapSnapshotParserService);
  readonly cpuParser = inject(CpuProfileParserService);

  private readonly historyService = inject(SessionHistoryService);
  private readonly comparisonService = inject(TraceComparisonService);

  readonly fileFormat = signal<'perf-trace' | 'heap-snapshot' | 'cpu-profile' | null>(null);
  showExportDialog = signal(false);
  showShareDialog = signal(false);
  showComparePicker = signal(false);
  comparison = signal<TraceComparison | null>(null);
  comparableSessions = signal<SavedSession[]>([]);

  readonly dashboardTabs = computed<TabDef[]>(() => {
    const format = this.fileFormat();
    const isHeapSnapshot = format === 'heap-snapshot';
    const isPerfTrace = format === 'perf-trace';
    const isCpuProfile = format === 'cpu-profile';
    const hasDeoptEvents = (this.cpuProfile()?.deoptEvents.length ?? 0) > 0;

    return [
      { id: 'action-items', label: 'Action Items', icon: '🎯', disabled: !isHeapSnapshot && !isPerfTrace && !isCpuProfile },
      { id: 'flamegraph', label: 'Flamegraph', icon: '🔥', disabled: !isPerfTrace },
      { id: 'timeline', label: 'Timeline', icon: '📊', disabled: !isPerfTrace },
      { id: 'network', label: 'Network', icon: '🌊', disabled: !isPerfTrace },
      { id: 'memory', label: 'Memory', icon: '🧠', disabled: !isHeapSnapshot },
      { id: 'cpu-profile', label: 'CPU Profile', icon: '⚡', disabled: !isCpuProfile },
      { id: 'v8-internals', label: 'V8 Internals', icon: '⚙️', disabled: !isCpuProfile || !hasDeoptEvents },
      { id: 'comparison', label: 'Comparison', icon: '⚖️', disabled: !this.comparison() },
    ];
  });

  result = signal<AnalysisResult | null>(null);
  error = signal<string | null>(null);
  activeTab = signal('action-items');
  heapSnapshot = signal<ParsedHeapSnapshot | null>(null);
  cpuProfile = signal<ParsedCpuProfile | null>(null);
  cpuComparison = signal<CpuProfileComparison | null>(null);

  constructor() {
    // Handle restored session from history
    const restored = this.traceStore.restoredSession();
    if (restored) {
      this.fileFormat.set(restored.format as 'perf-trace' | 'heap-snapshot' | 'cpu-profile');
      this.activeTab.set('action-items');
      this.result.set({
        fileName: restored.fileName,
        fileSize: restored.fileSize,
        analyzedAt: new Date(restored.analyzedAt),
        metrics: restored.metrics,
        actionItems: restored.actionItems,
        parsedTrace: EMPTY_PARSED_TRACE,
      });
      this.loadComparableSessions(restored.format);
      return;
    }

    // Handle shared payload via navigation state
    const nav = this.router.getCurrentNavigation();
    const sharedPayload = nav?.extras?.state?.['sharedPayload'];
    if (sharedPayload) {
      this.fileFormat.set(sharedPayload.fmt as 'perf-trace' | 'heap-snapshot' | 'cpu-profile');
      this.activeTab.set('action-items');
      this.result.set({
        fileName: sharedPayload.fn,
        fileSize: sharedPayload.fs,
        analyzedAt: new Date(sharedPayload.at),
        metrics: sharedPayload.m,
        actionItems: sharedPayload.ai,
        parsedTrace: EMPTY_PARSED_TRACE,
      });
      return;
    }

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
        this.autoSave(analysis, 'perf-trace');
        this.loadComparableSessions('perf-trace');
      } catch (e) {
        console.error('Failed to analyze trace:', e);
        this.error.set('Failed to analyze trace. The file may be corrupted or in an unsupported format.');
      }
      return;
    }

    if (file.format === 'heap-snapshot') {
      this.fileFormat.set('heap-snapshot');
      this.activeTab.set('memory');

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
        this.autoSave({
          fileName: file.name,
          fileSize: file.size,
          analyzedAt: new Date(),
          metrics,
          actionItems,
          parsedTrace: EMPTY_PARSED_TRACE,
          heapResult: { snapshot },
        }, 'heap-snapshot');
        this.loadComparableSessions('heap-snapshot');
      });

      this.heapParser.parse(file.content as File).catch((e) => {
        console.error('Failed to parse heap snapshot:', e);
        this.error.set('Failed to parse heap snapshot. The file may be corrupted or in an unsupported format.');
      });
      return;
    }

    if (file.format === 'cpu-profile') {
      this.fileFormat.set('cpu-profile');
      this.activeTab.set('cpu-profile');

      this.result.set({
        fileName: file.name,
        fileSize: file.size,
        analyzedAt: new Date(),
        metrics: [],
        actionItems: [],
        parsedTrace: EMPTY_PARSED_TRACE,
      });

      effect(() => {
        const profile = this.cpuParser.result();
        if (!profile) return;

        this.cpuProfile.set(profile);

        let comparison: CpuProfileComparison | undefined;
        if (files.length === 2 && files[1].format === 'cpu-profile') {
          const baselineFile = files[1].content as File;
          const reader = new FileReader();
          reader.onload = () => {
            try {
              const raw = JSON.parse(reader.result as string) as CpuProfileRaw;
              const baseline = buildCallTree(raw, baselineFile.name);
              comparison = compareCpuProfiles(baseline, profile);
              this.cpuComparison.set(comparison);
            } catch (e) {
              console.error('Failed to parse baseline CPU profile:', e);
            }
          };
          reader.readAsText(baselineFile);
        }

        const { actionItems, metrics } = this.ruleEngine.analyzeCpuProfile(profile, comparison);

        this.result.set({
          fileName: file.name,
          fileSize: file.size,
          analyzedAt: new Date(),
          metrics,
          actionItems,
          parsedTrace: EMPTY_PARSED_TRACE,
          cpuResult: { profile, comparison },
        });
        this.autoSave({
          fileName: file.name,
          fileSize: file.size,
          analyzedAt: new Date(),
          metrics,
          actionItems,
          parsedTrace: EMPTY_PARSED_TRACE,
          cpuResult: { profile, comparison },
        }, 'cpu-profile');
        this.loadComparableSessions('cpu-profile');
      });

      this.cpuParser.parse(file.content as File).catch((e) => {
        console.error('Failed to parse CPU profile:', e);
        this.error.set('Failed to parse CPU profile. The file may be corrupted or in an unsupported format.');
      });
      return;
    }

    this.error.set(`${file.format} format is not yet supported. Only performance traces (.json), heap snapshots (.heapsnapshot), and CPU profiles (.cpuprofile) are supported.`);
  }

  setActiveTab(tabId: string): void {
    this.activeTab.set(tabId);
  }

  private async autoSave(result: AnalysisResult, format: 'perf-trace' | 'heap-snapshot' | 'cpu-profile'): Promise<void> {
    try {
      await this.historyService.save(result, format);
    } catch {
      // IndexedDB unavailable — silently continue
    }
  }

  private async loadComparableSessions(format: string): Promise<void> {
    try {
      const sessions = await this.historyService.list();
      this.comparableSessions.set(
        sessions.filter(s => s.format === format && s.fileName !== this.result()?.fileName),
      );
    } catch {
      this.comparableSessions.set([]);
    }
  }

  onCompareSelect(session: SavedSession): void {
    this.showComparePicker.set(false);
    const current = this.result();
    if (!current) return;

    const baseline: AnalysisResult = {
      fileName: session.fileName,
      fileSize: session.fileSize,
      analyzedAt: new Date(session.analyzedAt),
      metrics: session.metrics,
      actionItems: session.actionItems,
      parsedTrace: EMPTY_PARSED_TRACE,
    };

    const comp = this.comparisonService.compare(current, baseline);
    this.comparison.set(comp);
    this.activeTab.set('comparison');
  }
}
