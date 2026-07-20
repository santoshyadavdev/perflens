import { buildPdf } from './pdf-builder';
import { CapturedSection } from '../models/export.model';
import { MetricScore } from '../models/metric-score.model';
import { ActionItem } from '../models/action-item.model';

const mockAddImage = vi.fn();
const mockAddPage = vi.fn();
const mockSetFontSize = vi.fn();
const mockSetTextColor = vi.fn();
const mockSetFont = vi.fn();
const mockText = vi.fn();
const mockOutput = vi.fn(() => new ArrayBuffer(8));
const mockGetNumberOfPages = vi.fn(() => 1);
const mockSetPage = vi.fn();
const mockSplitTextToSize = vi.fn((text: string) => [text]);
const mockInternal = { pageSize: { getWidth: () => 297, getHeight: () => 210 } };

vi.mock('jspdf', () => {
  function MockJsPDF() {
    return {
      addImage: mockAddImage,
      addPage: mockAddPage,
      setFontSize: mockSetFontSize,
      setTextColor: mockSetTextColor,
      setFont: mockSetFont,
      text: mockText,
      output: mockOutput,
      getNumberOfPages: mockGetNumberOfPages,
      setPage: mockSetPage,
      splitTextToSize: mockSplitTextToSize,
      internal: mockInternal,
    };
  }
  MockJsPDF._calls = [] as unknown[][];
  const original = MockJsPDF;
  const wrapped = function (...args: unknown[]) {
    wrapped._calls.push(args);
    return original();
  };
  wrapped._calls = original._calls;
  return { jsPDF: wrapped };
});

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

  it('calls output to produce arraybuffer', () => {
    buildPdf({
      sections: mockSections,
      metrics: mockMetrics,
      actionItems: mockActionItems,
      fileName: 'trace.json',
      fileSize: 1024,
      analyzedAt: new Date('2026-07-20T12:00:00Z'),
    });

    expect(mockOutput).toHaveBeenCalledWith('arraybuffer');
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

    const allTextCalls = mockText.mock.calls.map((c: unknown[]) => c[0]);
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

    const allTextCalls = mockText.mock.calls.map((c: unknown[]) => c[0]);
    expect(allTextCalls.some((t: string) => t.includes('Fix LCP'))).toBe(true);
  });
});
