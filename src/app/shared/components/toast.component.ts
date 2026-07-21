import { Component, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

let nextId = 0;

@Component({
  selector: 'app-toast',
  standalone: true,
  template: `
    <div class="fixed bottom-4 right-4 z-50 space-y-2">
      @for (toast of toasts(); track toast.id) {
        <div
          class="px-4 py-3 rounded-lg shadow-lg text-sm font-medium animate-slide-up"
          [class]="toastClasses(toast.type)"
          role="alert"
        >
          {{ toast.message }}
        </div>
      }
    </div>
  `,
  styles: [`
    @keyframes slide-up {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-slide-up { animation: slide-up 0.2s ease-out; }
  `],
})
export class ToastComponent {
  readonly toasts = signal<Toast[]>([]);

  show(message: string, type: Toast['type'] = 'success', duration = 3000): void {
    const id = nextId++;
    this.toasts.update(t => [...t, { id, message, type }]);
    setTimeout(() => {
      this.toasts.update(t => t.filter(toast => toast.id !== id));
    }, duration);
  }

  toastClasses(type: Toast['type']): string {
    switch (type) {
      case 'success': return 'bg-emerald-600 text-white';
      case 'error': return 'bg-red-600 text-white';
      case 'info': return 'bg-blue-600 text-white';
    }
  }
}
