import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { HeapBreakdownComponent } from './heap-breakdown.component';
import type { ConstructorSummary } from '../../core/models/heap-snapshot.model';

@Component({
  template: '<app-heap-breakdown [summaries]="summaries()" [totalSize]="1000" />',
  imports: [HeapBreakdownComponent],
})
class TestHost {
  summaries = signal<ConstructorSummary[]>([
    { name: 'Window', count: 1, shallowSize: 400, retainedSize: 600 },
    { name: 'MyApp', count: 3, shallowSize: 300, retainedSize: 400 },
  ]);
}

describe('HeapBreakdownComponent', () => {
  it('should render summary rows', () => {
    TestBed.configureTestingModule({ imports: [TestHost, HeapBreakdownComponent] });
    const fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="breakdown-row"]');
    expect(rows.length).toBe(2);
  });

  it('should render 0.0% when total size is zero', () => {
    TestBed.configureTestingModule({ imports: [HeapBreakdownComponent] });
    const fixture = TestBed.createComponent(HeapBreakdownComponent);
    fixture.componentRef.setInput('summaries', [
      { name: 'Window', count: 1, shallowSize: 400, retainedSize: 600 },
    ]);
    fixture.componentRef.setInput('totalSize', 0);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('0.0%');
  });
});
