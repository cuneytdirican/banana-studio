import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_BRAND_KIT,
  loadBrandKit,
  normalizeBrandKit,
  saveBrandKit,
} from '../../src/lib/brand/kit';

describe('brand kit', () => {
  beforeEach(() => localStorage.clear());

  it('normalizes invalid values and clamps the safe margin', () => {
    const kit = normalizeBrandKit({
      name: '  Acme  ',
      primaryColor: 'red',
      accentColor: '#ABCDEF',
      fontFamily: 'Comic Sans',
      safeMargin: 99,
    });
    expect(kit.name).toBe('Acme');
    expect(kit.primaryColor).toBe(DEFAULT_BRAND_KIT.primaryColor);
    expect(kit.accentColor).toBe('#ABCDEF');
    expect(kit.fontFamily).toBe(DEFAULT_BRAND_KIT.fontFamily);
    expect(kit.safeMargin).toBe(20);
  });

  it('persists per user and falls back to defaults', () => {
    saveBrandKit('user-1', { ...DEFAULT_BRAND_KIT, name: 'Studio One' });
    expect(loadBrandKit('user-1').name).toBe('Studio One');
    expect(loadBrandKit('user-2').name).toBe(DEFAULT_BRAND_KIT.name);
  });
});
