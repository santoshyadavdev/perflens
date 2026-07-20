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
