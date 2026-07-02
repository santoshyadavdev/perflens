import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ScoreCardsComponent } from './score-cards.component';
import { MetricScore } from '../../core/models/metric-score.model';

describe('ScoreCardsComponent', () => {
  let fixture: ComponentFixture<ScoreCardsComponent>;

  const mockMetrics: MetricScore[] = [
    { name: 'Largest Contentful Paint', shortName: 'LCP', value: 4200, displayValue: '4.2s', unit: 'ms', rating: 'poor' },
    { name: 'Total Blocking Time', shortName: 'TBT', value: 1800, displayValue: '1.8s', unit: 'ms', rating: 'poor' },
    { name: 'First Contentful Paint', shortName: 'FCP', value: 1800, displayValue: '1.8s', unit: 'ms', rating: 'needs-improvement' },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ScoreCardsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ScoreCardsComponent);
    fixture.componentRef.setInput('metrics', mockMetrics);
    fixture.detectChanges();
  });

  it('renders a card for each metric', () => {
    const cards = fixture.nativeElement.querySelectorAll('[data-testid="metric-card"]');
    expect(cards.length).toBe(3);
  });

  it('displays metric short name', () => {
    const firstCard = fixture.nativeElement.querySelector('[data-testid="metric-card"]');
    expect(firstCard.textContent).toContain('LCP');
  });

  it('displays metric value', () => {
    const firstCard = fixture.nativeElement.querySelector('[data-testid="metric-card"]');
    expect(firstCard.textContent).toContain('4.2s');
  });

  it('applies red styling for poor rating', () => {
    const firstCard = fixture.nativeElement.querySelector('[data-testid="metric-card"]');
    expect(firstCard.className).toContain('border-red');
  });
});
