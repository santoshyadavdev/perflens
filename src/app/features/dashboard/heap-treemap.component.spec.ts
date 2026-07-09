import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { HeapTreemapComponent } from './heap-treemap.component';
import type { TreemapNode } from '../../core/models/heap-snapshot.model';

@Component({
  template: '<app-heap-treemap [treemapData]="data()" />',
  imports: [HeapTreemapComponent],
})
class TestHost {
  data = signal<TreemapNode>({
    name: 'Heap',
    value: 1000,
    children: [
      { name: 'object', value: 600, children: [
        { name: 'Window', value: 400 },
        { name: 'MyApp', value: 200 },
      ]},
      { name: 'closure', value: 400, children: [
        { name: 'handler', value: 400 },
      ]},
    ],
  });
}

describe('HeapTreemapComponent', () => {
  let fixture: ComponentFixture<TestHost>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TestHost, HeapTreemapComponent],
    });
    fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();
  });

  it('should create', () => {
    const el = fixture.nativeElement.querySelector('app-heap-treemap');
    expect(el).toBeTruthy();
  });

  it('should contain a canvas element', () => {
    const canvas = fixture.nativeElement.querySelector('canvas');
    expect(canvas).toBeTruthy();
  });
});
