#!/usr/bin/env python3
"""Render fine collider authoring and its baked navigation projection.

Dark red shapes are the art-aligned source colliders. Their translucent rounded
halo is the 3.5-native-pixel obstacle inflation used by the feet circle. Thin
magenta cells are the derived BFS grid; green marks are operational destinations.
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw


FOOT_RADIUS = 3.5


def render(map_path: Path, background_path: Path, output_path: Path) -> None:
    map_data = json.loads(map_path.read_text())
    background = Image.open(background_path).convert("RGBA")
    logical_width = map_data["width"] * map_data["tilewidth"]
    scale = background.width / logical_width
    if background.height != map_data["height"] * map_data["tileheight"] * scale:
        raise ValueError("background and TMJ aspect ratio differ")

    overlay = Image.new("RGBA", background.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    tile = map_data["tilewidth"] * scale
    geometry = next(layer for layer in map_data["layers"] if layer["name"] == "collision-geometry")["objects"]
    radius = FOOT_RADIUS * scale
    for obstacle in geometry:
        x0 = obstacle["x"] * scale
        y0 = obstacle["y"] * scale
        x1 = (obstacle["x"] + obstacle["width"]) * scale
        y1 = (obstacle["y"] + obstacle["height"]) * scale
        expanded = (x0 - radius, y0 - radius, x1 + radius, y1 + radius)
        draw.rounded_rectangle(
            expanded,
            radius=radius,
            fill=(255, 42, 68, 34),
            outline=(255, 91, 113, 145),
            width=max(1, round(scale)),
        )
        draw.rectangle(
            (x0, y0, x1, y1),
            fill=(180, 18, 46, 82),
            outline=(255, 42, 68, 225),
            width=max(2, round(scale)),
        )

    collision = next(layer for layer in map_data["layers"] if layer["name"] == "collision")["data"]
    for y in range(map_data["height"]):
        for x in range(map_data["width"]):
            if collision[y * map_data["width"] + x] == 0:
                continue
            box = (x * tile, y * tile, (x + 1) * tile - 1, (y + 1) * tile - 1)
            draw.rectangle(box, outline=(236, 72, 153, 105), width=max(1, round(scale)))

    spawns = next(layer for layer in map_data["layers"] if layer["name"] == "spawn-points")["objects"]
    for spawn in spawns:
        x = spawn["x"] / map_data["tilewidth"]
        y = spawn["y"] / map_data["tileheight"]
        box = (x * tile, y * tile, (x + 1) * tile - 1, (y + 1) * tile - 1)
        draw.rectangle(box, outline=(42, 255, 174, 225), width=max(2, round(scale)))
        cx = (x + 0.5) * tile
        cy = (y + 1) * tile
        draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=(42, 255, 174, 190))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    Image.alpha_composite(background, overlay).save(output_path)
    print(f"wrote {output_path} {background.size}")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        raise SystemExit("usage: render-theme-collision-overlay.py MAP.tmj BACKGROUND.png OUTPUT.png")
    render(*(Path(value) for value in sys.argv[1:]))
