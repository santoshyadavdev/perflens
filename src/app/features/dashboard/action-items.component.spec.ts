import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActionItemsComponent } from './action-items.component';
import { ActionItem } from '../../core/models/action-item.model';

describe('ActionItemsComponent', () => {
  let fixture: ComponentFixture<ActionItemsComponent>;

  const mockItems: ActionItem[] = [
    {
      id: 'test-1',
      severity: 'critical',
      title: 'Render-blocking script: vendor.js (2100ms)',
      detail: 'vendor.js (340KB) blocks rendering for 2100ms.',
      metric: 'LCP',
      fix: 'Add async or defer to the script tag.',
    },
    {
      id: 'test-2',
      severity: 'warning',
      title: 'Long task: processData (380ms)',
      detail: 'processData ran for 380ms on the main thread.',
      metric: 'TBT',
      fix: 'Break into smaller chunks.',
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ActionItemsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ActionItemsComponent);
    fixture.componentRef.setInput('items', mockItems);
    fixture.detectChanges();
  });

  it('renders an entry for each action item', () => {
    const entries = fixture.nativeElement.querySelectorAll('[data-testid="action-item"]');
    expect(entries.length).toBe(2);
  });

  it('displays the title', () => {
    const first = fixture.nativeElement.querySelector('[data-testid="action-item"]');
    expect(first.textContent).toContain('vendor.js');
  });

  it('shows the fix suggestion when expanded', () => {
    const expandBtn = fixture.nativeElement.querySelector('[data-testid="expand-btn"]');
    expandBtn.click();
    fixture.detectChanges();
    const detail = fixture.nativeElement.querySelector('[data-testid="action-detail"]');
    expect(detail.textContent).toContain('How to fix');
  });
});
