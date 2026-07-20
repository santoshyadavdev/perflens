import { TestBed } from '@angular/core/testing';
import { SectionCaptureService } from './section-capture.service';
import { SectionDefinition } from '../models/export.model';

// Mock html2canvas at module level
const mockCanvas = {
  toDataURL: vi.fn(() => 'data:image/png;base64,mockdata'),
  width: 800,
  height: 600,
};
vi.mock('html2canvas', () => ({
  default: vi.fn(() => Promise.resolve(mockCanvas)),
}));

describe('SectionCaptureService', () => {
  let service: SectionCaptureService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SectionCaptureService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('captureSection returns a CapturedSection with image data', async () => {
    const panel = document.createElement('div');
    panel.id = 'tab-panel-flamegraph';
    panel.setAttribute('hidden', '');
    document.body.appendChild(panel);

    const def: SectionDefinition = {
      id: 'flamegraph',
      title: 'Flamegraph',
      panelSelector: '#tab-panel-flamegraph',
    };

    const result = await service.captureSection(def);

    expect(result.id).toBe('flamegraph');
    expect(result.title).toBe('Flamegraph');
    expect(result.imageDataUrl).toBe('data:image/png;base64,mockdata');
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);

    // Panel should be re-hidden after capture
    expect(panel.hidden).toBe(true);

    document.body.removeChild(panel);
  });

  it('captureSection throws if panel element not found', async () => {
    const def: SectionDefinition = {
      id: 'missing',
      title: 'Missing',
      panelSelector: '#nonexistent',
    };

    await expect(service.captureSection(def)).rejects.toThrow('not found');
  });

  it('captureAllSections captures multiple sections in order', async () => {
    const panel1 = document.createElement('div');
    panel1.id = 'tab-panel-a';
    document.body.appendChild(panel1);

    const panel2 = document.createElement('div');
    panel2.id = 'tab-panel-b';
    document.body.appendChild(panel2);

    const defs: SectionDefinition[] = [
      { id: 'a', title: 'Section A', panelSelector: '#tab-panel-a' },
      { id: 'b', title: 'Section B', panelSelector: '#tab-panel-b' },
    ];

    const onProgress = vi.fn();
    const results = await service.captureAllSections(defs, onProgress);

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('a');
    expect(results[1].id).toBe('b');
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenCalledWith(0, 2, 'Section A');
    expect(onProgress).toHaveBeenCalledWith(1, 2, 'Section B');

    document.body.removeChild(panel1);
    document.body.removeChild(panel2);
  });

  it('captureAllSections respects abort signal', async () => {
    const panel = document.createElement('div');
    panel.id = 'tab-panel-abort';
    document.body.appendChild(panel);

    const defs: SectionDefinition[] = [
      { id: 'abort', title: 'Abort Test', panelSelector: '#tab-panel-abort' },
    ];

    const controller = new AbortController();
    controller.abort();

    await expect(
      service.captureAllSections(defs, vi.fn(), controller.signal)
    ).rejects.toThrow('cancelled');

    document.body.removeChild(panel);
  });

  it('captureAllSections aborts mid-flight when signal fires between sections', async () => {
    const panel1 = document.createElement('div');
    panel1.id = 'tab-panel-mid1';
    document.body.appendChild(panel1);

    const panel2 = document.createElement('div');
    panel2.id = 'tab-panel-mid2';
    document.body.appendChild(panel2);

    const defs: SectionDefinition[] = [
      { id: 'mid1', title: 'First', panelSelector: '#tab-panel-mid1' },
      { id: 'mid2', title: 'Second', panelSelector: '#tab-panel-mid2' },
    ];

    const controller = new AbortController();
    const onProgress = vi.fn((_i: number) => {
      if (_i === 0) controller.abort();
    });

    await expect(
      service.captureAllSections(defs, onProgress, controller.signal)
    ).rejects.toThrow('cancelled');

    // Only the first section's progress should have been reported
    expect(onProgress).toHaveBeenCalledTimes(1);

    document.body.removeChild(panel1);
    document.body.removeChild(panel2);
  });
});
