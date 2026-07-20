# Export Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PDF and HTML report export to the PerfLens dashboard, capturing all visible sections as static images and structured text.

**Architecture:** Section-by-section capture using `html2canvas` to screenshot each dashboard panel, then assembly into PDF (via `jsPDF`) or self-contained HTML. An `ExportService` orchestrates the pipeline with progress updates streamed to an `ExportDialogComponent` modal.

**Tech Stack:** Angular 22 signals, jsPDF, html2canvas, Vitest + jsdom, Tailwind CSS

---

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install jspdf and html2canvas**

```bash
npm install jspdf html2canvas
```

- [ ] **Step 2: Verify installation**

Run: `node -e "require('jspdf'); require('html2canvas'); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add jspdf and html2canvas dependencies"
```

---

### Task 2: Export models and interfaces

**Files:**
- Create: `src/app/core/models/export.model.ts`
- Test: `src/app/core/models/export.model.spec.ts`

- [ ] **Step 1: Write the test for the export models**

Create `src/app/core/models/export.model.spec.ts`:

```typescript
import { CapturedSection, ExportProgress, ExportFormat, SectionDefinition } from './export.model';

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
    const { SECTION_REGISTRY } = require('./export.model');
    expect(SECTION_REGISTRY['perf-trace'].length).toBeGreaterThan(0);
    expect(SECTION_REGISTRY['heap-snapshot'].length).toBeGreaterThan(0);
    expect(SECTION_REGISTRY['cpu-profile'].length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/core/models/export.model.spec.ts`
Expected: FAIL — module `./export.model` not found

- [ ] **Step 3: Create the export models**

Create `src/app/core/models/export.model.ts`:

```typescript
export type ExportFormat = 'pdf' | 'html';

export interface CapturedSection {
  id: string;
  title: string;
  imageDataUrl: string;
  width: number;
  height: number;
}

export interface ExportProgress {
  phase: 'capturing' | 'assembling' | 'complete' | 'error';
  currentSection?: string;
  currentStep: number;
  totalSteps: number;
  percentage: number;
  result?: Blob;
  error?: string;
}

export interface SectionDefinition {
  id: string;
  title: string;
  panelSelector: string;
}

export const SECTION_REGISTRY: Record<string, SectionDefinition[]> = {
  'perf-trace': [
    { id: 'action-items', title: 'Action Items', panelSelector: '#tab-panel-action-items' },
    { id: 'flamegraph', title: 'Flamegraph', panelSelector: '#tab-panel-flamegraph' },
    { id: 'timeline', title: 'Timeline', panelSelector: '#tab-panel-timeline' },
    { id: 'network', title: 'Network Waterfall', panelSelector: '#tab-panel-network' },
  ],
  'heap-snapshot': [
    { id: 'action-items', title: 'Action Items', panelSelector: '#tab-panel-action-items' },
    { id: 'memory', title: 'Memory', panelSelector: '#tab-panel-memory' },
  ],
  'cpu-profile': [
    { id: 'action-items', title: 'Action Items', panelSelector: '#tab-panel-action-items' },
    { id: 'cpu-profile', title: 'CPU Profile', panelSelector: '#tab-panel-cpu-profile' },
    { id: 'v8-internals', title: 'V8 Internals', panelSelector: '#tab-panel-v8-internals' },
  ],
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/core/models/export.model.spec.ts`
Expected: PASS — all 6 tests green

- [ ] **Step 5: Commit**

```bash
git add src/app/core/models/export.model.ts src/app/core/models/export.model.spec.ts
git commit -m "feat(export): add export models and section registry"
```

---

### Task 3: SectionCaptureService

**Files:**
- Create: `src/app/core/services/section-capture.service.ts`
- Test: `src/app/core/services/section-capture.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/core/services/section-capture.service.spec.ts`:

```typescript
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/core/services/section-capture.service.spec.ts`
Expected: FAIL — module `./section-capture.service` not found

- [ ] **Step 3: Write the implementation**

Create `src/app/core/services/section-capture.service.ts`:

```typescript
import { Injectable } from '@angular/core';
import html2canvas from 'html2canvas';
import { CapturedSection, SectionDefinition } from '../models/export.model';

const CAPTURE_OPTIONS = {
  useCORS: true,
  backgroundColor: '#0d1117',
  logging: false,
};

const RENDER_SETTLE_MS = 200;

@Injectable({ providedIn: 'root' })
export class SectionCaptureService {
  async captureSection(definition: SectionDefinition): Promise<CapturedSection> {
    const panel = document.querySelector(definition.panelSelector) as HTMLElement | null;
    if (!panel) {
      throw new Error(`Panel element "${definition.panelSelector}" not found in DOM`);
    }

    const wasHidden = panel.hidden;
    panel.hidden = false;

    try {
      await this.waitForRender();
      const canvas = await html2canvas(panel, CAPTURE_OPTIONS);
      return {
        id: definition.id,
        title: definition.title,
        imageDataUrl: canvas.toDataURL('image/png'),
        width: canvas.width,
        height: canvas.height,
      };
    } finally {
      panel.hidden = wasHidden;
    }
  }

  async captureAllSections(
    definitions: SectionDefinition[],
    onProgress: (current: number, total: number, sectionTitle: string) => void,
    abortSignal?: AbortSignal,
  ): Promise<CapturedSection[]> {
    const results: CapturedSection[] = [];

    for (let i = 0; i < definitions.length; i++) {
      if (abortSignal?.aborted) {
        throw new Error('Export cancelled');
      }
      onProgress(i, definitions.length, definitions[i].title);
      const captured = await this.captureSection(definitions[i]);
      results.push(captured);
    }

    return results;
  }

  private waitForRender(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, RENDER_SETTLE_MS));
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/core/services/section-capture.service.spec.ts`
Expected: PASS — all 4 tests green

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/section-capture.service.ts src/app/core/services/section-capture.service.spec.ts
git commit -m "feat(export): add SectionCaptureService with html2canvas integration"
```

---

### Task 4: PDF builder utility

**Files:**
- Create: `src/app/core/services/pdf-builder.ts`
- Test: `src/app/core/services/pdf-builder.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/core/services/pdf-builder.spec.ts`:

```typescript
import { buildPdf } from './pdf-builder';
import { CapturedSection } from '../models/export.model';
import { MetricScore } from '../models/metric-score.model';
import { ActionItem } from '../models/action-item.model';

