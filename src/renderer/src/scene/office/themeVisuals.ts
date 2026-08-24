import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { OcclusionRect } from './TiledMapRenderer';
import type { ThemeConfig } from './themeRegistry';

/** Build only independently-authored front-face clips. Unlike the removed
 * collision-crop path, these rectangles are small visible occlusion strips and
 * carry their own Y baselines; floor/collider volumes never become foreground. */
export function createThemeForegroundOccluders(
  backgroundTexture: Texture,
  occlusionRects: ReadonlyArray<OcclusionRect>,
  mapPixelWidth: number,
  mapPixelHeight: number,
): Sprite[] {
  const scaleX = backgroundTexture.frame.width / mapPixelWidth;
  const scaleY = backgroundTexture.frame.height / mapPixelHeight;
  return occlusionRects.map((rect) => {
    const frame = new Rectangle(
      Math.round(rect.x * scaleX),
      Math.round(rect.y * scaleY),
      Math.max(1, Math.round(rect.width * scaleX)),
      Math.max(1, Math.round(rect.height * scaleY)),
    );
    const sprite = new Sprite(new Texture({ source: backgroundTexture.source, frame }));
    sprite.label = `theme-foreground:${rect.name}`;
    sprite.eventMode = 'none';
    sprite.position.set(rect.x, rect.y);
    sprite.width = rect.width;
    sprite.height = rect.height;
    sprite.zIndex = rect.baseline;
    sprite.roundPixels = true;
    return sprite;
  });
}

/**
 * A deliberately tiny visual layer for skins. It is procedural so a theme
 * does not need a second Tiled atlas. This visual-only layer has no authority over agents,
 * seats, routing, or persistence. The caller inserts it below the character
 * layer and above the static map tiles.
 */
