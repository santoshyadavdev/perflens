import { Component, input } from '@angular/core';
import { TraceComparison, MetricDiff } from '../../core/models/trace-comparison.model';
import { SeverityBadgeComponent } from '../../shared/components/severity-badge.component';

@Component({
  selector: 'app-trace-comparison',
  standalone: true,
  imports: [SeverityBadgeComponent],
  template: `
    <div class="space-y-6">
      <!-- Metric Diffs -->
      <div>
        <h3 class="text-lg font-semibold text-gray-200 mb-3">Metric Changes</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          @for (diff of comparison().metricDiffs; track diff.shortName) {
            <div
              data-testid="metric-diff-card"
              class="bg-[#1a1f2e] rounded-lg p-4 border-l-[3px]"
              [class]="diffBorderClass(diff)"
            >
              <div class="text-gray-400 text-xs uppercase tracking-wide">{{ diff.shortName }}</div>
              <div class="flex items-baseline gap-2 mt-1">
                <span class="text-xl font-bold text-white">{{ diff.current.displayValue }}</span>
                <span class="text-gray-500 text-sm">from {{ diff.baseline.displayValue }}</span>
              </div>
              <div class="mt-2" [class]="deltaTextClass(diff)">
                <span class="text-sm font-semibold">
                  {{ diff.improved ? '↓' : '↑' }} {{ absDeltaPercent(diff) }}%
                </span>
                <span class="text-xs ml-1">
                  ({{ formatDelta(diff) }})
                </span>
              </div>
            </div>
          }
        </div>
        @if (comparison().metricDiffs.length === 0) {
          <div class="text-gray-500 text-sm">No comparable metrics found.</div>
        }
      </div>

      <!-- Comparison header -->
      <div class="text-gray-500 text-sm flex items-center gap-2">
        <span>{{ comparison().current.fileName }}</span>
        <span>vs</span>
        <span>{{ comparison().baseline.fileName }}</span>
      </div>

      <!-- New Issues -->
      @if (comparison().newActionItems.length > 0) {
        <div data-testid="new-items">
          <h3 class="text-lg font-semibold text-red-400 mb-3">
            🆕 New Issues ({{ comparison().newActionItems.length }})
          </h3>
          <div class="space-y-2">
            @for (item of comparison().newActionItems; track item.id) {
              <div class="bg-[#1a1f2e] border-l-[3px] border-red-500 rounded-lg px-4 py-3 flex items-center gap-2">
                <app-severity-badge [severity]="item.severity" />
                <span class="text-gray-200 text-sm">{{ item.title }}</span>
                <span class="ml-auto text-gray-500 text-xs px-2 py-0.5 bg-gray-800 rounded">{{ item.metric }}</span>
              </div>
            }
          </div>
        </div>
      }

      <!-- Resolved -->
      @if (comparison().resolvedActionItems.length > 0) {
        <div data-testid="resolved-items">
          <h3 class="text-lg font-semibold text-green-400 mb-3">
            ✅ Resolved ({{ comparison().resolvedActionItems.length }})
          </h3>
          <div class="space-y-2">
            @for (item of comparison().resolvedActionItems; track item.id) {
              <div class="bg-[#1a1f2e] border-l-[3px] border-green-500 rounded-lg px-4 py-3 flex items-center gap-2 opacity-70">
                <app-severity-badge [severity]="item.severity" />
                <span class="text-gray-200 text-sm line-through">{{ item.title }}</span>
                <span class="ml-auto text-gray-500 text-xs px-2 py-0.5 bg-gray-800 rounded">{{ item.metric }}</span>
              </div>
            }
          </div>
        </div>
      }

      <!-- Unchanged -->
      @if (comparison().unchangedActionItems.length > 0) {
        <div data-testid="unchanged-items">
          <h3 class="text-lg font-semibold text-gray-400 mb-3">
            ➡️ Unchanged ({{ comparison().unchangedActionItems.length }})
          </h3>
          <div class="space-y-2">
            @for (item of comparison().unchangedActionItems; track item.id) {
              <div class="bg-[#1a1f2e] border-l-[3px] border-gray-600 rounded-lg px-4 py-3 flex items-center gap-2">
                <app-severity-badge [severity]="item.severity" />
                <span class="text-gray-200 text-sm">{{ item.title }}</span>
                <span class="ml-auto text-gray-500 text-xs px-2 py-0.5 bg-gray-800 rounded">{{ item.metric }}</span>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class TraceComparisonComponent {
  comparison = input.required<TraceComparison>();

  diffBorderClass(diff: MetricDiff): string {
    if (diff.deltaPercent === null || Math.abs(diff.deltaPercent) < 1) return 'border-gray-600';
    return diff.improved ? 'border-green-500' : 'border-red-500';
  }

  deltaTextClass(diff: MetricDiff): string {
    if (diff.deltaPercent === null || Math.abs(diff.deltaPercent) < 1) return 'text-gray-500';
    return diff.improved ? 'text-green-400' : 'text-red-400';
  }

  absDeltaPercent(diff: MetricDiff): string {
    if (diff.deltaPercent === null) return 'N/A';
    return String(Math.abs(diff.deltaPercent));
  }

  formatDelta(diff: MetricDiff): string {
    const unit = diff.current.unit;
    const sign = diff.delta > 0 ? '+' : '';
    if (unit === 'ms') {
      return `${sign}${diff.delta}ms`;
    }
    return `${sign}${diff.delta}`;
  }
}
