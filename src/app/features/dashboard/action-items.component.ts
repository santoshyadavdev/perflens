import { Component, input, signal } from '@angular/core';
import { ActionItem } from '../../core/models/action-item.model';
import { SeverityBadgeComponent } from '../../shared/components/severity-badge.component';

@Component({
  selector: 'app-action-items',
  standalone: true,
  imports: [SeverityBadgeComponent],
  template: `
    <div class="space-y-3">
      @for (item of items(); track item.id) {
        <div
          data-testid="action-item"
          class="rounded-lg p-4 cursor-pointer transition-colors hover:bg-[#1e2536]"
          [class]="itemBorderClass(item)"
          (click)="toggleExpand(item.id)"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <app-severity-badge [severity]="item.severity" />
              <span class="text-gray-200 text-sm">{{ item.title }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-gray-500 text-xs">{{ item.metric }}</span>
              <button data-testid="expand-btn" class="text-gray-500 text-xs">
                {{ expandedIds().has(item.id) ? '▲' : '▼' }}
              </button>
            </div>
          </div>

          @if (expandedIds().has(item.id)) {
            <div data-testid="action-detail" class="mt-3 text-gray-400 text-sm space-y-2">
              <p>{{ item.detail }}</p>
              <div class="bg-[#252b3b] rounded p-3 text-gray-300 text-xs">
                <span class="text-emerald-400 font-semibold">Fix: </span>{{ item.fix }}
              </div>
            </div>
          }
        </div>
      } @empty {
        <div class="text-center py-12 text-gray-500">
          <div class="text-3xl mb-2">✅</div>
          <p>No issues detected. Your trace looks healthy!</p>
        </div>
      }
    </div>
  `,
})
export class ActionItemsComponent {
  items = input.required<ActionItem[]>();
  expandedIds = signal(new Set<string>());

  toggleExpand(id: string): void {
    this.expandedIds.update(ids => {
      const next = new Set(ids);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  itemBorderClass(item: ActionItem): string {
    const base = 'bg-[#1a1f2e] border-l-[3px]';
    switch (item.severity) {
      case 'critical': return `${base} border-red-500`;
      case 'warning': return `${base} border-amber-500`;
      case 'info': return `${base} border-blue-500`;
    }
  }
}
