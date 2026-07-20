import { CapturedSection, ExportProgress, ExportFormat, SectionDefinition, SECTION_REGISTRY } from './export.model';

describe('Export models', () => {
  it('CapturedSection has required fields', () => {
    const section: CapturedSection = {
      id: 'flamegraph',
      title: 'Flamegraph',
      imageDataUrl: 'data:image/png;base64,abc',
      width: 800,
      height: 600,
    };
    expect(section.id).toBe('flamegraph');
    expect(section.title).toBe('Flamegraph');
    expect(section.imageDataUrl).toContain('data:image/png');
    expect(section.width).toBe(800);
    expect(section.height).toBe(600);
  });

  it('ExportProgress tracks phases correctly', () => {
    const progress: ExportProgress = {
      phase: 'capturing',
      currentSection: 'Flamegraph',
      currentStep: 2,
      totalSteps: 5,
      percentage: 40,
    };
    expect(progress.phase).toBe('capturing');
    expect(progress.percentage).toBe(40);
  });

  it('ExportProgress complete phase includes result', () => {
    const blob = new Blob(['test'], { type: 'application/pdf' });
    const progress: ExportProgress = {
      phase: 'complete',
      currentStep: 5,
      totalSteps: 5,
      percentage: 100,
      result: blob,
    };
    expect(progress.result).toBeInstanceOf(Blob);
  });

  it('ExportFormat is a union of pdf and html', () => {
    const pdf: ExportFormat = 'pdf';
    const html: ExportFormat = 'html';
    expect(pdf).toBe('pdf');
    expect(html).toBe('html');
  });

  it('SectionDefinition maps tab IDs to capture config', () => {
    const def: SectionDefinition = {
      id: 'flamegraph',
      title: 'Flamegraph',
      panelSelector: '#tab-panel-flamegraph',
    };
    expect(def.panelSelector).toBe('#tab-panel-flamegraph');
  });

  it('SECTION_REGISTRY has entries for all three formats', () => {
    expect(SECTION_REGISTRY['perf-trace'].length).toBeGreaterThan(0);
    expect(SECTION_REGISTRY['heap-snapshot'].length).toBeGreaterThan(0);
    expect(SECTION_REGISTRY['cpu-profile'].length).toBeGreaterThan(0);
  });
});
