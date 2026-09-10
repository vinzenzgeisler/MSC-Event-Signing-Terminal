import { describe, expect, it } from 'vitest';
import { ageAtEvent } from './age';

describe('ageAtEvent', () => {
  it('uses the event date rather than the current date', () => {
    expect(ageAtEvent('2008-09-12', '2026-09-12')).toBe(18);
    expect(ageAtEvent('2008-09-13', '2026-09-12')).toBe(17);
  });

  it('returns null until both complete ISO dates are available', () => {
    expect(ageAtEvent('', '2026-09-12')).toBeNull();
    expect(ageAtEvent('2010-01-01', undefined)).toBeNull();
  });
});
