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
          (keydown)="onKeydown($event, $index)"
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

  onKeydown(event: KeyboardEvent, index: number): void {
    const tabs = this.tabs();
    if (tabs.length === 0) return;

    const enabledIndexes = tabs
      .map((tab, idx) => ({ tab, idx }))
      .filter(({ tab }) => !tab.disabled)
      .map(({ idx }) => idx);
    const currentEnabledPosition = enabledIndexes.indexOf(index);
    if (currentEnabledPosition === -1) return;

    let nextIndex: number | null = null;

    if (event.key === 'ArrowRight') {
      nextIndex = enabledIndexes[(currentEnabledPosition + 1) % enabledIndexes.length];
    } else if (event.key === 'ArrowLeft') {
      nextIndex = enabledIndexes[(currentEnabledPosition - 1 + enabledIndexes.length) % enabledIndexes.length];
    } else if (event.key === 'Home') {
      nextIndex = enabledIndexes[0];
    } else if (event.key === 'End') {
      nextIndex = enabledIndexes[enabledIndexes.length - 1];
    }

    if (nextIndex == null) return;

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    this.tabChange.emit(nextTab.id);
    document.getElementById(`tab-${nextTab.id}`)?.focus();
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
