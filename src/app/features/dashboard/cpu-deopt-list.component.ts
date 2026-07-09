import { Component, input } from '@angular/core';
import type { DeoptEvent } from '../../core/models/cpu-profile.model';

@Component({
  selector: 'app-cpu-deopt-list',
  template: `
    @if (deoptEvents().length === 0) {
      <p class="text-gray-400 text-sm py-4">No deoptimizations detected. ✅</p>
    } @else {
      <div class="space-y-2">
        <p class="text-sm text-gray-400">{{ deoptEvents().length }} deoptimization(s) found</p>
        @for (deopt of deoptEvents(); track deopt.callFrame.functionName + deopt.reason) {
          <div class="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
            <div class="flex justify-between items-start">
              <span class="font-mono text-amber-400">{{ deopt.callFrame.functionName || '(anonymous)' }}</span>
              <span class="text-sm text-gray-400">{{ deopt.selfTime.toFixed(1) }}ms self time</span>
            </div>
            <p class="text-xs text-red-400 mt-1">Reason: {{ deopt.reason }}</p>
            @if (deopt.callFrame.url) {
              <p class="text-xs text-gray-500 mt-1">
                {{ deopt.callFrame.url }}:{{ deopt.callFrame.lineNumber }}
              </p>
            }
          </div>
        }
      </div>
    }
  `,
})
export class CpuDeoptListComponent {
  readonly deoptEvents = input.required<DeoptEvent[]>();
}
