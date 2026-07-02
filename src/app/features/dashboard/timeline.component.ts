import { Component, input } from '@angular/core';
import { ParsedTrace } from '../../core/models/trace-event.model';

@Component({
  selector: 'app-timeline',
  template: `<div class="bg-[#1a1f2e] rounded-lg p-8 text-center text-gray-500">📊 Timeline loading...</div>`,
})
export class TimelineComponent {
  trace = input.required<ParsedTrace>();
}
