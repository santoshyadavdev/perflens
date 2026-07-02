import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { PerfTraceParserService } from '../../core/parsers/perf-trace-parser.service';
import { RuleEngineService } from '../../core/analysis/rule-engine.service';
import { AnalysisResult } from '../../core/models/analysis-result.model';
import { TraceStoreService } from '../../core/services/trace-store.service';
import { ScoreCardsComponent } from './score-cards.component';
import { ActionItemsComponent } from './action-items.component';

@Component({
  selector: 'app-dashboard',
  imports: [ScoreCardsComponent, ActionItemsComponent],
  template: `
    <div class="min-h-screen">
      <!-- Nav bar -->
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
          <!-- Score Cards -->
          <app-score-cards [metrics]="r.metrics" />

          <!-- Tabs -->
          <div class="flex border-b border-gray-700/50">
            <button
              class="px-4 py-2.5 text-sm font-semibold border-b-2 border-emerald-400 text-emerald-400"
            >
              🎯 Action Items
            </button>
            <button class="px-4 py-2.5 text-sm text-gray-500 cursor-not-allowed" disabled>
              🔥 Flamegraph
            </button>
            <button class="px-4 py-2.5 text-sm text-gray-500 cursor-not-allowed" disabled>
              📊 Timeline
            </button>
            <button class="px-4 py-2.5 text-sm text-gray-500 cursor-not-allowed" disabled>
              🌊 Network
            </button>
            <button class="px-4 py-2.5 text-sm text-gray-500 cursor-not-allowed" disabled>
              🧠 Memory
            </button>
            <button class="px-4 py-2.5 text-sm text-gray-500 cursor-not-allowed" disabled>
              ⚙️ V8 Internals
            </button>
          </div>

          <!-- Action Items Panel -->
          <app-action-items [items]="r.actionItems" />
        </div>
      } @else if (error()) {
        <div class="flex items-center justify-center min-h-[60vh]">
          <div class="text-red-400 bg-red-500/10 px-6 py-4 rounded-lg">
            {{ error() }}
          </div>
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

  result = signal<AnalysisResult | null>(null);
  error = signal<string | null>(null);

  ngOnInit(): void {
    if (!this.traceStore.hasFiles()) {
      this.router.navigate(['/']);
      return;
    }

    try {
      const files = this.traceStore.files();
      const file = files[0]; // Phase 1: single file analysis
      if (!file) {
        this.router.navigate(['/']);
        return;
      }

      if (file.format !== 'perf-trace') {
        this.error.set(`${file.format} format is not yet supported in Phase 1. Only performance traces (.json) are supported.`);
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
}