export function createThemeVisuals(
  theme: ThemeConfig,
  width: number,
  height: number,
  tileSize: number,
  backgroundTexture?: Texture,
): Container {
  const visual = theme.palette.visual;
  const recipe = visual?.recipe;
  const root = new Container();
  root.label = `theme-visuals:${theme.id}`;
  root.eventMode = 'none';

  // High-fidelity themes may ship one clean, full-map bitmap. It covers only
  // the static Tiled art: collision, spawn points, zones and anchors are still
  // parsed from the shared map and the character/interaction layer remains
  // above this sprite. This gives the approved art pixel fidelity without a
  // second map, duplicated runtime state or altered hit targets.
  if (backgroundTexture) {
    const background = new Sprite(backgroundTexture);
    background.label = `theme-background:${theme.id}`;
    background.width = width * tileSize;
    background.height = height * tileSize;
    root.addChild(background);
    return root;
  }
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

  // Theme recipe: five intentionally separate visual languages make the
  // station legible at a glance while remaining a pure overlay. All geometry
  // is tile-space, deterministic, and clipped by the existing map rectangle.
  const floor = new Graphics();
  for (const zone of recipe?.floor ?? []) {
    floor.rect(zone.x * tileSize, zone.y * tileSize, zone.width * tileSize, zone.height * tileSize)
      .fill({ color: zone.color ?? 0x16486c, alpha: zone.alpha ?? 0.16 });
  }
  const boundaries = new Graphics();
  for (const rib of recipe?.boundaries ?? []) {
    boundaries.roundRect(rib.x * tileSize, rib.y * tileSize, rib.width * tileSize, rib.height * tileSize, 2)
      .fill({ color: rib.color ?? visual.accent, alpha: rib.alpha ?? 0.65 });
  }
  const stations = new Graphics();
  for (const desk of recipe?.workstations ?? []) {
    const x = desk.x * tileSize, y = desk.y * tileSize;
    const accent = desk.accent ?? visual.accent;
    stations.roundRect(x + 2, y + 2, tileSize * 2 - 4, tileSize - 4, 2)
      .fill({ color: desk.surface ?? 0x8d694c, alpha: 0.62 })
      .stroke({ color: accent, width: 1, alpha: 0.8 });
    stations.rect(x + tileSize - 3, y + 4, 6, 5).fill({ color: 0x071b31, alpha: 0.95 });
    stations.rect(x + tileSize - 2, y + 5, 4, 2).fill({ color: accent, alpha: 0.85 });
  }
  const props = new Graphics();
  for (const prop of recipe?.props ?? []) {
    const cx = prop.x * tileSize + tileSize / 2, cy = prop.y * tileSize + tileSize / 2;
    const accent = prop.accent ?? visual.accent;
    if (prop.kind === 'crystal') {
      props.poly([cx, cy - 7, cx + 5, cy + 2, cx, cy + 7, cx - 5, cy + 2])
        .fill({ color: accent, alpha: 0.78 }).stroke({ color: 0xb9f5ff, width: 1, alpha: 0.9 });
    } else if (prop.kind === 'console') {
      props.roundRect(cx - 7, cy - 6, 14, 12, 2).fill({ color: 0x101f39, alpha: 0.95 })
        .stroke({ color: accent, width: 1, alpha: 0.9 });
      props.rect(cx - 4, cy - 3, 8, 4).fill({ color: accent, alpha: 0.6 });
    } else if (prop.kind === 'plant') {
      props.rect(cx - 4, cy + 2, 8, 5).fill({ color: 0x9c6845, alpha: 0.9 });
      props.circle(cx - 3, cy - 2, 4).fill({ color: accent, alpha: 0.76 });
      props.circle(cx + 3, cy - 4, 4).fill({ color: 0x58e2bf, alpha: 0.76 });
    } else if (prop.kind === 'lantern') {
      props.rect(cx - 4, cy - 5, 8, 10).fill({ color: 0x75482c, alpha: 0.9 })
        .stroke({ color: 0xf8d08a, width: 1, alpha: 0.9 });
      props.circle(cx, cy, 3).fill({ color: accent, alpha: 0.92 });
    } else if (prop.kind === 'pond') {
      props.ellipse(cx, cy, 8, 5).fill({ color: accent, alpha: 0.55 })
        .stroke({ color: 0xb8fff0, width: 1, alpha: 0.8 });
      props.arc(cx, cy, 4, 0, Math.PI).stroke({ color: 0xe1fff7, width: 1, alpha: 0.65 });
    } else {
      props.rect(cx - 6, cy - 5, 12, 10).fill({ color: accent, alpha: 0.48 })
        .stroke({ color: 0xf4d59a, width: 1, alpha: 0.8 });
    }
  }
  const windows = new Graphics();
  for (const pane of recipe?.windows ?? []) {
    const x = pane.x * tileSize, y = pane.y * tileSize;
    windows.roundRect(x, y, pane.width * tileSize, pane.height * tileSize, 3)
      .fill({ color: pane.fill ?? 0x0a9fc4, alpha: 0.48 })
      .stroke({ color: pane.stroke ?? 0x9aefff, width: 1.5, alpha: 0.9 });
    for (let i = 1; i < 4; i++) {
      windows.moveTo(x + i * (pane.width * tileSize) / 4, y + 3)
        .lineTo(x + i * (pane.width * tileSize) / 4, y + pane.height * tileSize - 3);
    }
    windows.stroke({ color: pane.stroke ?? 0x55e5f4, width: 1, alpha: 0.45 });
    windows.circle(x + pane.width * tileSize * 0.25, y + pane.height * tileSize * 0.58, 2)
      .fill({ color: pane.spark ?? 0xff8fb3, alpha: 0.7 });
    windows.circle(x + pane.width * tileSize * 0.7, y + pane.height * tileSize * 0.38, 2.5)
      .fill({ color: pane.spark ?? 0x9df9ff, alpha: 0.75 });
  }

  root.addChild(overlay, floor, windows, boundaries, stations, props, stars, grid, hud);
  return root;
}
