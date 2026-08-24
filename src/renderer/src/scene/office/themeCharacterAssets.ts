import { Texture } from 'pixi.js';
import starshipCastAtlasUrl from '../../assets/themes/crystal-sea-starport/characters/cast-atlas.png';
import starshipPortraitAtlasUrl from '../../assets/themes/crystal-sea-starport/characters/portrait-atlas.png';
import farmCastAtlasUrl from '../../assets/themes/starfield-farm/characters/cast-atlas.png';
import farmPortraitAtlasUrl from '../../assets/themes/starfield-farm/characters/portrait-atlas.png';
import type { OfficeCharacterName } from './cast';
import type { CharacterThemeId } from './themedCast';

const CHARACTER_IDS: readonly OfficeCharacterName[] = [
  'michael', 'jim', 'pam', 'dwight', 'kevin', 'angela', 'oscar', 'stanley',
  'phyllis', 'andy', 'kelly', 'ryan', 'toby', 'creed', 'meredith',
];

const PORTRAIT_W = 18;
const PORTRAIT_H = 28;
const FRAME_W = 18;
const FRAME_H = 32;
const FRAME_COLUMNS = 7;
const DIRECTION_ROWS = 3;
const CHARACTER_COLUMNS = 5;

interface ThemeCharacterAssetUrls {
  cast: string;
  portraits: string;
}

const THEME_ASSETS: Partial<Record<CharacterThemeId, ThemeCharacterAssetUrls>> = {
  starship: { cast: starshipCastAtlasUrl, portraits: starshipPortraitAtlasUrl },
  'starfield-farm': { cast: farmCastAtlasUrl, portraits: farmPortraitAtlasUrl },
};

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function loadImage(url: string): Promise<HTMLImageElement> {
  let pending = imageCache.get(url);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Unable to load theme character atlas: ${url}`));
      image.src = url;
    });
    imageCache.set(url, pending);
  }
  return pending;
}

function characterIndex(name: OfficeCharacterName): number {
  const index = CHARACTER_IDS.indexOf(name);
  return index < 0 ? 1 : index;
}

function cropTexture(
  image: HTMLImageElement,
  sx: number,
  sy: number,
  width: number,
  height: number,
): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, sx, sy, width, height, 0, 0, width, height);
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'nearest';
  return texture;
}

/** Load the approved bitmap atlas for one visual skin. The result retains the
 * existing down/up/right × seven-slot contract consumed by CharacterSprite. */
export async function getThemeCharacterFrames(
  name: OfficeCharacterName,
  theme: CharacterThemeId,
): Promise<Texture[][] | null> {
  const urls = THEME_ASSETS[theme];
  if (!urls) return null;
  const image = await loadImage(urls.cast);
  const index = characterIndex(name);
  const characterRow = Math.floor(index / CHARACTER_COLUMNS);
  const characterColumn = index % CHARACTER_COLUMNS;
  const originX = characterColumn * FRAME_W * FRAME_COLUMNS;
  const originY = characterRow * FRAME_H * DIRECTION_ROWS;
  return Array.from({ length: DIRECTION_ROWS }, (_, direction) =>
    Array.from({ length: FRAME_COLUMNS }, (_, frame) =>
      cropTexture(image, originX + frame * FRAME_W, originY + direction * FRAME_H, FRAME_W, FRAME_H),
    ),
  );
}

/** Paint the portrait strip compiled from the same identity source as the map
 * atlas. Cards and floor sprites therefore cannot silently diverge. */
export async function paintThemeCharacterPortrait(
  ctx: CanvasRenderingContext2D,
  name: OfficeCharacterName,
  scale: number,
  theme: CharacterThemeId,
): Promise<boolean> {
  const urls = THEME_ASSETS[theme];
  if (!urls) return false;
  const image = await loadImage(urls.portraits);
  const index = characterIndex(name);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, PORTRAIT_W * scale, PORTRAIT_H * scale);
  ctx.drawImage(
    image,
    index * PORTRAIT_W,
    0,
    PORTRAIT_W,
    PORTRAIT_H,
    0,
    0,
    PORTRAIT_W * scale,
    PORTRAIT_H * scale,
  );
  return true;
}

/** Paint one complete, down-facing idle frame from the same cast atlas used on
 * the floor. Compact agent cards use this instead of a bust crop, so boots and
 * silhouette remain visible when a skin changes. */
export async function paintThemeCharacterFullBody(
  ctx: CanvasRenderingContext2D,
  name: OfficeCharacterName,
  scale: number,
  theme: CharacterThemeId,
): Promise<boolean> {
  const urls = THEME_ASSETS[theme];
  if (!urls) return false;
  const image = await loadImage(urls.cast);
  const index = characterIndex(name);
  const characterRow = Math.floor(index / CHARACTER_COLUMNS);
  const characterColumn = index % CHARACTER_COLUMNS;
  const originX = characterColumn * FRAME_W * FRAME_COLUMNS;
  const originY = characterRow * FRAME_H * DIRECTION_ROWS;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, FRAME_W * scale, FRAME_H * scale);
  ctx.drawImage(
    image,
    originX,
    originY,
    FRAME_W,
    FRAME_H,
    0,
    0,
    FRAME_W * scale,
    FRAME_H * scale,
  );
  return true;
}
