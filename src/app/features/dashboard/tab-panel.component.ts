import { Component, input, output } from '@angular/core';

export interface TabDef {
  id: string;
  label: string;
  icon: string;
  disabled?: boolean;
}

@Component({
  selector: 'app-tab-panel',
  template: `
    <div class="flex border-b border-gray-700/50 overflow-x-auto" role="tablist" aria-label="Analysis views">
      @for (tab of tabs(); track tab.id) {
        <button
          type="button"
          role="tab"
          [id]="'tab-' + tab.id"
          class="px-4 py-2.5 text-sm border-b-2 transition-colors"
          [class]="tabClasses(tab)"
          [disabled]="tab.disabled"
          [attr.aria-selected]="activeTab() === tab.id"
          [attr.aria-controls]="'tab-panel-' + tab.id"
          [attr.tabindex]="activeTab() === tab.id ? 0 : -1"
          (click)="onTabClick(tab.id, tab.disabled)"
        >
          {{ tab.icon }} {{ tab.label }}
        </button>
      }
    </div>
  `,
})
export class TabPanelComponent {
  tabs = input.required<TabDef[]>();
  activeTab = input.required<string>();
  tabChange = output<string>();

  onTabClick(tabId: string, disabled = false): void {
    if (!disabled) {
      this.tabChange.emit(tabId);
    }
  }

  tabClasses(tab: TabDef): string {
    if (tab.disabled) {
      return 'border-transparent text-gray-500 cursor-not-allowed';
    }

    return this.activeTab() === tab.id
      ? 'font-semibold border-emerald-400 text-emerald-400'
      : 'border-transparent text-gray-400 hover:text-gray-200 cursor-pointer';
  }
}
