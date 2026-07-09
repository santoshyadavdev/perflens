import { describe, expect, it } from 'vitest';
import { formatBytes } from './format';

describe('formatBytes', () => {
  it('formats bytes under 1024 as B', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(348160)).toBe('340.0 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(52428800)).toBe('50.0 MB');
  });
});
