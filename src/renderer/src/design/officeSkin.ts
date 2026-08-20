import type { ThemeId } from '@/scene/office/themeRegistry';

/** Shell-supported subset of the registry's persisted theme IDs. */
export type OfficeSkin = Extract<ThemeId, 'office' | 'starship' | 'starfield-farm'>;

export function officeSkin(value: unknown): OfficeSkin {
  return value === 'starship' || value === 'starfield-farm' ? value : 'office';
}

export function projectOfficeSkin(value: unknown): OfficeSkin {
  const skin = officeSkin(value);
  try {
    document.documentElement.dataset.officeSkin = skin;
  } catch { /* SSR/tests */ }
  return skin;
}
