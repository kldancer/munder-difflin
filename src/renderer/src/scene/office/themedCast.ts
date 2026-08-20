import type { OfficeCharacterName } from './cast';

/** Stable visual-only theme ids. These never change the agent's stored name or state. */
export type CharacterThemeId = 'office' | 'starship' | 'starfield-farm';

export const CHARACTER_THEME_IDS: readonly CharacterThemeId[] = ['office', 'starship', 'starfield-farm'];

export interface CharacterThemeRecipe {
  /** The existing appearance id; deliberately identical across themes. */
  readonly id: OfficeCharacterName;
  /** Two fixed identity anchors retained by every projection. */
  readonly anchors: { readonly head: string; readonly face: string };
  /** Visual-only paint recipe; it carries no duty, provider, or runtime state. */
  readonly accent: string;
  readonly garment: string;
  readonly prop: string;
  readonly garmentCut: 'uniform' | 'apron';
  readonly headDetail: 'crystal-band' | 'star-pin';
}

const IDS: readonly OfficeCharacterName[] = [
  'michael', 'jim', 'pam', 'dwight', 'kevin', 'angela', 'oscar', 'stanley',
  'phyllis', 'andy', 'kelly', 'ryan', 'toby', 'creed', 'meredith',
];

const OFFICE_ACCENTS: Record<OfficeCharacterName, string> = {
  michael: '#5a6b8c', jim: '#6fa8dc', pam: '#9caf88', dwight: '#b89b3e', kevin: '#4a7ab5',
  angela: '#8a86a6', oscar: '#7a4b6b', stanley: '#8c5a4b', phyllis: '#b08bbf', andy: '#6fae6f',
  kelly: '#d16ba5', ryan: '#3a3a44', toby: '#9a8c5a', creed: '#6b7a4b', meredith: '#b5544a',
};

const STARSHIP_ACCENTS = ['#59d6d2', '#64b5f6', '#9be7c4', '#e9c46a', '#4dc4ff', '#b9a7ff', '#d58cff', '#8ba8c7', '#f3a6d0', '#78e0a0', '#ff8bc8', '#8d9bb8', '#d0b48a', '#93b57b', '#ff927e'];
const FARM_ACCENTS = ['#b9825b', '#6f9c73', '#d0a84f', '#8eaa63', '#668c78', '#b88a9e', '#a47662', '#7d6b54', '#c49a72', '#6f9b55', '#d17b73', '#667c6b', '#aa8b62', '#79845d', '#b87761'];

function recipe(theme: CharacterThemeId, id: OfficeCharacterName, index: number): CharacterThemeRecipe {
  const accent = theme === 'starship' ? STARSHIP_ACCENTS[index] : theme === 'starfield-farm' ? FARM_ACCENTS[index] : OFFICE_ACCENTS[id];
  return {
    id,
    anchors: { head: `${id}:head`, face: `${id}:face` },
    accent,
    garment: theme === 'starship' ? 'crystalline-uniform' : theme === 'starfield-farm' ? 'starweave-apron' : 'office-garment',
    prop: theme === 'starship' ? 'crystal-badge' : theme === 'starfield-farm' ? 'observatory-pin' : 'office-pin',
    garmentCut: theme === 'starfield-farm' ? 'apron' : 'uniform',
    headDetail: theme === 'starfield-farm' ? 'star-pin' : 'crystal-band',
  };
}

function makeTheme(theme: CharacterThemeId): Record<OfficeCharacterName, CharacterThemeRecipe> {
  return Object.fromEntries(IDS.map((id, index) => [id, recipe(theme, id, index)])) as Record<OfficeCharacterName, CharacterThemeRecipe>;
}

/** Exactly one recipe per stable appearance id for each supported visual theme. */
export const THEME_CHARACTER_RECIPES: Record<CharacterThemeId, Record<OfficeCharacterName, CharacterThemeRecipe>> = {
  office: makeTheme('office'),
  starship: makeTheme('starship'),
  'starfield-farm': makeTheme('starfield-farm'),
};

export function getCharacterThemeRecipe(theme: CharacterThemeId, id: OfficeCharacterName): CharacterThemeRecipe {
  return THEME_CHARACTER_RECIPES[theme]?.[id] ?? THEME_CHARACTER_RECIPES.office[id] ?? THEME_CHARACTER_RECIPES.office.jim;
}
