import { describe, expect, it } from 'vitest';
import { percent } from '../src/lib/format';

describe('percent', () => {
  it('never rounds onto certainty', () => {
    expect(percent(0.99996)).toBe('>99.9%');
    expect(percent(0.9991)).toBe('99.9%');
    expect(percent(0.0002)).toBe('<0.1%');
    expect(percent(1)).toBe('100%');
    expect(percent(0)).toBe('0%');
  });

  it('keeps one decimal in between', () => {
    expect(percent(0.9976)).toBe('99.8%');
    expect(percent(0.6)).toBe('60.0%');
    expect(percent(0.0007)).toBe('0.1%');
  });
});
