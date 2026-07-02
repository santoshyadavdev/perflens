import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { RuleEngineService } from '../../core/analysis/rule-engine.service';
import { AnalysisResult } from '../../core/models/analysis-result.model';
import { PerfTraceParserService } from '../../core/parsers/perf-trace-parser.service';
import { TraceStoreService } from '../../core/services/trace-store.service';
import { ActionItemsComponent } from './action-items.component';
import { FlamegraphComponent } from './flamegraph.component';
import { NetworkWaterfallComponent } from './network-waterfall.component';
import { ScoreCardsComponent } from './score-cards.component';
import { TabDef, TabPanelComponent } from './tab-panel.component';
import { TimelineComponent } from './timeline.component';

@Component({
  selector: 'app-dashboard',
  imports: [
    ScoreCardsComponent,
    ActionItemsComponent,
    TabPanelComponent,
    FlamegraphComponent,
    TimelineComponent,
    NetworkWaterfallComponent,
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
            [tabs]="dashboardTabs"
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
            hidden
          ></div>

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
export class DashboardComponent implements OnInit {
  private readonly parser = inject(PerfTraceParserService);
  private readonly ruleEngine = inject(RuleEngineService);
  private readonly router = inject(Router);
  private readonly traceStore = inject(TraceStoreService);

  readonly dashboardTabs: TabDef[] = [
    { id: 'action-items', label: 'Action Items', icon: '🎯' },
    { id: 'flamegraph', label: 'Flamegraph', icon: '🔥' },
    { id: 'timeline', label: 'Timeline', icon: '📊' },
    { id: 'network', label: 'Network', icon: '🌊' },
    { id: 'memory', label: 'Memory', icon: '🧠', disabled: true },
    { id: 'v8-internals', label: 'V8 Internals', icon: '⚙️', disabled: true },
  ];

  result = signal<AnalysisResult | null>(null);
  error = signal<string | null>(null);
  activeTab = signal('action-items');

  ngOnInit(): void {
    if (!this.traceStore.hasFiles()) {
      this.router.navigate(['/']);
      return;
    }

    try {
      const files = this.traceStore.files();
      const file = files[0];
      if (!file) {
        this.router.navigate(['/']);
        return;
      }

      if (file.format !== 'perf-trace') {
        this.error.set(`${file.format} format is not yet supported. Only performance traces (.json) are supported.`);
        return;
      }

      const parsed = this.parser.parse(file.content);
      const analysis = this.ruleEngine.analyze(parsed, file.name, file.size);
      this.result.set(analysis);
    } catch (e) {
      console.error('Failed to analyze trace:', e);
      this.error.set('Failed to analyze trace. The file may be corrupted or in an unsupported format.');
    }
  }

  setActiveTab(tabId: string): void {
    this.activeTab.set(tabId);
  }
}
