import { Component, computed, input, signal } from '@angular/core';
import type { FlatProfileEntry, CpuProfileComparison } from '../../core/models/cpu-profile.model';

type SortField = 'selfTime' | 'totalTime' | 'selfPercent' | 'totalPercent' | 'hitCount';

@Component({
  selector: 'app-cpu-hot-functions',
  template: `
    <div class="overflow-x-auto">
      <table class="w-full text-sm text-left">
        <thead class="text-xs text-gray-500 uppercase border-b border-gray-700">
          <tr>
            <th class="px-4 py-2">Function</th>
            <th class="px-4 py-2">Script</th>
            <th class="px-4 py-2 text-right cursor-pointer hover:text-gray-300" tabindex="0" role="button" (click)="toggleSort('selfTime')" (keydown.enter)="toggleSort('selfTime')" (keydown.space)="toggleSort('selfTime'); $event.preventDefault()">
              Self Time {{ sortIndicator('selfTime') }}
            </th>
            <th class="px-4 py-2 text-right cursor-pointer hover:text-gray-300" tabindex="0" role="button" (click)="toggleSort('totalTime')" (keydown.enter)="toggleSort('totalTime')" (keydown.space)="toggleSort('totalTime'); $event.preventDefault()">
              Total Time {{ sortIndicator('totalTime') }}
            </th>
            <th class="px-4 py-2 w-36 cursor-pointer hover:text-gray-300" tabindex="0" role="button" (click)="toggleSort('selfPercent')" (keydown.enter)="toggleSort('selfPercent')" (keydown.space)="toggleSort('selfPercent'); $event.preventDefault()">
              Self % {{ sortIndicator('selfPercent') }}
            </th>
            <th class="px-4 py-2 text-right cursor-pointer hover:text-gray-300" tabindex="0" role="button" (click)="toggleSort('hitCount')" (keydown.enter)="toggleSort('hitCount')" (keydown.space)="toggleSort('hitCount'); $event.preventDefault()">
              Hits {{ sortIndicator('hitCount') }}
            </th>
            @if (comparison()) {
              <th class="px-4 py-2 text-right">Δ Self</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of sortedEntries(); track row.callFrame.functionName + row.callFrame.url + row.callFrame.lineNumber) {
            <tr class="border-b border-gray-800 hover:bg-gray-800/50">
              <td class="px-4 py-2 font-mono text-blue-400">
                {{ row.callFrame.functionName || '(anonymous)' }}
                @if (row.deoptReason) {
                  <span class="ml-1" title="{{ row.deoptReason }}">⚠️</span>
                }
              </td>
              <td class="px-4 py-2 text-gray-400 text-xs">
                {{ scriptBasename(row.callFrame.url) }}:{{ row.callFrame.lineNumber }}
              </td>
              <td class="px-4 py-2 text-right">{{ row.selfTime.toFixed(1) }}ms</td>
              <td class="px-4 py-2 text-right">{{ row.totalTime.toFixed(1) }}ms</td>
              <td class="px-4 py-2">
                <div class="flex items-center gap-2">
                  <div class="flex-1 bg-gray-700 rounded-full h-2">
                    <div
                      class="bg-emerald-500 h-2 rounded-full"
                      [style.width.%]="row.selfPercent"
                    ></div>
                  </div>
                  <span class="text-xs text-gray-400 w-12 text-right">
                    {{ row.selfPercent.toFixed(1) }}%
                  </span>
                </div>
              </td>
              <td class="px-4 py-2 text-right">{{ row.hitCount }}</td>
              @if (comparison()) {
                <td class="px-4 py-2 text-right"
                    [class.text-red-400]="getDelta(row) > 0"
                    [class.text-green-400]="getDelta(row) < 0">
                  {{ formatDelta(getDelta(row)) }}
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class CpuHotFunctionsComponent {
  readonly entries = input.required<FlatProfileEntry[]>();
  readonly comparison = input<CpuProfileComparison>();

  readonly sortField = signal<SortField>('selfTime');
  readonly sortAsc = signal(false);

  readonly sortedEntries = computed(() => {
    const data = this.entries()
      .filter(e => e.callFrame.functionName !== '(root)')
      .slice(0, 50);

    const field = this.sortField();
    const asc = this.sortAsc();

    return [...data].sort((a, b) => {
      const av = a[field];
      const bv = b[field];
      return asc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  });

  toggleSort(field: SortField): void {
    if (this.sortField() === field) {
      this.sortAsc.set(!this.sortAsc());
    } else {
      this.sortField.set(field);
      this.sortAsc.set(false);
    }
  }

  sortIndicator(field: SortField): string {
    if (this.sortField() !== field) return '';
    return this.sortAsc() ? '↑' : '↓';
  }

  scriptBasename(url: string): string {
    if (!url) return '(native)';
    return url.split('/').pop() || url;
  }

  getDelta(entry: FlatProfileEntry): number {
    const comp = this.comparison();
    if (!comp) return 0;
    const diff = comp.changed.find(
      d => d.callFrame.functionName === entry.callFrame.functionName &&
           d.callFrame.url === entry.callFrame.url &&
           d.callFrame.lineNumber === entry.callFrame.lineNumber
    );
    return diff?.selfTimeDelta ?? 0;
  }

  formatDelta(delta: number): string {
    if (delta === 0) return '—';
    const sign = delta > 0 ? '+' : '';
    return `${sign}${delta.toFixed(1)}ms`;
  }
}
