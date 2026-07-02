import { Component, input, signal, computed, Pipe, PipeTransform } from '@angular/core';
import { ActionItem } from '../../core/models/action-item.model';
import { SeverityBadgeComponent } from '../../shared/components/severity-badge.component';

@Pipe({ name: 'shortenUrl', standalone: true })
export class ShortenUrlPipe implements PipeTransform {
  transform(url: string): string {
    try {
      const u = new URL(url);
      return u.pathname.split('/').slice(-2).join('/');
    } catch {
      return url.split('/').slice(-2).join('/');
    }
  }
}

@Component({
  selector: 'app-action-items',
  standalone: true,
  imports: [SeverityBadgeComponent, ShortenUrlPipe],
  template: `
    <div class="space-y-3">
      <!-- Summary bar -->
      <div class="flex gap-4 text-sm mb-4">
        <span class="text-red-400">🔴 {{ criticalCount() }} Critical</span>
        <span class="text-amber-400">🟡 {{ warningCount() }} Warning</span>
        <span class="text-blue-400">🔵 {{ infoCount() }} Info</span>
      </div>

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
              <span class="text-gray-200 text-sm font-medium">{{ item.title }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-gray-500 text-xs px-2 py-0.5 bg-gray-800 rounded">{{ item.metric }}</span>
              <button data-testid="expand-btn" class="text-gray-500 text-xs">
                {{ expandedIds().has(item.id) ? '▲' : '▼' }}
              </button>
            </div>
          </div>

          @if (expandedIds().has(item.id)) {
            <div data-testid="action-detail" class="mt-3 space-y-3">
              <!-- Detail with breakdown -->
              <pre class="text-gray-400 text-sm whitespace-pre-wrap font-sans leading-relaxed">{{ item.detail }}</pre>

              <!-- Source location -->
              @if (item.source?.scriptUrl) {
                <div class="flex items-center gap-2 text-xs">
                  <span class="text-gray-500">📁</span>
                  <span class="text-blue-400 font-mono">{{ item.source.scriptUrl | shortenUrl }}{{ item.source.lineNumber ? ':' + item.source.lineNumber : '' }}</span>
                  @if (item.source.functionName) {
                    <span class="text-gray-600">→</span>
                    <span class="text-purple-400 font-mono">{{ item.source.functionName }}()</span>
                  }
                </div>
              }

              <!-- Fix steps -->
              <div class="bg-[#252b3b] rounded-lg p-4">
                <div class="text-emerald-400 font-semibold text-xs uppercase tracking-wide mb-2">💡 How to fix</div>
                <pre class="text-gray-300 text-sm whitespace-pre-wrap font-sans leading-relaxed">{{ item.fix }}</pre>
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

  criticalCount = computed(() => this.items().filter(i => i.severity === 'critical').length);
  warningCount = computed(() => this.items().filter(i => i.severity === 'warning').length);
  infoCount = computed(() => this.items().filter(i => i.severity === 'info').length);

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
