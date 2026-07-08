import { Component, input } from '@angular/core';
import type { DetachedDOMNode } from '../../core/models/heap-snapshot.model';

@Component({
  selector: 'app-detached-dom-list',
  template: `
    @if (nodes().length === 0) {
      <p class="text-gray-400 text-sm py-4">No detached DOM nodes found. ✅</p>
    } @else {
      <div class="space-y-2">
        <p class="text-sm text-gray-400">{{ nodes().length }} detached DOM node(s) found</p>
        @for (node of nodes(); track node.nodeOrdinal) {
          <div data-testid="detached-row" class="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
            <div class="flex justify-between items-start">
              <span class="font-mono text-red-400">{{ node.className }}</span>
              <span class="text-sm text-gray-400">{{ formatBytes(node.retainedSize) }} retained</span>
            </div>
            @if (node.retainerChain.length > 0) {
              <p class="text-xs text-gray-500 mt-1">
                Retained by: {{ node.retainerChain.join(' → ') }}
              </p>
            }
          </div>
        }
      </div>
    }
  `,
})
export class DetachedDomListComponent {
  readonly nodes = input.required<DetachedDOMNode[]>();

  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
