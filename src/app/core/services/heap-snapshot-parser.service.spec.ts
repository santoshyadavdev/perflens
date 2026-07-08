import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HeapSnapshotParserService } from './heap-snapshot-parser.service';

describe('HeapSnapshotParserService', () => {
  it('should be created', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(HeapSnapshotParserService);
    expect(service).toBeTruthy();
  });

  it('should have idle status initially', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(HeapSnapshotParserService);
    expect(service.status()).toBe('idle');
    expect(service.progress()).toBe(0);
    expect(service.result()).toBeNull();
    expect(service.error()).toBeNull();
  });

  it('should report error for invalid input in fallback mode', async () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(HeapSnapshotParserService);
    // In jsdom, Worker is not available, so the service falls back to main-thread parsing
    // Pass an invalid file to trigger error
    const invalidFile = new File(['not json'], 'bad.heapsnapshot', { type: 'application/json' });
    await service.parse(invalidFile);
    expect(service.status()).toBe('error');
    expect(service.error()).toBeTruthy();
  });
});
