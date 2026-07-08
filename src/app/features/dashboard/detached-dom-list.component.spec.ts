import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { DetachedDomListComponent } from './detached-dom-list.component';
import type { DetachedDOMNode } from '../../core/models/heap-snapshot.model';

@Component({
  template: '<app-detached-dom-list [nodes]="nodes()" />',
  imports: [DetachedDomListComponent],
})
class TestHost {
  nodes = signal<DetachedDOMNode[]>([
    { nodeOrdinal: 4, className: 'HTMLDivElement', retainedSize: 120, retainerChain: ['Window (object)'] },
    { nodeOrdinal: 7, className: 'HTMLSpanElement', retainedSize: 40, retainerChain: ['HTMLDivElement (object)'] },
  ]);
}

describe('DetachedDomListComponent', () => {
  it('should render detached node rows', () => {
    TestBed.configureTestingModule({ imports: [TestHost, DetachedDomListComponent] });
    const fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="detached-row"]');
    expect(rows.length).toBe(2);
  });
});
