import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TabDef, TabPanelComponent } from './tab-panel.component';

describe('TabPanelComponent', () => {
  let fixture: ComponentFixture<TabPanelComponent>;
  let component: TabPanelComponent;

  const tabs: TabDef[] = [
    { id: 'action-items', label: 'Action Items', icon: '🎯' },
    { id: 'flamegraph', label: 'Flamegraph', icon: '🔥' },
    { id: 'timeline', label: 'Timeline', icon: '📊', disabled: true },
    { id: 'network', label: 'Network', icon: '🌊' },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TabPanelComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TabPanelComponent);
    fixture.componentRef.setInput('tabs', tabs);
    fixture.componentRef.setInput('activeTab', 'action-items');
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('moves focus to the next enabled tab on ArrowRight', () => {
    const emitSpy = vi.spyOn(component.tabChange, 'emit');
    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    buttons[0].focus();
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight' });
    const preventDefault = vi.spyOn(event, 'preventDefault');

    component.onKeydown(event, 0);

    expect(preventDefault).toHaveBeenCalled();
    expect(emitSpy).toHaveBeenCalledWith('flamegraph');
    expect(document.activeElement).toBe(buttons[1]);
  });

  it('moves focus to the last enabled tab on End', () => {
    const emitSpy = vi.spyOn(component.tabChange, 'emit');
    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    buttons[0].focus();
    const event = new KeyboardEvent('keydown', { key: 'End' });

    component.onKeydown(event, 0);

    expect(emitSpy).toHaveBeenCalledWith('network');
    expect(document.activeElement).toBe(buttons[3]);
  });
});