// Mock jsPDF
const mockAddImage = vi.fn();
const mockAddPage = vi.fn();
const mockSetFontSize = vi.fn();
const mockSetTextColor = vi.fn();
const mockSetFont = vi.fn();
const mockText = vi.fn();
const mockOutput = vi.fn(() => new ArrayBuffer(8));
const mockGetNumberOfPages = vi.fn(() => 1);
const mockSetPage = vi.fn();
const mockInternal = { pageSize: { getWidth: () => 297, getHeight: () => 210 } };

vi.mock('jspdf', () => ({
  jsPDF: vi.fn().mockImplementation(() => ({
    addImage: mockAddImage,
    addPage: mockAddPage,
    setFontSize: mockSetFontSize,
    setTextColor: mockSetTextColor,
    setFont: mockSetFont,
    text: mockText,
    output: mockOutput,
    getNumberOfPages: mockGetNumberOfPages,
    setPage: mockSetPage,
    internal: mockInternal,
  })),
}));

describe('buildPdf', () => {
  const mockSections: CapturedSection[] = [
    {
      id: 'flamegraph',
      title: 'Flamegraph',
      imageDataUrl: 'data:image/png;base64,abc',
      width: 800,
      height: 600,
    },
  ];

  const mockMetrics: MetricScore[] = [
    { name: 'Largest Contentful Paint', shortName: 'LCP', value: 2000, displayValue: '2.0s', unit: 'ms', rating: 'good' },
  ];

  const mockActionItems: ActionItem[] = [
    { id: 'a1', severity: 'critical', title: 'Fix LCP', detail: 'LCP is too slow', metric: 'LCP', fix: 'Optimize images' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a Blob with PDF content type', () => {
    const result = buildPdf({
      sections: mockSections,
      metrics: mockMetrics,
      actionItems: mockActionItems,
      fileName: 'trace.json',
      fileSize: 1024,
      analyzedAt: new Date('2026-07-20T12:00:00Z'),
    });

    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe('application/pdf');
  });

  it('creates a landscape A4 document', () => {
    const { jsPDF } = require('jspdf');

    buildPdf({
      sections: mockSections,
      metrics: mockMetrics,
      actionItems: mockActionItems,
      fileName: 'trace.json',
      fileSize: 1024,
      analyzedAt: new Date('2026-07-20T12:00:00Z'),
    });

    expect(jsPDF).toHaveBeenCalledWith({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });
  });

  it('renders the cover page with file info', () => {
    buildPdf({
      sections: mockSections,
      metrics: mockMetrics,
      actionItems: [],
      fileName: 'my-trace.json',
      fileSize: 2048,
      analyzedAt: new Date('2026-07-20T12:00:00Z'),
    });

    const allTextCalls = mockText.mock.calls.map(c => c[0]);
    expect(allTextCalls.some((t: string) => t.includes('PerfLens'))).toBe(true);
    expect(allTextCalls.some((t: string) => t.includes('my-trace.json'))).toBe(true);
  });

  it('adds a page per section with section image', () => {
    buildPdf({
      sections: mockSections,
      metrics: mockMetrics,
      actionItems: [],
      fileName: 'trace.json',
      fileSize: 1024,
      analyzedAt: new Date('2026-07-20T12:00:00Z'),
    });

    expect(mockAddPage).toHaveBeenCalled();
    expect(mockAddImage).toHaveBeenCalledWith(
      'data:image/png;base64,abc',
      'PNG',
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('renders action items as text table', () => {
    buildPdf({
      sections: mockSections,
      metrics: mockMetrics,
      actionItems: mockActionItems,
      fileName: 'trace.json',
      fileSize: 1024,
      analyzedAt: new Date('2026-07-20T12:00:00Z'),
    });

    const allTextCalls = mockText.mock.calls.map(c => c[0]);
    expect(allTextCalls.some((t: string) => t.includes('Fix LCP'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/core/services/pdf-builder.spec.ts`
Expected: FAIL — module `./pdf-builder` not found

- [ ] **Step 3: Write the implementation**

Create `src/app/core/services/pdf-builder.ts`:

```typescript
import { jsPDF } from 'jspdf';
import { CapturedSection } from '../models/export.model';
import { MetricScore } from '../models/metric-score.model';
import { ActionItem, Severity } from '../models/action-item.model';

const MARGIN = 15; // mm
const PAGE_WIDTH = 297; // A4 landscape
const PAGE_HEIGHT = 210;
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;
const CONTENT_HEIGHT = PAGE_HEIGHT - 2 * MARGIN;

export interface PdfBuildInput {
  sections: CapturedSection[];
  metrics: MetricScore[];
  actionItems: ActionItem[];
  fileName: string;
  fileSize: number;
  analyzedAt: Date;
}

export function buildPdf(input: PdfBuildInput): Blob {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  renderCoverPage(doc, input);

  if (input.actionItems.length > 0) {
    doc.addPage();
    renderActionItemsPage(doc, input.actionItems);
  }

  for (const section of input.sections) {
    doc.addPage();
    renderSectionPage(doc, section);
  }

  renderFooters(doc, input.analyzedAt);

  const arrayBuffer = doc.output('arraybuffer');
  return new Blob([arrayBuffer], { type: 'application/pdf' });
}

function renderCoverPage(doc: jsPDF, input: PdfBuildInput): void {
  let y = 40;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(16, 185, 129); // emerald-500
  doc.text('⚡ PerfLens Report', MARGIN, y);
  y += 20;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.setTextColor(60, 60, 60);
  doc.text(`File: ${input.fileName}`, MARGIN, y);
  y += 8;

  const fileSizeStr = input.fileSize < 1024 * 1024
    ? `${(input.fileSize / 1024).toFixed(1)} KB`
    : `${(input.fileSize / (1024 * 1024)).toFixed(1)} MB`;
  doc.text(`Size: ${fileSizeStr}`, MARGIN, y);
  y += 8;

  doc.text(`Analyzed: ${input.analyzedAt.toISOString().split('T')[0]}`, MARGIN, y);
  y += 16;

  if (input.metrics.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(30, 30, 30);
    doc.text('Performance Metrics', MARGIN, y);
    y += 10;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);

    for (const metric of input.metrics) {
      const color = ratingColor(metric.rating);
      doc.setTextColor(...color);
      doc.text(`${metric.shortName}: ${metric.displayValue}  (${metric.rating})`, MARGIN + 4, y);
      y += 7;
    }
  }
}

function renderActionItemsPage(doc: jsPDF, items: ActionItem[]): void {
  let y = MARGIN;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(30, 30, 30);
  doc.text('Action Items', MARGIN, y);
  y += 10;

  doc.setFontSize(10);

  for (const item of items) {
    if (y > PAGE_HEIGHT - MARGIN - 20) {
      doc.addPage();
      y = MARGIN;
    }

    const color = severityColor(item.severity);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...color);
    doc.text(`[${item.severity.toUpperCase()}]`, MARGIN, y);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    doc.text(`${item.title}`, MARGIN + 25, y);
    y += 5;

    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    const detailLines = doc.splitTextToSize(item.detail, CONTENT_WIDTH - 25);
    doc.text(detailLines, MARGIN + 25, y);
    y += detailLines.length * 4 + 4;
    doc.setFontSize(10);
  }
}

function renderSectionPage(doc: jsPDF, section: CapturedSection): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(30, 30, 30);
  doc.text(section.title, MARGIN, MARGIN + 5);

  const imageY = MARGIN + 12;
  const availableHeight = PAGE_HEIGHT - imageY - MARGIN;
  const aspectRatio = section.width / section.height;
  let imgWidth = CONTENT_WIDTH;
  let imgHeight = imgWidth / aspectRatio;

  if (imgHeight > availableHeight) {
    imgHeight = availableHeight;
    imgWidth = imgHeight * aspectRatio;
  }

  doc.addImage(section.imageDataUrl, 'PNG', MARGIN, imageY, imgWidth, imgHeight);
}

function renderFooters(doc: jsPDF, analyzedAt: Date): void {
  const totalPages = doc.getNumberOfPages();
  const dateStr = analyzedAt.toISOString().split('T')[0];

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Generated by PerfLens • ${dateStr} • Page ${i} of ${totalPages}`,
      PAGE_WIDTH / 2,
      PAGE_HEIGHT - 5,
      { align: 'center' },
    );
  }
}

function severityColor(severity: Severity): [number, number, number] {
  switch (severity) {
    case 'critical': return [220, 38, 38];   // red-600
    case 'warning': return [217, 119, 6];    // amber-600
    case 'info': return [37, 99, 235];       // blue-600
  }
}

function ratingColor(rating: string): [number, number, number] {
  switch (rating) {
    case 'good': return [22, 163, 74];          // green-600
    case 'needs-improvement': return [217, 119, 6]; // amber-600
    case 'poor': return [220, 38, 38];          // red-600
    default: return [60, 60, 60];
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/core/services/pdf-builder.spec.ts`
Expected: PASS — all 5 tests green

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/pdf-builder.ts src/app/core/services/pdf-builder.spec.ts
git commit -m "feat(export): add PDF builder utility with cover page, action items, and section images"
```

---

### Task 5: HTML builder utility

**Files:**
- Create: `src/app/core/services/html-builder.ts`
- Test: `src/app/core/services/html-builder.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/core/services/html-builder.spec.ts`:

```typescript
import { buildHtml } from './html-builder';
import { CapturedSection } from '../models/export.model';
import { MetricScore } from '../models/metric-score.model';
import { ActionItem } from '../models/action-item.model';

describe('buildHtml', () => {
  const mockSections: CapturedSection[] = [
    {
      id: 'flamegraph',
      title: 'Flamegraph',
      imageDataUrl: 'data:image/png;base64,abc',
      width: 800,
      height: 600,
    },
  ];

  const mockMetrics: MetricScore[] = [
    { name: 'Largest Contentful Paint', shortName: 'LCP', value: 2000, displayValue: '2.0s', unit: 'ms', rating: 'good' },
  ];

  const mockActionItems: ActionItem[] = [
    { id: 'a1', severity: 'critical', title: 'Fix LCP', detail: 'LCP is too slow', metric: 'LCP', fix: 'Optimize images' },
  ];

  it('returns a Blob with html content type', () => {
    const result = buildHtml({
      sections: mockSections,
      metrics: mockMetrics,
      actionItems: mockActionItems,
      fileName: 'trace.json',
      fileSize: 1024,
      analyzedAt: new Date('2026-07-20T12:00:00Z'),
    });

    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe('text/html');
  });

  it('includes DOCTYPE and basic HTML structure', async () => {
    const result = buildHtml({
      sections: mockSections,
      metrics: mockMetrics,
      actionItems: [],
      fileName: 'trace.json',
      fileSize: 1024,
      analyzedAt: new Date('2026-07-20T12:00:00Z'),
    });

    const text = await result.text();
    expect(text).toContain('<!DOCTYPE html>');
    expect(text).toContain('<html lang="en">');
    expect(text).toContain('</html>');
  });

  it('includes the file name in the title and header', async () => {
    const result = buildHtml({
      sections: mockSections,
      metrics: mockMetrics,
      actionItems: [],
      fileName: 'my-trace.json',
      fileSize: 1024,
      analyzedAt: new Date('2026-07-20T12:00:00Z'),
    });

    const text = await result.text();
    expect(text).toContain('PerfLens Report');
    expect(text).toContain('my-trace.json');
  });

  it('includes metrics in the report', async () => {
    const result = buildHtml({
      sections: mockSections,
      metrics: mockMetrics,
      actionItems: [],
      fileName: 'trace.json',
      fileSize: 1024,
      analyzedAt: new Date('2026-07-20T12:00:00Z'),
    });

    const text = await result.text();
    expect(text).toContain('LCP');
    expect(text).toContain('2.0s');
  });

  it('includes action items as an HTML table', async () => {
    const result = buildHtml({
      sections: mockSections,
      metrics: mockMetrics,
      actionItems: mockActionItems,
      fileName: 'trace.json',
      fileSize: 1024,
      analyzedAt: new Date('2026-07-20T12:00:00Z'),
    });

    const text = await result.text();
    expect(text).toContain('<table');
    expect(text).toContain('Fix LCP');
    expect(text).toContain('CRITICAL');
  });

  it('embeds section images as base64 img tags', async () => {
    const result = buildHtml({
      sections: mockSections,
      metrics: mockMetrics,
      actionItems: [],
      fileName: 'trace.json',
      fileSize: 1024,
      analyzedAt: new Date('2026-07-20T12:00:00Z'),
    });

    const text = await result.text();
    expect(text).toContain('<img');
    expect(text).toContain('data:image/png;base64,abc');
    expect(text).toContain('Flamegraph');
  });

  it('includes inlined styles', async () => {
    const result = buildHtml({
      sections: mockSections,
      metrics: mockMetrics,
      actionItems: [],
      fileName: 'trace.json',
      fileSize: 1024,
      analyzedAt: new Date('2026-07-20T12:00:00Z'),
    });

    const text = await result.text();
    expect(text).toContain('<style>');
    expect(text).toContain('@media print');
  });

  it('includes a footer', async () => {
    const result = buildHtml({
      sections: [],
      metrics: [],
      actionItems: [],
      fileName: 'trace.json',
      fileSize: 1024,
      analyzedAt: new Date('2026-07-20T12:00:00Z'),
    });

    const text = await result.text();
    expect(text).toContain('Generated by PerfLens');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/core/services/html-builder.spec.ts`
Expected: FAIL — module `./html-builder` not found

- [ ] **Step 3: Write the implementation**

Create `src/app/core/services/html-builder.ts`:

```typescript
import { CapturedSection } from '../models/export.model';
import { MetricScore } from '../models/metric-score.model';
import { ActionItem } from '../models/action-item.model';

export interface HtmlBuildInput {
  sections: CapturedSection[];
  metrics: MetricScore[];
  actionItems: ActionItem[];
  fileName: string;
  fileSize: number;
  analyzedAt: Date;
}

export function buildHtml(input: HtmlBuildInput): Blob {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PerfLens Report — ${escapeHtml(input.fileName)}</title>
  <style>${getStyles()}</style>
</head>
<body>
  <header class="report-header">
    <h1>⚡ PerfLens Report</h1>
    <div class="meta">
      <span>File: ${escapeHtml(input.fileName)}</span>
      <span>Size: ${formatFileSize(input.fileSize)}</span>
      <span>Analyzed: ${input.analyzedAt.toISOString().split('T')[0]}</span>
    </div>
  </header>

  ${renderMetricsSection(input.metrics)}
  ${renderActionItemsSection(input.actionItems)}
  ${renderCapturedSections(input.sections)}

  <footer class="report-footer">
    Generated by PerfLens • ${input.analyzedAt.toISOString().split('T')[0]}
  </footer>
</body>
</html>`;

  return new Blob([html], { type: 'text/html' });
}

function renderMetricsSection(metrics: MetricScore[]): string {
  if (metrics.length === 0) return '';

  const cards = metrics.map(m => `
    <div class="metric-card metric-${m.rating}">
      <div class="metric-name">${escapeHtml(m.shortName)}</div>
      <div class="metric-value">${escapeHtml(m.displayValue)}</div>
      <div class="metric-rating">${escapeHtml(m.rating)}</div>
    </div>
  `).join('');

  return `<section class="metrics"><h2>Performance Metrics</h2><div class="metric-grid">${cards}</div></section>`;
}

function renderActionItemsSection(items: ActionItem[]): string {
  if (items.length === 0) return '';

  const rows = items.map(item => `
    <tr>
      <td><span class="severity severity-${item.severity}">${item.severity.toUpperCase()}</span></td>
      <td><span class="metric-tag">${escapeHtml(item.metric)}</span></td>
      <td><strong>${escapeHtml(item.title)}</strong><br><span class="detail">${escapeHtml(item.detail)}</span></td>
      <td class="fix">${escapeHtml(item.fix)}</td>
    </tr>
  `).join('');

  return `
    <section class="action-items">
      <h2>Action Items</h2>
      <table>
        <thead><tr><th>Severity</th><th>Metric</th><th>Issue</th><th>Fix</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function renderCapturedSections(sections: CapturedSection[]): string {
  return sections.map(section => `
    <section class="captured-section">
      <h2>${escapeHtml(section.title)}</h2>
      <img src="${section.imageDataUrl}" alt="${escapeHtml(section.title)}" style="max-width:100%; height:auto;">
    </section>
  `).join('');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getStyles(): string {
  return `
    :root { --bg: #0d1117; --card-bg: #1a1f2e; --text: #e6edf3; --text-muted: #8b949e; --green: #10b981; --amber: #f59e0b; --red: #ef4444; --blue: #3b82f6; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; padding: 2rem; max-width: 1200px; margin: 0 auto; }
    h1 { color: var(--green); font-size: 1.8rem; margin-bottom: 0.5rem; }
    h2 { color: var(--text); font-size: 1.3rem; margin: 2rem 0 1rem; border-bottom: 1px solid #30363d; padding-bottom: 0.5rem; }
    .report-header { margin-bottom: 2rem; }
    .meta { display: flex; gap: 2rem; color: var(--text-muted); font-size: 0.9rem; }
    .metric-grid { display: flex; gap: 1rem; flex-wrap: wrap; }
    .metric-card { background: var(--card-bg); border-radius: 8px; padding: 1rem; text-align: center; min-width: 120px; flex: 1; border-left: 3px solid var(--text-muted); }
    .metric-good { border-left-color: var(--green); }
    .metric-needs-improvement { border-left-color: var(--amber); }
    .metric-poor { border-left-color: var(--red); }
    .metric-name { font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em; }
    .metric-value { font-size: 1.5rem; font-weight: bold; margin: 0.25rem 0; }
    .metric-rating { font-size: 0.75rem; color: var(--text-muted); }
    table { width: 100%; border-collapse: collapse; background: var(--card-bg); border-radius: 8px; overflow: hidden; }
    th, td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid #30363d; }
    th { background: #161b22; color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase; }
    .severity { font-size: 0.75rem; font-weight: 600; padding: 2px 8px; border-radius: 4px; }
    .severity-critical { background: rgba(239,68,68,0.2); color: var(--red); }
    .severity-warning { background: rgba(245,158,11,0.2); color: var(--amber); }
    .severity-info { background: rgba(59,130,246,0.2); color: var(--blue); }
    .metric-tag { font-size: 0.75rem; background: #21262d; color: var(--text-muted); padding: 2px 8px; border-radius: 4px; }
    .detail { color: var(--text-muted); font-size: 0.85rem; }
    .fix { color: var(--green); font-size: 0.85rem; }
    .captured-section img { border-radius: 8px; border: 1px solid #30363d; }
    .report-footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #30363d; color: var(--text-muted); font-size: 0.8rem; text-align: center; }

    @media print {
      :root { --bg: #fff; --card-bg: #f6f8fa; --text: #1f2328; --text-muted: #656d76; }
      body { padding: 1rem; }
      .captured-section img { border: 1px solid #d0d7de; }
    }
  `;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/core/services/html-builder.spec.ts`
Expected: PASS — all 7 tests green

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/html-builder.ts src/app/core/services/html-builder.spec.ts
git commit -m "feat(export): add HTML builder utility with self-contained report generation"
```

---

### Task 6: ExportService

**Files:**
- Create: `src/app/core/services/export.service.ts`
- Test: `src/app/core/services/export.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/core/services/export.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { ExportService } from './export.service';
import { SectionCaptureService } from './section-capture.service';
import { CapturedSection, ExportProgress } from '../models/export.model';
import { AnalysisResult } from '../models/analysis-result.model';

// Mock the builders
vi.mock('./pdf-builder', () => ({
  buildPdf: vi.fn(() => new Blob(['pdf'], { type: 'application/pdf' })),
}));
vi.mock('./html-builder', () => ({
  buildHtml: vi.fn(() => new Blob(['html'], { type: 'text/html' })),
}));

describe('ExportService', () => {
  let service: ExportService;
  let mockCaptureService: { captureAllSections: ReturnType<typeof vi.fn> };

  const mockCaptured: CapturedSection[] = [
    { id: 'action-items', title: 'Action Items', imageDataUrl: 'data:image/png;base64,a', width: 800, height: 400 },
    { id: 'flamegraph', title: 'Flamegraph', imageDataUrl: 'data:image/png;base64,b', width: 800, height: 600 },
  ];

  const mockResult: AnalysisResult = {
    fileName: 'trace.json',
    fileSize: 1024,
    analyzedAt: new Date('2026-07-20T12:00:00Z'),
    metrics: [{ name: 'LCP', shortName: 'LCP', value: 2000, displayValue: '2.0s', unit: 'ms', rating: 'good' }],
    actionItems: [{ id: 'a1', severity: 'critical', title: 'Fix', detail: 'Detail', metric: 'LCP', fix: 'Fix it' }],
    parsedTrace: { traceEvents: [], metadata: { traceStartTime: 0, traceEndTime: 0 }, mainThreadId: 0, navigationStart: 0 },
  };

  beforeEach(() => {
    mockCaptureService = {
      captureAllSections: vi.fn(async (_defs: unknown, onProgress: (i: number, t: number, s: string) => void) => {
        onProgress(0, 2, 'Action Items');
        onProgress(1, 2, 'Flamegraph');
        return mockCaptured;
      }),
    };

    TestBed.configureTestingModule({
      providers: [
        ExportService,
        { provide: SectionCaptureService, useValue: mockCaptureService },
      ],
    });
    service = TestBed.inject(ExportService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('export emits progress updates and completes with PDF blob', async () => {
    const updates: ExportProgress[] = [];

    const result = await new Promise<ExportProgress>((resolve) => {
      service.export('pdf', 'perf-trace', mockResult).subscribe(progress => {
        updates.push(progress);
        if (progress.phase === 'complete') {
          resolve(progress);
        }
      });
    });

    expect(result.phase).toBe('complete');
    expect(result.result).toBeInstanceOf(Blob);
    expect(result.result!.type).toBe('application/pdf');
    expect(updates.some(u => u.phase === 'capturing')).toBe(true);
    expect(updates.some(u => u.phase === 'assembling')).toBe(true);
  });

  it('export emits HTML blob when format is html', async () => {
    const result = await new Promise<ExportProgress>((resolve) => {
      service.export('html', 'perf-trace', mockResult).subscribe(progress => {
        if (progress.phase === 'complete') resolve(progress);
      });
    });

    expect(result.result!.type).toBe('text/html');
  });

  it('export emits error phase on failure', async () => {
    mockCaptureService.captureAllSections.mockRejectedValue(new Error('capture failed'));

    const result = await new Promise<ExportProgress>((resolve) => {
      service.export('pdf', 'perf-trace', mockResult).subscribe(progress => {
        if (progress.phase === 'error') resolve(progress);
      });
    });

    expect(result.phase).toBe('error');
    expect(result.error).toContain('capture failed');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/core/services/export.service.spec.ts`
Expected: FAIL — module `./export.service` not found

- [ ] **Step 3: Write the implementation**

Create `src/app/core/services/export.service.ts`:

```typescript
import { inject, Injectable } from '@angular/core';
import { Observable, Subscriber } from 'rxjs';
import { ExportFormat, ExportProgress, SECTION_REGISTRY } from '../models/export.model';
import { AnalysisResult } from '../models/analysis-result.model';
import { SectionCaptureService } from './section-capture.service';
import { buildPdf } from './pdf-builder';
import { buildHtml } from './html-builder';

@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly captureService = inject(SectionCaptureService);

  export(
    format: ExportFormat,
    fileFormat: string,
    result: AnalysisResult,
  ): Observable<ExportProgress> {
    return new Observable<ExportProgress>((subscriber) => {
      const controller = new AbortController();
      this.runExport(format, fileFormat, result, subscriber, controller.signal);
      return () => controller.abort();
    });
  }

  private async runExport(
    format: ExportFormat,
    fileFormat: string,
    result: AnalysisResult,
    subscriber: Subscriber<ExportProgress>,
    abortSignal: AbortSignal,
  ): Promise<void> {
    try {
      const definitions = SECTION_REGISTRY[fileFormat] ?? [];
      const totalSteps = definitions.length + 1; // +1 for assembly

      const sections = await this.captureService.captureAllSections(
        definitions,
        (current, total, sectionTitle) => {
          subscriber.next({
            phase: 'capturing',
            currentSection: sectionTitle,
            currentStep: current + 1,
            totalSteps,
            percentage: Math.round(((current + 1) / totalSteps) * 100),
          });
        },
        abortSignal,
      );

      if (abortSignal.aborted) return;

      subscriber.next({
        phase: 'assembling',
        currentStep: totalSteps,
        totalSteps,
        percentage: 90,
      });

      const buildInput = {
        sections,
        metrics: result.metrics,
        actionItems: result.actionItems,
        fileName: result.fileName,
        fileSize: result.fileSize,
        analyzedAt: result.analyzedAt,
      };

      const blob = format === 'pdf'
        ? buildPdf(buildInput)
        : buildHtml(buildInput);

      subscriber.next({
        phase: 'complete',
        currentStep: totalSteps,
        totalSteps,
        percentage: 100,
        result: blob,
      });
      subscriber.complete();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed';
      subscriber.next({
        phase: 'error',
        currentStep: 0,
        totalSteps: 0,
        percentage: 0,
        error: message,
      });
      subscriber.complete();
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/core/services/export.service.spec.ts`
Expected: PASS — all 4 tests green

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/export.service.ts src/app/core/services/export.service.spec.ts
git commit -m "feat(export): add ExportService orchestrating capture and assembly pipeline"
```

---

### Task 7: ExportDialogComponent

**Files:**
- Create: `src/app/features/dashboard/export-dialog.component.ts`
- Test: `src/app/features/dashboard/export-dialog.component.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/features/dashboard/export-dialog.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExportDialogComponent } from './export-dialog.component';
import { ExportService } from '../../core/services/export.service';
import { Subject } from 'rxjs';
import { ExportProgress } from '../../core/models/export.model';
import { AnalysisResult } from '../../core/models/analysis-result.model';

describe('ExportDialogComponent', () => {
  let fixture: ComponentFixture<ExportDialogComponent>;
  let component: ExportDialogComponent;
  let mockExportService: { export: ReturnType<typeof vi.fn> };
  let progressSubject: Subject<ExportProgress>;

  const mockResult: AnalysisResult = {
    fileName: 'trace.json',
    fileSize: 1024,
    analyzedAt: new Date('2026-07-20T12:00:00Z'),
    metrics: [],
    actionItems: [],
    parsedTrace: { traceEvents: [], metadata: { traceStartTime: 0, traceEndTime: 0 }, mainThreadId: 0, navigationStart: 0 },
  };

  beforeEach(async () => {
    progressSubject = new Subject<ExportProgress>();
    mockExportService = {
      export: vi.fn(() => progressSubject.asObservable()),
    };

    await TestBed.configureTestingModule({
      imports: [ExportDialogComponent],
      providers: [
        { provide: ExportService, useValue: mockExportService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ExportDialogComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('result', mockResult);
    fixture.componentRef.setInput('fileFormat', 'perf-trace');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows format selection by default', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('PDF Report');
    expect(el.textContent).toContain('HTML Report');
  });

  it('starts PDF export when PDF button is clicked', () => {
    const pdfBtn = fixture.nativeElement.querySelector('[data-testid="export-pdf"]') as HTMLButtonElement;
    pdfBtn.click();
    fixture.detectChanges();

    expect(mockExportService.export).toHaveBeenCalledWith('pdf', 'perf-trace', mockResult);
  });

  it('starts HTML export when HTML button is clicked', () => {
    const htmlBtn = fixture.nativeElement.querySelector('[data-testid="export-html"]') as HTMLButtonElement;
    htmlBtn.click();
    fixture.detectChanges();

    expect(mockExportService.export).toHaveBeenCalledWith('html', 'perf-trace', mockResult);
  });

  it('shows progress bar during capture phase', () => {
    const pdfBtn = fixture.nativeElement.querySelector('[data-testid="export-pdf"]') as HTMLButtonElement;
    pdfBtn.click();
    fixture.detectChanges();

    progressSubject.next({
      phase: 'capturing',
      currentSection: 'Flamegraph',
      currentStep: 2,
      totalSteps: 5,
      percentage: 40,
    });
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Flamegraph');
    expect(el.querySelector('[data-testid="progress-bar"]')).toBeTruthy();
  });

  it('shows download button when complete', () => {
    const pdfBtn = fixture.nativeElement.querySelector('[data-testid="export-pdf"]') as HTMLButtonElement;
    pdfBtn.click();
    fixture.detectChanges();

    progressSubject.next({
      phase: 'complete',
      currentStep: 5,
      totalSteps: 5,
      percentage: 100,
      result: new Blob(['pdf'], { type: 'application/pdf' }),
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="download-btn"]')).toBeTruthy();
  });

  it('shows error message on failure', () => {
    const pdfBtn = fixture.nativeElement.querySelector('[data-testid="export-pdf"]') as HTMLButtonElement;
    pdfBtn.click();
    fixture.detectChanges();

    progressSubject.next({
      phase: 'error',
      currentStep: 0,
      totalSteps: 0,
      percentage: 0,
      error: 'Capture failed',
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Capture failed');
  });

  it('emits close event when cancel is clicked', () => {
    const closeSpy = vi.fn();
    component.close.subscribe(closeSpy);

    const cancelBtn = fixture.nativeElement.querySelector('[data-testid="cancel-btn"]') as HTMLButtonElement;
    cancelBtn.click();

    expect(closeSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/features/dashboard/export-dialog.component.spec.ts`
Expected: FAIL — module `./export-dialog.component` not found

- [ ] **Step 3: Write the implementation**

Create `src/app/features/dashboard/export-dialog.component.ts`:

```typescript
import { Component, inject, input, output, signal, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { ExportService } from '../../core/services/export.service';
import { ExportFormat, ExportProgress } from '../../core/models/export.model';
import { AnalysisResult } from '../../core/models/analysis-result.model';

type DialogState = 'select' | 'progress' | 'complete' | 'error';

@Component({
  selector: 'app-export-dialog',
  standalone: true,
  template: `
    <div
      class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      (click)="onBackdropClick($event)"
      (keydown.escape)="onClose()"
      role="dialog"
      aria-modal="true"
      aria-label="Export report"
    >
      <div class="bg-[#161b26] rounded-xl p-6 w-full max-w-md shadow-xl border border-gray-800">
        @switch (state()) {
          @case ('select') {
            <h2 class="text-lg font-semibold text-white mb-4">Export Report</h2>
            <div class="space-y-3">
              <button
                data-testid="export-pdf"
                class="w-full bg-[#1a1f2e] hover:bg-[#252b3b] border border-gray-700 rounded-lg p-4 text-left transition-colors"
                (click)="startExport('pdf')"
              >
                <div class="text-white font-medium">📄 PDF Report</div>
                <div class="text-gray-400 text-sm mt-1">Printable document with charts and action items</div>
              </button>
              <button
                data-testid="export-html"
                class="w-full bg-[#1a1f2e] hover:bg-[#252b3b] border border-gray-700 rounded-lg p-4 text-left transition-colors"
                (click)="startExport('html')"
              >
                <div class="text-white font-medium">🌐 HTML Report</div>
                <div class="text-gray-400 text-sm mt-1">Self-contained web page, works offline</div>
              </button>
            </div>
            <button
              data-testid="cancel-btn"
              class="mt-4 w-full text-gray-400 hover:text-white text-sm py-2 transition-colors"
              (click)="onClose()"
            >
              Cancel
            </button>
          }

          @case ('progress') {
            <h2 class="text-lg font-semibold text-white mb-4">Generating Report...</h2>
            <div class="space-y-3">
              <div class="text-gray-300 text-sm">
                {{ progress()?.currentSection ? 'Capturing ' + progress()?.currentSection + '...' : 'Assembling report...' }}
                <span class="text-gray-500 ml-1">
                  ({{ progress()?.currentStep }}/{{ progress()?.totalSteps }})
                </span>
              </div>
              <div data-testid="progress-bar" class="w-full bg-gray-700 rounded-full h-3">
                <div
                  class="bg-emerald-500 h-3 rounded-full transition-all"
                  [style.width.%]="progress()?.percentage ?? 0"
                ></div>
              </div>
              <div class="text-gray-500 text-sm text-center">{{ progress()?.percentage ?? 0 }}%</div>
            </div>
            <button
              data-testid="cancel-btn"
              class="mt-4 w-full text-gray-400 hover:text-white text-sm py-2 transition-colors"
              (click)="cancelExport()"
            >
              Cancel
            </button>
          }

          @case ('complete') {
            <div class="text-center py-4">
              <div class="text-3xl mb-2">✅</div>
              <h2 class="text-lg font-semibold text-white mb-1">Report Ready!</h2>
              <p class="text-gray-400 text-sm mb-4">Your report has been generated successfully.</p>
              <button
                data-testid="download-btn"
                class="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-3 font-medium transition-colors"
                (click)="downloadResult()"
              >
                ⬇ Download
              </button>
              <button
                class="mt-2 w-full text-gray-400 hover:text-white text-sm py-2 transition-colors"
                (click)="onClose()"
              >
                Close
              </button>
            </div>
          }

          @case ('error') {
            <div class="text-center py-4">
              <div class="text-3xl mb-2">❌</div>
              <h2 class="text-lg font-semibold text-white mb-1">Export Failed</h2>
              <p class="text-red-400 text-sm mb-4">{{ errorMessage() }}</p>
              <button
                class="w-full bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-3 font-medium transition-colors"
                (click)="resetToSelect()"
              >
                Try Again
              </button>
              <button
                data-testid="cancel-btn"
                class="mt-2 w-full text-gray-400 hover:text-white text-sm py-2 transition-colors"
                (click)="onClose()"
              >
                Close
              </button>
            </div>
          }
        }
      </div>
    </div>
  `,
})
export class ExportDialogComponent implements OnDestroy {
  private readonly exportService = inject(ExportService);

  result = input.required<AnalysisResult>();
  fileFormat = input.required<string>();
  close = output<void>();

  state = signal<DialogState>('select');
  progress = signal<ExportProgress | null>(null);
  errorMessage = signal('');
  private resultBlob: Blob | null = null;
  private exportFormat: ExportFormat = 'pdf';
  private subscription: Subscription | null = null;

  startExport(format: ExportFormat): void {
    this.exportFormat = format;
    this.state.set('progress');

    this.subscription = this.exportService
      .export(format, this.fileFormat(), this.result())
      .subscribe((update) => {
        this.progress.set(update);

        if (update.phase === 'complete' && update.result) {
          this.resultBlob = update.result;
          this.state.set('complete');
        } else if (update.phase === 'error') {
          this.errorMessage.set(update.error ?? 'Unknown error');
          this.state.set('error');
        }
      });
  }

  cancelExport(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.onClose();
  }

  downloadResult(): void {
    if (!this.resultBlob) return;

    const extension = this.exportFormat === 'pdf' ? 'pdf' : 'html';
    const baseName = this.result().fileName.replace(/\.[^.]+$/, '');
    const downloadName = `${baseName}-perflens-report.${extension}`;

    const url = URL.createObjectURL(this.resultBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  resetToSelect(): void {
    this.state.set('select');
    this.progress.set(null);
    this.errorMessage.set('');
    this.resultBlob = null;
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('fixed')) {
      this.onClose();
    }
  }

  onClose(): void {
    this.close.emit();
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/features/dashboard/export-dialog.component.spec.ts`
Expected: PASS — all 7 tests green

- [ ] **Step 5: Commit**

```bash
git add src/app/features/dashboard/export-dialog.component.ts src/app/features/dashboard/export-dialog.component.spec.ts
git commit -m "feat(export): add ExportDialogComponent with format selection, progress, and download"
```

---

### Task 8: Integrate export into DashboardComponent

**Files:**
- Modify: `src/app/features/dashboard/dashboard.component.ts`
- Modify: `src/app/features/dashboard/dashboard.component.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add these tests to the end of the existing `describe('DashboardComponent', ...)` block in `src/app/features/dashboard/dashboard.component.spec.ts`:

```typescript
  it('renders a clickable Export button in the nav', () => {
    const exportBtn = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (btn: HTMLButtonElement) => btn.textContent?.includes('Export')
    ) as HTMLButtonElement | undefined;
    expect(exportBtn).toBeTruthy();
    expect(exportBtn!.disabled).toBeFalsy();
  });

  it('shows export dialog when Export button is clicked', () => {
    const exportBtn = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (btn: HTMLButtonElement) => btn.textContent?.includes('Export')
    ) as HTMLButtonElement;

    exportBtn.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-export-dialog')).toBeTruthy();
  });

  it('hides export dialog when close event fires', () => {
    fixture.componentInstance.showExportDialog.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-export-dialog')).toBeTruthy();

    fixture.componentInstance.showExportDialog.set(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-export-dialog')).toBeFalsy();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/features/dashboard/dashboard.component.spec.ts`
Expected: FAIL — `showExportDialog` not found on component / Export button is disabled

- [ ] **Step 3: Update DashboardComponent**

In `src/app/features/dashboard/dashboard.component.ts`, make these changes:

**Add import for ExportDialogComponent** (at the top with the other imports):

```typescript
import { ExportDialogComponent } from './export-dialog.component';
```

**Add ExportDialogComponent to the imports array** of the `@Component` decorator:

Add `ExportDialogComponent` to the existing `imports: [...]` array.

**Update the nav bar** — replace the disabled Export button:

Replace:
```html
<button class="hover:text-white transition-colors" disabled>Export</button>
```
With:
```html
<button class="hover:text-white transition-colors" (click)="showExportDialog.set(true)">Export</button>
```

**Add the export dialog** at the very end of the template, right before the closing `</div>` of the outermost `<div class="min-h-screen">`:

```html
@if (showExportDialog()) {
  <app-export-dialog
    [result]="result()!"
    [fileFormat]="fileFormat()!"
    (close)="showExportDialog.set(false)"
  />
}
```

**Add the signal** to the component class body (alongside the other signals):

```typescript
showExportDialog = signal(false);
```

**Make `fileFormat` readable** — it's currently `private`. Change the declaration from:

```typescript
private readonly fileFormat = signal<'perf-trace' | 'heap-snapshot' | 'cpu-profile' | null>(null);
```

To:

```typescript
readonly fileFormat = signal<'perf-trace' | 'heap-snapshot' | 'cpu-profile' | null>(null);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/features/dashboard/dashboard.component.spec.ts`
Expected: PASS — all existing + 3 new tests green

- [ ] **Step 5: Run all tests to verify nothing is broken**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/features/dashboard/dashboard.component.ts src/app/features/dashboard/dashboard.component.spec.ts
git commit -m "feat(export): integrate export dialog into dashboard nav bar"
```

---

### Task 9: Download helper and file naming

**Files:**
- Create: `src/app/core/utils/download.ts`
- Test: `src/app/core/utils/download.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/core/utils/download.spec.ts`:

```typescript
import { generateReportFilename } from './download';

describe('generateReportFilename', () => {
  it('generates PDF filename from source file', () => {
    expect(generateReportFilename('trace.json', 'pdf')).toBe('trace-perflens-report.pdf');
  });

  it('generates HTML filename from source file', () => {
    expect(generateReportFilename('trace.json', 'html')).toBe('trace-perflens-report.html');
  });

  it('handles files with multiple dots', () => {
    expect(generateReportFilename('my.trace.json.gz', 'pdf')).toBe('my.trace.json-perflens-report.pdf');
  });

  it('handles heap snapshot files', () => {
    expect(generateReportFilename('Heap.20260720.heapsnapshot', 'html')).toBe('Heap.20260720-perflens-report.html');
  });

  it('handles cpu profile files', () => {
    expect(generateReportFilename('profile.cpuprofile', 'pdf')).toBe('profile-perflens-report.pdf');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/core/utils/download.spec.ts`
Expected: FAIL — module `./download` not found

- [ ] **Step 3: Write the implementation**

Create `src/app/core/utils/download.ts`:

```typescript
import { ExportFormat } from '../models/export.model';

export function generateReportFilename(sourceFileName: string, format: ExportFormat): string {
  const lastDot = sourceFileName.lastIndexOf('.');
  const baseName = lastDot > 0 ? sourceFileName.substring(0, lastDot) : sourceFileName;
  return `${baseName}-perflens-report.${format}`;
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/core/utils/download.spec.ts`
Expected: PASS — all 5 tests green

- [ ] **Step 5: Update ExportDialogComponent to use shared download utility**

In `src/app/features/dashboard/export-dialog.component.ts`, replace the `downloadResult()` method to use the shared utility:

Add imports at the top:
```typescript
import { generateReportFilename, triggerDownload } from '../../core/utils/download';
```

Replace the `downloadResult()` method body:
```typescript
  downloadResult(): void {
    if (!this.resultBlob) return;
    const filename = generateReportFilename(this.result().fileName, this.exportFormat);
    triggerDownload(this.resultBlob, filename);
  }
```

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/core/utils/download.ts src/app/core/utils/download.spec.ts src/app/features/dashboard/export-dialog.component.ts
git commit -m "feat(export): add download helper utility and wire into export dialog"
```

---

### Task 10: Final integration test and cleanup

**Files:**
- Modify: `src/app/features/dashboard/dashboard.component.spec.ts` (verify full flow)

- [ ] **Step 1: Add an integration-level test**

Add this test to the existing `describe('DashboardComponent', ...)` block in `dashboard.component.spec.ts`:

```typescript
  it('Export button is not visible when no result is loaded', () => {
    // Result is loaded in this test suite's beforeEach, so Export should be visible
    const exportBtn = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (btn: HTMLButtonElement) => btn.textContent?.includes('Export')
    ) as HTMLButtonElement | undefined;
    expect(exportBtn).toBeTruthy();
  });
```

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 3: Verify the build compiles cleanly**

Run: `npx ng build`
Expected: Build succeeds with no errors

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "test(export): add integration test, verify clean build"
```
