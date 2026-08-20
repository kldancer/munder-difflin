import type { OfficeCharacterName } from './cast';
import { PORTRAIT_W, PORTRAIT_H, SCENE_W, SCENE_H, portraitFrameBuf, sceneFrameBufs } from './portraitArt';
import { getCharacterThemeRecipe, type CharacterThemeId } from './themedCast';

export { PORTRAIT_W, PORTRAIT_H, SCENE_W, SCENE_H };
export type ThemeBuf = Uint8ClampedArray;

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function project(source: ThemeBuf, width: number, height: number, theme: CharacterThemeId, name: OfficeCharacterName): ThemeBuf {
  if (theme === 'office') return source.slice();
  const out = source.slice();
  const accent = rgb(getCharacterThemeRecipe(theme, name).accent);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (out[i + 3] === 0) continue;
      // Keep head/face/hair geometry and original hair colors intact. Repaint only
      // the garment region, so the existing hair/face anchors remain recognizable.
      if (y >= 18) {
        const shade = y >= 18 ? 1 : 0.72;
        out[i] = Math.round(accent[0] * shade);
        out[i + 1] = Math.round(accent[1] * shade);
        out[i + 2] = Math.round(accent[2] * shade);
      }
    }
  }
  // A tiny deterministic badge is the only theme-specific prop. It stays on the
  // garment, never changes the head silhouette, and is present in portrait/scene.
  const badge = rgb(getCharacterThemeRecipe(theme, name).accent);
  const by = height === PORTRAIT_H ? 21 : 20;
  const bi = (by * width + 6) * 4;
  out[bi] = badge[0]; out[bi + 1] = badge[1]; out[bi + 2] = badge[2]; out[bi + 3] = 255;
  // Theme silhouette cues are deliberately small overlays on existing geometry:
  // a crystal comms band for starship, or a warm star pin for the farm apron.
  // They do not recolor or replace the stable hair/face anchor.
  if (theme === 'starship') {
    const y = 8;
    for (const x of [4, 13]) {
      const i = (y * width + x) * 4;
      out[i] = 89; out[i + 1] = 214; out[i + 2] = 210; out[i + 3] = 255;
    }
    for (const x of [7, 8, 9, 10]) {
      const i = (by * width + x) * 4;
      out[i] = 89; out[i + 1] = 214; out[i + 2] = 210; out[i + 3] = 255;
    }
  } else if (theme === 'starfield-farm') {
    const y = 7;
    for (const x of [3, 14]) {
      const i = (y * width + x) * 4;
      out[i] = 232; out[i + 1] = 182; out[i + 2] = 92; out[i + 3] = 255;
    }
    for (const x of [7, 8, 9, 10]) {
      const i = (by * width + x) * 4;
      out[i] = 232; out[i + 1] = 182; out[i + 2] = 92; out[i + 3] = 255;
    }
  }
  return out;
}

export function themedPortraitBuf(name: OfficeCharacterName, theme: CharacterThemeId = 'office'): ThemeBuf {
  return project(portraitFrameBuf(name), PORTRAIT_W, PORTRAIT_H, theme, name);
}

export function themedSceneFrameBufs(name: OfficeCharacterName, theme: CharacterThemeId = 'office'): { front: ThemeBuf[]; back: ThemeBuf[] } {
  const base = sceneFrameBufs(name);
  const actionMark = (buf: ThemeBuf, index: number): ThemeBuf => {
    if (index < 3 || theme === 'office') return buf;
    const x = index === 3 ? 2 : index === 4 ? 3 : index === 5 ? 8 : 9;
    const y = 23;
    const i = (y * SCENE_W + x) * 4;
    const c = index === 5 ? [17, 23, 31] : index === 6 ? [31, 23, 17] : [38, 34, 46];
    buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
    return buf;
  };
  return {
    front: base.front.map((buf, index) => actionMark(project(buf, SCENE_W, SCENE_H, theme, name), index)),
    back: base.back.map((buf, index) => actionMark(project(buf, SCENE_W, SCENE_H, theme, name), index)),
  };
}
