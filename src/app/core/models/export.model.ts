export type ExportFormat = 'pdf' | 'html';

export interface CapturedSection {
  id: string;
  title: string;
  imageDataUrl: string;
  width: number;
  height: number;
}

export interface ExportProgress {
  phase: 'capturing' | 'assembling' | 'complete' | 'error' | 'cancelled';
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
    { id: 'score-cards', title: 'Score Cards', panelSelector: '#section-score-cards' },
    { id: 'action-items', title: 'Action Items', panelSelector: '#tab-panel-action-items' },
    { id: 'flamegraph', title: 'Flamegraph', panelSelector: '#tab-panel-flamegraph' },
    { id: 'timeline', title: 'Timeline', panelSelector: '#tab-panel-timeline' },
    { id: 'network', title: 'Network Waterfall', panelSelector: '#tab-panel-network' },
  ],
  'heap-snapshot': [
    { id: 'score-cards', title: 'Score Cards', panelSelector: '#section-score-cards' },
    { id: 'action-items', title: 'Action Items', panelSelector: '#tab-panel-action-items' },
    { id: 'memory', title: 'Memory', panelSelector: '#tab-panel-memory' },
  ],
  'cpu-profile': [
    { id: 'score-cards', title: 'Score Cards', panelSelector: '#section-score-cards' },
    { id: 'action-items', title: 'Action Items', panelSelector: '#tab-panel-action-items' },
    { id: 'cpu-profile', title: 'CPU Profile', panelSelector: '#tab-panel-cpu-profile' },
    { id: 'v8-internals', title: 'V8 Internals', panelSelector: '#tab-panel-v8-internals' },
  ],
};
