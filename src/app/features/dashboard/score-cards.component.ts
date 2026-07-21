import { Component, input } from '@angular/core';
import { MetricScore, Rating } from '../../core/models/metric-score.model';
import { MetricDiff } from '../../core/models/trace-comparison.model';

@Component({
  selector: 'app-score-cards',
  standalone: true,
  template: `
    <div class="flex gap-3 flex-wrap">
      @for (metric of metrics(); track metric.shortName) {
        <div
          data-testid="metric-card"
          class="flex-1 min-w-[120px] rounded-lg p-4 text-center"
          [class]="cardClasses(metric.rating)"
        >
          <div class="text-gray-400 text-xs uppercase tracking-wide">{{ metric.shortName }}</div>
          <div class="text-2xl font-bold mt-1" [class]="valueColor(metric.rating)">
            {{ metric.displayValue }}
          </div>
          @if (getDiff(metric.shortName); as diff) {
            <div class="text-xs mt-1 font-semibold" [class]="diff.improved ? 'text-green-400' : 'text-red-400'">
              {{ diff.improved ? '↓' : '↑' }} {{ absDeltaPercent(diff) }}%
            </div>
          } @else {
            <div class="text-gray-500 text-xs mt-1">{{ ratingLabel(metric.rating) }}</div>
          }
        </div>
      }
    </div>
  `,
})
export class ScoreCardsComponent {
  metrics = input.required<MetricScore[]>();
  metricDiffs = input<MetricDiff[]>([]);

  getDiff(shortName: string): MetricDiff | undefined {
    return this.metricDiffs().find(d => d.shortName === shortName);
  }

  absDeltaPercent(diff: MetricDiff): string {
    if (diff.deltaPercent === null) return 'N/A';
    return String(Math.abs(diff.deltaPercent));
  }

  cardClasses(rating: Rating): string {
    const base = 'bg-[#1a1f2e] border-l-[3px]';
    switch (rating) {
      case 'good': return `${base} border-green-500`;
      case 'needs-improvement': return `${base} border-amber-500`;
      case 'poor': return `${base} border-red-500`;
    }
  }

  valueColor(rating: Rating): string {
    switch (rating) {
      case 'good': return 'text-green-400';
      case 'needs-improvement': return 'text-amber-400';
      case 'poor': return 'text-red-400';
    }
  }

  ratingLabel(rating: Rating): string {
    switch (rating) {
      case 'good': return 'Good';
      case 'needs-improvement': return 'Needs Work';
      case 'poor': return 'Poor';
    }
  }
}
