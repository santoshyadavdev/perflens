import { Component, computed, input } from '@angular/core';
import type { ConstructorSummary } from '../../core/models/heap-snapshot.model';

@Component({
  selector: 'app-heap-breakdown',
  template: `
    <div class="overflow-x-auto">
      <table class="w-full text-sm text-left">
        <thead class="text-xs text-gray-500 uppercase border-b border-gray-700">
          <tr>
            <th class="px-4 py-2">Constructor</th>
            <th class="px-4 py-2 text-right">Count</th>
            <th class="px-4 py-2 text-right">Shallow Size</th>
            <th class="px-4 py-2 text-right">Retained Size</th>
            <th class="px-4 py-2 w-48">Retained %</th>
          </tr>
        </thead>
        <tbody>
          @for (row of displaySummaries(); track row.name) {
            <tr data-testid="breakdown-row" class="border-b border-gray-800 hover:bg-gray-800/50">
              <td class="px-4 py-2 font-mono text-blue-400">{{ row.name }}</td>
              <td class="px-4 py-2 text-right">{{ row.count }}</td>
              <td class="px-4 py-2 text-right">{{ formatBytes(row.shallowSize) }}</td>
              <td class="px-4 py-2 text-right">{{ formatBytes(row.retainedSize) }}</td>
              <td class="px-4 py-2">
                <div class="flex items-center gap-2">
                  <div class="flex-1 bg-gray-700 rounded-full h-2">
                    <div
                      class="bg-blue-500 h-2 rounded-full"
                      [style.width.%]="retainedPercent(row.retainedSize)"
                    ></div>
                  </div>
                  <span class="text-xs text-gray-400 w-12 text-right">
                    {{ retainedPercent(row.retainedSize).toFixed(1) }}%
                  </span>
                </div>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class HeapBreakdownComponent {
  readonly summaries = input.required<ConstructorSummary[]>();
  readonly totalSize = input.required<number>();

  readonly displaySummaries = computed(() => this.summaries().slice(0, 20));

  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  retainedPercent(retainedSize: number): number {
    const totalSize = this.totalSize();
    if (totalSize <= 0) return 0;
    return (retainedSize / totalSize) * 100;
  }
}
