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
