import { DurationPipe } from './duration.pipe';

describe('DurationPipe', () => {
  const pipe = new DurationPipe();

  it('formats milliseconds under 1000 as ms', () => {
    expect(pipe.transform(450)).toBe('450ms');
  });

  it('formats milliseconds over 1000 as seconds', () => {
    expect(pipe.transform(4200)).toBe('4.2s');
  });

  it('formats zero', () => {
    expect(pipe.transform(0)).toBe('0ms');
  });
});
