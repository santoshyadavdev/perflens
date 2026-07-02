import { Component, input } from '@angular/core';
import { ParsedTrace } from '../../core/models/trace-event.model';

@Component({
  selector: 'app-flamegraph',
  template: `<div class="bg-[#1a1f2e] rounded-lg p-8 text-center text-gray-500">🔥 Flamegraph loading...</div>`,
})
export class FlamegraphComponent {
  trace = input.required<ParsedTrace>();
}
