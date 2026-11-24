import { isSlug } from '@/utils/identifiers';

describe('isSlug', () => {
  it('accepts lowercase hyphenated identifiers', () => {
    expect(isSlug('demo-project')).toBe(true);
    expect(isSlug('site-42')).toBe(true);
  });

  it('rejects uppercase, spaces, and leading separators', () => {
    expect(isSlug('Demo-project')).toBe(false);
    expect(isSlug('demo project')).toBe(false);
    expect(isSlug('-demo')).toBe(false);
    expect(isSlug('demo-')).toBe(false);
  });
});
