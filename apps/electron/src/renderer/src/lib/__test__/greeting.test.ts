import { describe, expect, test } from 'bun:test';

import { greetingKeyOf } from '../greeting';

describe('greetingKeyOf', () => {
  test.each([
    [0, 'night'],
    [4, 'night'],
    [5, 'morning'],
    [11, 'morning'],
    [12, 'afternoon'],
    [17, 'afternoon'],
    [18, 'evening'],
    [23, 'evening'],
  ])('%i 点 → %s', (hour: number, key: string) => {
    expect(greetingKeyOf(hour)).toBe(key);
  });

  test('越界与垃圾输入按夜段降级（不抛错）', () => {
    expect(greetingKeyOf(24)).toBe('night');
    expect(greetingKeyOf(-1)).toBe('night');
    expect(greetingKeyOf(Number.NaN)).toBe('night');
  });
});
