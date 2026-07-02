import { Component, input } from '@angular/core';
import { Severity } from '../../core/models/action-item.model';

@Component({
  selector: 'app-severity-badge',
  standalone: true,
  template: `
    <span
      [class]="badgeClasses()"
      class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide"
    >
      {{ severity().toUpperCase() }}
    </span>
  `,
})
export class SeverityBadgeComponent {
  severity = input.required<Severity>();

  badgeClasses(): string {
    switch (this.severity()) {
      case 'critical':
        return 'bg-red-500/20 text-red-400';
      case 'warning':
        return 'bg-amber-500/20 text-amber-400';
      case 'info':
        return 'bg-blue-500/20 text-blue-400';
    }
  }
}
