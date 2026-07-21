import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ComparePickerComponent } from './compare-picker.component';
import { SavedSession } from '../../core/models/session-history.model';

const mockSessions: SavedSession[] = [
  {
    id: '1',
    fileName: 'baseline.json',
    fileSize: 1024,
    format: 'perf-trace',
    analyzedAt: '2026-07-20T10:00:00Z',
    metrics: [{ name: 'LCP', shortName: 'LCP', value: 2500, displayValue: '2.5s', unit: 'ms', rating: 'needs-improvement' }],
    actionItems: [],
    rawDataStored: false,
  },
  {
    id: '2',
    fileName: 'old-trace.json',
    fileSize: 2048,
    format: 'perf-trace',
    analyzedAt: '2026-07-19T08:00:00Z',
    metrics: [],
    actionItems: [],
    rawDataStored: false,
  },
];

describe('ComparePickerComponent', () => {
  let component: ComparePickerComponent;
  let fixture: ComponentFixture<ComparePickerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ComparePickerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ComparePickerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('sessions', mockSessions);
    fixture.detectChanges();
  });

  it('should render session options', () => {
    const options = fixture.nativeElement.querySelectorAll('[data-testid="compare-option"]');
    expect(options.length).toBe(2);
  });

  it('should emit sessionSelect on click', () => {
    const spy = vi.spyOn(component.sessionSelect, 'emit');
    const option = fixture.nativeElement.querySelector('[data-testid="compare-option"]');
    option.click();
    expect(spy).toHaveBeenCalledWith(mockSessions[0]);
  });

  it('should emit close on backdrop click', () => {
    const spy = vi.spyOn(component.close, 'emit');
    const backdrop = fixture.nativeElement.querySelector('[role="dialog"]');
    backdrop.click();
    expect(spy).toHaveBeenCalled();
  });
});
