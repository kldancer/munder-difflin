import { Container, Graphics } from 'pixi.js';
import type { ThemeConfig } from './themeRegistry';

/**
 * A deliberately tiny visual layer for skins. It is procedural so a theme
 * does not need a second Tiled atlas. This visual-only layer has no authority over agents,
 * seats, routing, or persistence. The caller inserts it below the character
 * layer and above the static map tiles.
 */
export function createThemeVisuals(theme: ThemeConfig, width: number, height: number, tileSize: number): Container {
  const visual = theme.palette.visual;
  const root = new Container();
  root.label = `theme-visuals:${theme.id}`;
  root.eventMode = 'none';
  if (!visual || visual.overlayAlpha <= 0) return root;

  const overlay = new Graphics();
  overlay.rect(0, 0, width * tileSize, height * tileSize)
    .fill({ color: visual.overlay, alpha: visual.overlayAlpha });

  // Bridge grid: low contrast, regular, and clipped to the existing map bounds.
  const grid = new Graphics();
  const step = tileSize * 4;
  for (let x = step; x < width * tileSize; x += step) {
    grid.moveTo(x, 0).lineTo(x, height * tileSize);
  }
  for (let y = step; y < height * tileSize; y += step) {
    grid.moveTo(0, y).lineTo(width * tileSize, y);
  }
  grid.stroke({ color: visual.grid, width: 1, alpha: 0.12 });

  // Deterministic stars keep the bridge recognizable without random redraws.
  const stars = new Graphics();
  if (visual.stars) {
    for (let i = 0; i < 28; i++) {
      const x = ((i * 73 + 17) % (width * tileSize));
      const y = ((i * 47 + 11) % (height * tileSize));
      stars.circle(x, y, i % 4 === 0 ? 1.5 : 0.75)
        .fill({ color: visual.accent, alpha: i % 4 === 0 ? 0.6 : 0.3 });
    }
  }

  // Four small HUD brackets make the skin read as a bridge rather than a dark
  // filter, while staying entirely inside the existing map rectangle.
  const hud = new Graphics();
  const inset = tileSize * 2;
  const len = tileSize * 2;
  const right = width * tileSize - inset;
  const bottom = height * tileSize - inset;
  for (const [x, y, sx, sy] of [
    [inset, inset, 1, 1], [right, inset, -1, 1],
    [inset, bottom, 1, -1], [right, bottom, -1, -1],
  ] as const) {
    hud.moveTo(x, y + sy * len).lineTo(x, y).lineTo(x + sx * len, y);
  }
  hud.stroke({ color: visual.accent, width: 1.5, alpha: 0.55 });

  root.addChild(overlay, stars, grid, hud);
  return root;
}
