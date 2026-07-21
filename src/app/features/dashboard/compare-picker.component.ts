import { Component, input, output, ElementRef, viewChild, afterNextRender } from '@angular/core';
import { DatePipe } from '@angular/common';
import { SavedSession } from '../../core/models/session-history.model';

@Component({
  selector: 'app-compare-picker',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div
      #dialogBackdrop
      class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      (click)="onBackdropClick($event)"
      (keydown.escape)="close.emit()"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-label="Select baseline for comparison"
    >
      <div class="bg-[#161b26] rounded-xl p-6 w-full max-w-md shadow-xl border border-gray-800 max-h-[70vh] overflow-y-auto">
        <h2 class="text-lg font-semibold text-white mb-1">Compare with...</h2>
        <p class="text-gray-500 text-sm mb-4">Select a previous analysis as the baseline</p>

        @if (sessions().length === 0) {
          <div class="text-gray-500 text-sm text-center py-8">
            No saved sessions of this format to compare against.
          </div>
        } @else {
          <div class="space-y-2">
            @for (session of sessions(); track session.id) {
              <button
                data-testid="compare-option"
                class="w-full bg-[#1a1f2e] hover:bg-[#252b3b] border border-gray-700 rounded-lg p-3 text-left transition-colors"
                (click)="sessionSelect.emit(session)"
              >
                <div class="text-gray-200 text-sm font-medium">{{ session.fileName }}</div>
                <div class="text-gray-500 text-xs mt-1 flex items-center gap-2">
                  <span>{{ session.analyzedAt | date:'MMM d, h:mm a' }}</span>
                  @if (session.metrics.length > 0) {
                    <span class="text-gray-600">·</span>
                    @for (metric of session.metrics.slice(0, 3); track metric.shortName) {
                      <span class="text-gray-400">{{ metric.shortName }}: {{ metric.displayValue }}</span>
                    }
                  }
                </div>
              </button>
            }
          </div>
        }

        <button
          class="mt-4 w-full text-gray-400 hover:text-white text-sm py-2 transition-colors"
          (click)="close.emit()"
        >
          Cancel
        </button>
      </div>
    </div>
  `,
})
export class ComparePickerComponent {
  private readonly dialogBackdrop = viewChild<ElementRef<HTMLDivElement>>('dialogBackdrop');

  sessions = input.required<SavedSession[]>();
  sessionSelect = output<SavedSession>();
  close = output<void>();

  constructor() {
    afterNextRender(() => {
      this.dialogBackdrop()?.nativeElement.focus();
    });
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close.emit();
    }
  }
}
