#!/usr/bin/env python3
"""Compile approved character turnaround masters into deterministic runtime atlases.

The generated concept sheets are art-direction sources, not runtime contracts. This
compiler removes the chroma key, snaps every identity to the existing 18x28 / 18x32
grid, synthesizes the seven existing action slots, and emits one atlas per theme.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
IDS = [
    "michael", "jim", "pam", "dwight", "kevin",
    "angela", "oscar", "stanley", "phyllis", "andy",
    "kelly", "ryan", "toby", "creed", "meredith",
]
THEMES = {
    "starship": ROOT / "src/renderer/src/assets/themes/crystal-sea-starport/characters",
    "starfield-farm": ROOT / "src/renderer/src/assets/themes/starfield-farm/characters",
}

PORTRAIT_SIZE = (18, 28)
FRAME_SIZE = (18, 32)
FRAME_COLUMNS = 7
DIRECTION_ROWS = 3
CHARACTER_COLUMNS = 5
CHARACTER_ROWS = 3

# The approved v1 turnaround masters use intentionally uneven cell widths in
# their third row. These source rectangles are part of the art contract; equal
# width slicing would cut the outer characters in half.
TURNAROUND_V1_CELLS = [
    (21, 22, 356, 309), (368, 22, 671, 309), (685, 22, 983, 309), (997, 22, 1299, 309), (1313, 22, 1644, 309),
    (21, 322, 356, 610), (368, 322, 672, 610), (685, 322, 983, 610), (997, 322, 1299, 610), (1313, 322, 1644, 610),
    (21, 624, 315, 923), (328, 624, 617, 923), (630, 624, 908, 923), (920, 624, 1275, 923), (1288, 624, 1644, 923),
]


def chroma_key(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = list(rgba.getdata())
    keyed: list[tuple[int, int, int, int]] = []
    for red, green, blue, alpha in pixels:
        is_magenta = red > 175 and blue > 125 and green < 115 and red - green > 90 and blue - green > 70
        # Image generation may anti-alias the white cell rule against the magenta
        # key. Remove that pale-pink fringe as well; neutral whites in hair and
        # uniforms are deliberately excluded by the red/blue-to-green gap.
        is_pink_rule = red > 220 and blue > 205 and green > 135 and red - green > 16 and blue - green > 16
        is_white_rule = red > 250 and green > 250 and blue > 250
        keyed.append((red, green, blue, 0 if is_magenta or is_pink_rule or is_white_rule else alpha))
    rgba.putdata(keyed)
    return rgba


def quantized_resize(image: Image.Image, target: tuple[int, int], *, bottom_align: bool = True) -> Image.Image:
    bbox = image.getbbox()
    if bbox is None:
        raise RuntimeError("character view became empty after chroma key")
    cropped = image.crop(bbox)
    max_w, max_h = target[0] - 1, target[1] - 1
    scale = min(max_w / cropped.width, max_h / cropped.height)
    size = (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale)))
    resized = cropped.resize(size, Image.Resampling.LANCZOS)
    alpha = resized.getchannel("A").point(lambda value: 255 if value >= 96 else 0)
    rgb = resized.convert("RGB").quantize(colors=32, method=Image.Quantize.MEDIANCUT).convert("RGBA")
    rgb.putalpha(alpha)
    canvas = Image.new("RGBA", target)
    x = (target[0] - size[0]) // 2
    y = target[1] - size[1] if bottom_align else (target[1] - size[1]) // 2
    canvas.alpha_composite(rgb, (x, y))
    return remove_stray_components(canvas)


def remove_stray_components(image: Image.Image) -> Image.Image:
    """Drop detached key/framing debris while retaining adjacent props."""
    alpha = image.getchannel("A")
    width, height = image.size
    occupied = {(x, y) for y in range(height) for x in range(width) if alpha.getpixel((x, y))}
    components: list[set[tuple[int, int]]] = []
    while occupied:
        seed = occupied.pop()
        component = {seed}
        stack = [seed]
        while stack:
            x, y = stack.pop()
            for nx in range(max(0, x - 1), min(width, x + 2)):
                for ny in range(max(0, y - 1), min(height, y + 2)):
                    point = (nx, ny)
                    if point in occupied:
                        occupied.remove(point)
                        component.add(point)
                        stack.append(point)
        components.append(component)
    if not components:
        return image
    main = max(components, key=len)
    min_x = min(x for x, _ in main); max_x = max(x for x, _ in main)
    min_y = min(y for _, y in main); max_y = max(y for _, y in main)
    keep = set(main)
    for component in components:
        if component is main or len(component) < 2:
            continue
        cx0 = min(x for x, _ in component); cx1 = max(x for x, _ in component)
        cy0 = min(y for _, y in component); cy1 = max(y for _, y in component)
        gap_x = max(0, min_x - cx1 - 1, cx0 - max_x - 1)
        gap_y = max(0, min_y - cy1 - 1, cy0 - max_y - 1)
        if gap_x <= 1 and gap_y <= 1:
            keep.update(component)
    out = image.copy()
    for y in range(height):
        for x in range(width):
            if (x, y) not in keep:
                out.putpixel((x, y), (0, 0, 0, 0))
    return out


def connected_component_views(image: Image.Image, expected: int = 3) -> list[Image.Image]:
    width, height = image.size
    alpha = image.getchannel("A")
    occupied = {(x, y) for y in range(height) for x in range(width) if alpha.getpixel((x, y))}
    components: list[set[tuple[int, int]]] = []
    while occupied:
        seed = occupied.pop()
        component = {seed}
        stack = [seed]
        while stack:
            x, y = stack.pop()
            for nx in range(max(0, x - 1), min(width, x + 2)):
                for ny in range(max(0, y - 1), min(height, y + 2)):
                    point = (nx, ny)
                    if point in occupied:
                        occupied.remove(point)
                        component.add(point)
                        stack.append(point)
        if len(component) >= 80:
            components.append(component)
    if len(components) < expected:
        raise RuntimeError(f"expected {expected} complete character components, found {len(components)}")
    mains = sorted(components, key=len, reverse=True)[:expected]
    mains.sort(key=lambda component: sum(x for x, _ in component) / len(component))
    views: list[Image.Image] = []
    for component in mains:
        x0 = min(x for x, _ in component); x1 = max(x for x, _ in component) + 1
        y0 = min(y for _, y in component); y1 = max(y for _, y in component) + 1
        pad = 3
        views.append(image.crop((max(0, x0 - pad), max(0, y0 - pad), min(width, x1 + pad), min(height, y1 + pad))))
    return views


def extract_views(master: Image.Image, index: int) -> tuple[Image.Image, Image.Image, Image.Image, Image.Image]:
    if master.width != 1672 or master.height not in (940, 941):
        raise RuntimeError(f"turnaround v1 source dimensions changed: {master.size}")
    x0, y0, x1, y1 = TURNAROUND_V1_CELLS[index]
    # Exclude the white cell rule, then identify each complete body by its real
    # alpha-connected pixel component. This is deliberately not equal slicing.
    interior = chroma_key(master.crop((x0 + 8, y0 + 8, x1 - 8, min(master.height, y1 - 8))))
    source_views = connected_component_views(interior)
    views = [quantized_resize(view, FRAME_SIZE) for view in source_views]

    # Portraits are a head-and-torso crop of the same high-resolution front
    # component, so cards and floor sprites cannot drift into different identities.
    front_source = source_views[0]
    front_bbox = front_source.getbbox()
    if front_bbox is None:
        raise RuntimeError(f"missing front view for index {index}")
    fx0, fy0, fx1, fy1 = front_bbox
    bust_h = max(1, round((fy1 - fy0) * 0.54))
    bust_pad = max(1, round((fx1 - fx0) * 0.08))
    bust = front_source.crop((max(0, fx0 - bust_pad), fy0, min(front_source.width, fx1 + bust_pad), min(front_source.height, fy0 + bust_h)))
    portrait = quantized_resize(bust, PORTRAIT_SIZE)
    return portrait, views[0], views[1], views[2]


def shifted(base: Image.Image, dx: int, dy: int) -> Image.Image:
    out = Image.new("RGBA", base.size)
    out.alpha_composite(base, (dx, dy))
    return out


def action_frame(base: Image.Image, theme: str, direction: int, kind: str, phase: int) -> Image.Image:
    if kind == "walk":
        # One-pixel body cadence at native resolution. Feet remain within the
        # same 32 px box, so the existing foot anchor and collision stay stable.
        return shifted(base, -1 if phase == 1 else 1, -1)

    out = base.copy()
    draw = ImageDraw.Draw(out)
    if theme == "starship":
        edge, page = (16, 39, 55, 255), (78, 220, 231, 255)
    else:
        edge, page = (63, 43, 31, 255), (238, 199, 116, 255)
    bob = phase % 2
    if direction == 0:
        if kind == "type":
            draw.rectangle((6, 20 - bob, 11, 23 - bob), fill=edge)
            draw.rectangle((7, 20 - bob, 10, 21 - bob), fill=page)
        else:
            draw.polygon([(5, 20 - bob), (8, 21 - bob), (9, 20 - bob), (12, 21 - bob), (12, 24 - bob), (9, 23 - bob), (8, 24 - bob), (5, 23 - bob)], fill=edge)
            draw.line((6, 21 - bob, 8, 22 - bob), fill=page)
            draw.line((10, 21 - bob, 11, 22 - bob), fill=page)
    elif direction == 2:
        x0 = 11 + bob
        draw.rectangle((x0, 19, x0 + 3, 23), fill=edge)
        draw.rectangle((x0 + 1, 20, x0 + 2, 22), fill=page)
    else:
        # Back views keep the action subtle: arms/prop remain below the shoulder
        # line without inventing a front-facing face.
        draw.rectangle((7 - bob, 22, 10 - bob, 24), fill=edge)
        draw.line((8 - bob, 22, 9 - bob, 22), fill=page)
    return out


def frames_for(base: Image.Image, theme: str, direction: int) -> list[Image.Image]:
    return [
        base,
        action_frame(base, theme, direction, "walk", 1),
        action_frame(base, theme, direction, "walk", 2),
        action_frame(base, theme, direction, "type", 0),
        action_frame(base, theme, direction, "type", 1),
        action_frame(base, theme, direction, "read", 0),
        action_frame(base, theme, direction, "read", 1),
    ]


def lock_identity_head(target: Image.Image, source: Image.Image, rows: int) -> Image.Image:
    """Copy the immutable hair/face band from the canonical starship identity."""
    out = target.copy()
    out.paste((0, 0, 0, 0), (0, 0, out.width, rows))
    out.alpha_composite(source.crop((0, 0, source.width, rows)), (0, 0))
    return out


def compile_theme(theme: str, directory: Path, identity_directory: Path | None = None) -> None:
    source = directory / "character-turnarounds-v1.png"
    master = Image.open(source).convert("RGB")
    portrait_atlas = Image.new("RGBA", (PORTRAIT_SIZE[0] * len(IDS), PORTRAIT_SIZE[1]))
    cast_atlas = Image.new("RGBA", (FRAME_SIZE[0] * FRAME_COLUMNS * CHARACTER_COLUMNS, FRAME_SIZE[1] * DIRECTION_ROWS * CHARACTER_ROWS))
    identity_portraits = Image.open(identity_directory / "portrait-atlas.png").convert("RGBA") if identity_directory else None
    identity_cast = Image.open(identity_directory / "cast-atlas.png").convert("RGBA") if identity_directory else None

    manifest: dict[str, object] = {
        "version": 1,
        "theme": theme,
        "portraitSize": list(PORTRAIT_SIZE),
        "frameSize": list(FRAME_SIZE),
        "frameColumns": FRAME_COLUMNS,
        "directionRows": ["down", "up", "right"],
        "actionColumns": ["walk1", "walk2", "walk3", "type1", "type2", "read1", "read2"],
        "characters": {},
    }

    for index, name in enumerate(IDS):
        portrait, down, up, right = extract_views(master, index)
        char_row, char_col = divmod(index, CHARACTER_COLUMNS)
        origin_x = char_col * FRAME_SIZE[0] * FRAME_COLUMNS
        origin_y = char_row * FRAME_SIZE[1] * DIRECTION_ROWS
        if identity_portraits is not None:
            identity_portrait = identity_portraits.crop((index * PORTRAIT_SIZE[0], 0, (index + 1) * PORTRAIT_SIZE[0], PORTRAIT_SIZE[1]))
            portrait = lock_identity_head(portrait, identity_portrait, 18)
        portrait_atlas.alpha_composite(portrait, (index * PORTRAIT_SIZE[0], 0))
        for direction, base in enumerate((down, up, right)):
            if identity_cast is not None:
                identity_frame = identity_cast.crop((origin_x, origin_y + direction * FRAME_SIZE[1], origin_x + FRAME_SIZE[0], origin_y + (direction + 1) * FRAME_SIZE[1]))
                base = lock_identity_head(base, identity_frame, 17)
            for frame_index, frame in enumerate(frames_for(base, theme, direction)):
                cast_atlas.alpha_composite(frame, (origin_x + frame_index * FRAME_SIZE[0], origin_y + direction * FRAME_SIZE[1]))
        manifest["characters"][name] = {
            "portrait": [index * PORTRAIT_SIZE[0], 0, *PORTRAIT_SIZE],
            "atlasOrigin": [origin_x, origin_y],
        }

    portrait_atlas.save(directory / "portrait-atlas.png", optimize=True)
    cast_atlas.save(directory / "cast-atlas.png", optimize=True)
    (directory / "cast-atlas.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{theme}: {len(IDS)} portraits + {len(IDS) * DIRECTION_ROWS * FRAME_COLUMNS} frames")


def main() -> None:
    compile_theme("starship", THEMES["starship"])
    compile_theme("starfield-farm", THEMES["starfield-farm"], identity_directory=THEMES["starship"])


if __name__ == "__main__":
    main()
