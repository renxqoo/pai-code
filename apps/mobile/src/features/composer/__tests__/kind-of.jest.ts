import { describe, expect, it } from '@jest/globals';
import { kindOf } from '@/features/composer/attachment-kind';

describe('kindOf', () => {
  it.each([
    ['spec.PDF', 'pdf'],
    ['screen.JPG', 'image'],
    ['archive.tar.gz', 'archive'],
    ['notes.md', 'document'],
    ['', 'document'],
  ] as const)('classifies %s as %s', (name, expected) => {
    expect(kindOf(name)).toBe(expected);
  });
});
