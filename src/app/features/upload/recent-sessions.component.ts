import { Component, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { SavedSession } from '../../core/models/session-history.model';

@Component({
  selector: 'app-recent-sessions',
  standalone: true,
  imports: [DatePipe],
  template: `
    @if (sessions().length > 0) {
      <div class="mt-8 max-w-lg w-full">
        <h2 class="text-gray-400 text-sm font-medium mb-3">Recent Analyses</h2>
        <div class="space-y-2">
          @for (session of sessions(); track session.id) {
           <div
             data-testid="session-card"
             class="bg-[#1a1f2e] rounded-lg px-4 py-3 hover:bg-[#252b3b] transition-colors
                    flex items-center justify-between group"
           >
             <button
               type="button"
               class="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer bg-transparent border-0 p-0
                      focus:outline-none focus:ring-2 focus:ring-emerald-500/50 rounded"
               (click)="sessionSelect.emit(session)"
             >
               <span class="text-lg flex-shrink-0">{{ formatIcon(session.format) }}</span>
               <div class="min-w-0">
                 <div class="text-gray-200 text-sm font-medium truncate">{{ session.fileName }}</div>
                 <div class="text-gray-500 text-xs flex items-center gap-2">
                   <span>{{ session.analyzedAt | date:'MMM d, h:mm a' }}</span>
                   @if (session.metrics.length > 0) {
                     <span class="text-gray-600">·</span>
                     <span [class]="metricColor(session.metrics[0].rating)">
                       {{ session.metrics[0].shortName }}: {{ session.metrics[0].displayValue }}
                     </span>
                   }
                 </div>
               </div>
             </button>
             <button
               type="button"
               data-testid="delete-session"
               class="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1
                      focus:outline-none focus:opacity-100"
               (click)="onDelete($event, session.id)"
               aria-label="Delete session"
             >
               🗑
             </button>
           </div>
          }
        </div>
      </div>
    }
  `,
})
export class RecentSessionsComponent {
  sessions = input.required<SavedSession[]>();
  sessionSelect = output<SavedSession>();
  sessionDelete = output<string>();

  formatIcon(format: string): string {
    switch (format) {
      case 'perf-trace': return '📊';
      case 'heap-snapshot': return '🧠';
      case 'cpu-profile': return '⚡';
      default: return '📁';
    }
  }

  metricColor(rating: string): string {
    switch (rating) {
      case 'good': return 'text-green-400';
      case 'needs-improvement': return 'text-amber-400';
      case 'poor': return 'text-red-400';
      default: return 'text-gray-400';
    }
  }

  onDelete(event: MouseEvent, id: string): void {
    event.stopPropagation();
    this.sessionDelete.emit(id);
  }
}
