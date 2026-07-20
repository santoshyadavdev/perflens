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
