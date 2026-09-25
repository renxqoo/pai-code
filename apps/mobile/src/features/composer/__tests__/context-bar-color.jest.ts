import { describe, expect, it } from '@jest/globals';
import { contextBarIsDanger } from '@/features/composer/context-bar-color';

describe('contextBarIsDanger', () => {
  it('uses danger color only from the high-context threshold', () => {
    expect(contextBarIsDanger(24)).toBe(false);
    expect(contextBarIsDanger(89)).toBe(false);
    expect(contextBarIsDanger(90)).toBe(true);
    expect(contextBarIsDanger(100)).toBe(true);
  });
});
