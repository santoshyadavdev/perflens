import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { NetworkWaterfallComponent, buildWaterfall, getMimeColor } from './network-waterfall.component';
import { ParsedTrace } from '../../core/models/trace-event.model';

const mockTrace: ParsedTrace = {
  traceEvents: [
    {
      name: 'ResourceSendRequest',
      cat: 'devtools.timeline',
      ph: 'I',
      ts: 1_000_000,
      pid: 1,
      tid: 1,
      args: { data: { requestId: '1', url: 'https://example.com/app.js' } },
    },
    {
      name: 'ResourceReceiveResponse',
      cat: 'devtools.timeline',
      ph: 'I',
      ts: 1_050_000,
      pid: 1,
      tid: 1,
      args: { data: { requestId: '1', mimeType: 'application/javascript', statusCode: 200 } },
    },
    {
      name: 'ResourceFinish',
      cat: 'devtools.timeline',
      ph: 'I',
      ts: 1_100_000,
      pid: 1,
      tid: 1,
      args: { data: { requestId: '1', encodedDataLength: 2048 } },
    },
    {
      name: 'ResourceSendRequest',
      cat: 'devtools.timeline',
      ph: 'I',
      ts: 1_010_000,
      pid: 1,
      tid: 1,
      args: { data: { requestId: '2', url: 'https://example.com/styles.css' } },
    },
    {
      name: 'ResourceReceiveResponse',
      cat: 'devtools.timeline',
      ph: 'I',
      ts: 1_060_000,
      pid: 1,
      tid: 1,
      args: { data: { requestId: '2', mimeType: 'text/css', statusCode: 200 } },
    },
    {
      name: 'ResourceFinish',
      cat: 'devtools.timeline',
      ph: 'I',
      ts: 1_090_000,
      pid: 1,
      tid: 1,
      args: { data: { requestId: '2', encodedDataLength: 512 } },
    },
  ],
  metadata: { traceStartTime: 0, traceEndTime: 2_000_000 },
  mainThreadId: 1,
  navigationStart: 900_000,
};

const emptyTrace: ParsedTrace = {
  traceEvents: [],
  metadata: { traceStartTime: 0, traceEndTime: 1_000_000 },
  mainThreadId: 1,
  navigationStart: 0,
};

describe('buildWaterfall', () => {
  it('extracts entries from trace events correctly', () => {
    const entries = buildWaterfall(mockTrace);
    expect(entries.length).toBe(2);

    const js = entries.find(e => e.url.includes('app.js'));
    expect(js).toBeDefined();
    expect(js!.mimeType).toBe('application/javascript');
    expect(js!.statusCode).toBe(200);
    expect(js!.sizeBytes).toBe(2048);
    // startMs = (1_000_000 - 900_000) / 1000 = 100ms
    expect(js!.startMs).toBeCloseTo(100, 1);
    // ttfbMs = (1_050_000 - 1_000_000) / 1000 = 50ms
    expect(js!.ttfbMs).toBeCloseTo(50, 1);
    // downloadMs = (1_100_000 - 1_050_000) / 1000 = 50ms
    expect(js!.downloadMs).toBeCloseTo(50, 1);
    expect(js!.shortName).toBe('app.js');

    const css = entries.find(e => e.url.includes('styles.css'));
    expect(css).toBeDefined();
    expect(css!.mimeType).toBe('text/css');
    expect(css!.sizeBytes).toBe(512);
  });

  it('sorts entries by startMs', () => {
    const entries = buildWaterfall(mockTrace);
    expect(entries[0].startMs).toBeLessThanOrEqual(entries[1].startMs);
  });

  it('returns empty array for trace with no network events', () => {
    const entries = buildWaterfall(emptyTrace);
    expect(entries).toEqual([]);
  });
});

describe('getMimeColor', () => {
  it('returns correct color for javascript', () => {
    expect(getMimeColor('application/javascript')).toBe('#f59e0b');
  });

  it('returns correct color for css', () => {
    expect(getMimeColor('text/css')).toBe('#8b5cf6');
  });

  it('returns fallback color for unknown mime type', () => {
    expect(getMimeColor('application/octet-stream')).toBe('#6b7280');
  });
});

describe('NetworkWaterfallComponent', () => {
  let fixture: ComponentFixture<NetworkWaterfallComponent>;
  let component: NetworkWaterfallComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NetworkWaterfallComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(NetworkWaterfallComponent);
    fixture.componentRef.setInput('trace', mockTrace);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('creates successfully', () => {
    expect(component).toBeTruthy();
  });

  it('computes correct number of entries', () => {
    expect(component.entries().length).toBe(2);
  });

  it('computes total size correctly', () => {
    expect(component.totalSize()).toBe(2048 + 512);
  });
});
