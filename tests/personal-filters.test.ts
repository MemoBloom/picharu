import { describe, expect, it } from 'vitest';
import { personalDateRange } from '../apps/web/src/lib/personal-filters';
describe('personal date filter boundaries', () => {
  it('uses inclusive Japanese end day and UTC half-open bounds across a year boundary', () => {
    expect(personalDateRange('2026-12-31', '2027-01-01')).toEqual({ start: '2026-12-30T15:00:00.000Z', end: '2027-01-01T15:00:00.000Z' });
  });
  it('allows empty and one-sided filters without inventing a browser timezone', () => {
    expect(personalDateRange('', '')).toEqual({});
    expect(personalDateRange('', '2028-02-29')).toEqual({ end: '2028-02-29T15:00:00.000Z' });
  });
  it('rejects impossible dates and reversed intervals instead of normalizing silently', () => {
    for (const [start, end] of [['2026-02-29', ''], ['2026-04-31', ''], ['2026-10-22', '2026-10-21'], ['2026-1-1', '']]) expect(() => personalDateRange(start, end)).toThrow('INVALID_DATE_RANGE');
  });
});
