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
