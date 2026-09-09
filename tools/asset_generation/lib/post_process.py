"""
Free, local (no API call) derivation of a building's Damaged/Ruined and
25%/50%/75% construction-progress states from one paid AI-generated master
image — see the "asset-spritesets-scope" project decision (post-process
damage/construction, pay only for real tier regeneration).
"""

from __future__ import annotations

import random

from PIL import Image, ImageDraw, ImageEnhance, ImageOps

_CRACK_COLOR = (46, 30, 27, 255)  # near-black warm brown, matches the palette's darkest-wood tone
_SCAFFOLD_COLOR = (196, 164, 132, 220)  # weathered-tan, semi-transparent


def apply_damage_state(img: Image.Image, level: str, seed: int = 0) -> Image.Image:
    """level: 'damaged' (moderate) or 'ruined' (severe). Desaturates + darkens
    the sprite and draws crack lines across it, respecting the existing alpha
    mask (never draws into transparent background)."""
    rng = random.Random(seed)
    rgba = img.convert("RGBA")
    alpha = rgba.split()[3]
    width, height = rgba.size

    if level == "damaged":
        desaturate_amount, darken_amount, crack_count, hole_count = 0.4, 0.72, 4, 0
    elif level == "ruined":
        desaturate_amount, darken_amount, crack_count, hole_count = 0.2, 0.6, 6, 4
    else:
        raise ValueError(f"unknown damage level: {level}")

    gray = ImageOps.grayscale(rgba).convert("RGB")
    color = rgba.convert("RGB")
    desaturated = Image.blend(color, gray.convert("RGB"), 1 - desaturate_amount)
    darkened = ImageEnhance.Brightness(desaturated).enhance(darken_amount)
    result = darkened.convert("RGBA")
    result.putalpha(alpha)

    draw = ImageDraw.Draw(result)
    for _ in range(crack_count):
        _draw_crack(draw, rng, width, height)

    if hole_count:
        pixels = result.load()
        for _ in range(hole_count):
            _punch_hole(pixels, rng, width, height)

    return result


def apply_construction_stage(img: Image.Image, percent: int, seed: int = 0) -> Image.Image:
    """percent: 25, 50, or 75. Reveals the master image from the bottom up
    (building "grows" from its foundation) and overlays simple scaffold
    poles across the frame to read as in-progress rather than truncated."""
    if percent not in (25, 50, 75):
        raise ValueError(f"unsupported construction percent: {percent}")

    rng = random.Random(seed + percent)
    rgba = img.convert("RGBA")
    width, height = rgba.size

    reveal_from_y = height - round(height * (percent / 100))
    result = Image.new("RGBA", (width, height), (0, 0, 0, 0))

    fully_built = rgba.crop((0, reveal_from_y, width, height))
    result.paste(fully_built, (0, reveal_from_y))

    if reveal_from_y > 0:
        # Faint preview of the not-yet-built portion: original colors at low
        # alpha (not grayscale - a grayscale wash over a light background
        # reads as fog/haze rather than "building not finished yet").
        ghost_region = rgba.crop((0, 0, width, reveal_from_y))
        ghost_alpha = ghost_region.split()[3].point(lambda a: int(a * 0.4))
        r, g, b, _a = ghost_region.split()
        ghost = Image.merge("RGBA", (r, g, b, ghost_alpha))
        result.alpha_composite(ghost, (0, 0))

    _draw_scaffold(result, rng, width, height)
    return result


def _draw_crack(draw: ImageDraw.ImageDraw, rng: random.Random, width: int, height: int) -> None:
    x = rng.randint(int(width * 0.15), int(width * 0.85))
    y = rng.randint(int(height * 0.2), int(height * 0.5))
    points = [(x, y)]
    for _ in range(rng.randint(3, 5)):
        x += rng.randint(-width // 8, width // 8)
        y += rng.randint(height // 12, height // 6)
        points.append((x, y))
    draw.line(points, fill=_CRACK_COLOR, width=max(1, width // 96))


def _punch_hole(pixels, rng: random.Random, width: int, height: int) -> None:
    cx = rng.randint(int(width * 0.2), int(width * 0.8))
    cy = rng.randint(int(height * 0.3), int(height * 0.8))
    radius = rng.randint(max(2, width // 32), max(3, width // 16))
    for y in range(max(0, cy - radius), min(height, cy + radius)):
        for x in range(max(0, cx - radius), min(width, cx + radius)):
            if (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius:
                r, g, b, a = pixels[x, y]
                if a > 0:
                    pixels[x, y] = (r, g, b, 0)


def _draw_scaffold(canvas: Image.Image, rng: random.Random, width: int, height: int) -> None:
    draw = ImageDraw.Draw(canvas)
    pole_width = max(1, width // 48)
    for x_frac in (0.08, 0.92):
        x = int(width * x_frac)
        draw.line([(x, int(height * 0.05)), (x, height)], fill=_SCAFFOLD_COLOR, width=pole_width)
    for y_frac in (0.15, 0.45, 0.72):
        y = int(height * y_frac)
        draw.line([(int(width * 0.06), y), (int(width * 0.94), y)], fill=_SCAFFOLD_COLOR, width=max(1, pole_width - 1))
