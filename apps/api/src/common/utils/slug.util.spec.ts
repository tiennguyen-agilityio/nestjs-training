import { normalizeName, slugFrom } from './slug.util.js';

describe('slugFrom', () => {
  it('converts a simple name to a lowercase, hyphenated slug', () => {
    expect(slugFrom('Espresso')).toBe('espresso');
  });

  it('produces the same slug regardless of leading/trailing whitespace', () => {
    expect(slugFrom('  Espresso  ')).toBe(slugFrom('Espresso'));
  });

  it('strips diacritics into an ASCII slug', () => {
    expect(slugFrom('Café')).toBe('cafe');
  });

  it('hyphenates multi-word names', () => {
    expect(slugFrom('Cold Brew Concentrate')).toBe('cold-brew-concentrate');
  });
});

describe('normalizeName', () => {
  it('trims the ends and collapses repeated whitespace', () => {
    expect(normalizeName('  New \t 50%   pro ')).toBe('New 50% pro');
  });

  it('keeps the letter case', () => {
    expect(normalizeName('NEW 50% PRO')).toBe('NEW 50% PRO');
  });
});
