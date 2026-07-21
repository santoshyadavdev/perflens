import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RecentSessionsComponent } from './recent-sessions.component';
import { SavedSession } from '../../core/models/session-history.model';

describe('RecentSessionsComponent', () => {
  let component: RecentSessionsComponent;
  let fixture: ComponentFixture<RecentSessionsComponent>;

  const mockSessions: SavedSession[] = [
    {
      id: '1',
      fileName: 'trace.json',
      fileSize: 1024,
      format: 'perf-trace',
      analyzedAt: '2026-07-21T12:00:00Z',
      metrics: [{ name: 'LCP', shortName: 'LCP', value: 2000, displayValue: '2.0s', unit: 'ms', rating: 'good' }],
      actionItems: [],
      rawDataStored: false,
    },
    {
      id: '2',
      fileName: 'heap.heapsnapshot',
      fileSize: 5000000,
      format: 'heap-snapshot',
      analyzedAt: '2026-07-20T10:00:00Z',
      metrics: [],
      actionItems: [{ id: 'a1', severity: 'critical', title: 'Leak', detail: '', metric: 'MEMORY', fix: '' }],
      rawDataStored: false,
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RecentSessionsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RecentSessionsComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('sessions', mockSessions);
    fixture.detectChanges();
  });

  it('should render session cards', () => {
    const cards = fixture.nativeElement.querySelectorAll('[data-testid="session-card"]');
    expect(cards.length).toBe(2);
  });

  it('should display file name on cards', () => {
    const cards = fixture.nativeElement.querySelectorAll('[data-testid="session-card"]');
    expect(cards[0].textContent).toContain('trace.json');
    expect(cards[1].textContent).toContain('heap.heapsnapshot');
  });

  it('should emit sessionSelect on card click', () => {
    const spy = vi.spyOn(component.sessionSelect, 'emit');
    const card = fixture.nativeElement.querySelector('[data-testid="session-card"] button');
    card.click();
    expect(spy).toHaveBeenCalledWith(mockSessions[0]);
  });

  it('should emit sessionDelete on trash button click', () => {
    const spy = vi.spyOn(component.sessionDelete, 'emit');
    const btn = fixture.nativeElement.querySelector('[data-testid="delete-session"]');
    btn.click();
    expect(spy).toHaveBeenCalledWith('1');
  });
});
