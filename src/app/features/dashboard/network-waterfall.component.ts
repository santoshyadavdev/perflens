import { Component, input } from '@angular/core';
import { ParsedTrace } from '../../core/models/trace-event.model';

@Component({
  selector: 'app-network-waterfall',
  template: `<div class="bg-[#1a1f2e] rounded-lg p-8 text-center text-gray-500">🌊 Network loading...</div>`,
})
export class NetworkWaterfallComponent {
  trace = input.required<ParsedTrace>();
}
