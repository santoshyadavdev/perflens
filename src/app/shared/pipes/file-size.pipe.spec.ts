import { FileSizePipe } from './file-size.pipe';

describe('FileSizePipe', () => {
  const pipe = new FileSizePipe();

  it('formats bytes under 1024 as B', () => {
    expect(pipe.transform(512)).toBe('512 B');
  });

  it('formats kilobytes', () => {
    expect(pipe.transform(348160)).toBe('340.0 KB');
  });

  it('formats megabytes', () => {
    expect(pipe.transform(52428800)).toBe('50.0 MB');
  });
});
