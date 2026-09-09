"""
Image post-processing: chroma-key magenta -> alpha, sharp downscale to exact
pixel dimensions, and atlas packing (mirrors the JS placeholder generators'
own left-to-right single-row packing + Phaser "JSONHash" atlas JSON shape).
"""

from __future__ import annotations

import json
import math
from collections import deque
from pathlib import Path

from PIL import Image

MAGENTA = (255, 0, 255)
# Real model output has been observed drifting noticeably off pure magenta
# (e.g. (202,21,112), a rose/crimson rather than #FF00FF) despite the prompt
# asking for it explicitly, so a fixed-distance-to-pure-magenta threshold is
# not reliable on its own — see detect_background_color()/chroma_key_to_alpha().
_FUZZ_FRACTION = 0.18
_MAX_RGB_DISTANCE = math.sqrt(3 * 255 ** 2)
_FUZZ_THRESHOLD = _FUZZ_FRACTION * _MAX_RGB_DISTANCE


def detect_background_color(img: Image.Image, border_width: int = 12) -> tuple[int, int, int] | None:
    """Samples every pixel in a `border_width`-thick strip around the whole
    image edge and returns the most common (mode) color, quantized to
    coarse buckets to absorb per-pixel dithering noise.

    Deliberately NOT a simple 4-corner-patch average (an earlier approach):
    a real generation was observed with a subtle shadow/vignette darkening
    just the four corners while the actual background elsewhere on the same
    border was untouched pure magenta - the 4 corners agreed closely with
    EACH OTHER (passing a corner-consistency check) while being confidently
    wrong about the true background color, so >90% of the real magenta
    border never got keyed. Taking the mode over the FULL border is robust
    to that failure mode: a small corner anomaly is vastly outnumbered by
    the rest of the border's genuine background pixels.

    Returns None only if no clear majority color exists (e.g. the subject's
    own silhouette occupies most of the border), so the caller can fall back
    to pure magenta.
    """
    rgb = img.convert("RGB")
    width, height = rgb.size
    bucket = 8  # quantization step, absorbs painterly-dither noise without merging genuinely different colors

    counts: dict[tuple[int, int, int], int] = {}

    def add_sample(x: int, y: int) -> None:
        r, g, b = rgb.getpixel((x, y))
        key = (r // bucket * bucket, g // bucket * bucket, b // bucket * bucket)
        counts[key] = counts.get(key, 0) + 1

    for y in range(0, min(border_width, height)):
        for x in range(width):
            add_sample(x, y)
    for y in range(max(0, height - border_width), height):
        for x in range(width):
            add_sample(x, y)
    for x in range(0, min(border_width, width)):
        for y in range(height):
            add_sample(x, y)
    for x in range(max(0, width - border_width), width):
        for y in range(height):
            add_sample(x, y)

    if not counts:
        return None

    total = sum(counts.values())
    mode_color, mode_count = max(counts.items(), key=lambda kv: kv[1])
    if mode_count / total < 0.35:
        # No clear majority - the border isn't dominated by one flat color
        # (subject likely touches most of the frame edge), unsafe to guess.
        return None
    return mode_color


def chroma_key_to_alpha(img: Image.Image, key: tuple[int, int, int] | None = None, fuzz_threshold: float = _FUZZ_THRESHOLD) -> Image.Image:
    """Remove the background via a border flood-fill (not a flat global
    threshold): starting from every border pixel, spread to neighboring
    pixels within `fuzz_threshold` RGB-distance of the detected/given key
    color, marking only that *connected-to-the-edge* region transparent.
    This is deliberately more contained than a whole-image color threshold —
    a subject with an interior color close to the background hue (plausible
    once `key` is auto-detected rather than pure #FF00FF) is not affected,
    only the actual background region touching the frame edge is.

    `key=None` (the default) auto-detects the real background color from the
    image's corners (see detect_background_color()) instead of assuming pure
    magenta, since generated output has been observed drifting off #FF00FF."""
    rgba = img.convert("RGBA")
    width, height = rgba.size
    pixels = rgba.load()

    if key is None:
        key = detect_background_color(img) or MAGENTA
    kr, kg, kb = key
    threshold_sq = fuzz_threshold * fuzz_threshold

    def matches(px: tuple[int, int, int, int]) -> bool:
        r, g, b, _a = px
        return (r - kr) ** 2 + (g - kg) ** 2 + (b - kb) ** 2 <= threshold_sq

    visited = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    for x in range(width):
        for y in (0, height - 1):
            idx = y * width + x
            if not visited[idx] and matches(pixels[x, y]):
                visited[idx] = 1
                queue.append((x, y))
    for y in range(height):
        for x in (0, width - 1):
            idx = y * width + x
            if not visited[idx] and matches(pixels[x, y]):
                visited[idx] = 1
                queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        r, g, b, _a = pixels[x, y]
        pixels[x, y] = (r, g, b, 0)
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < width and 0 <= ny < height:
                idx = ny * width + nx
                if not visited[idx]:
                    visited[idx] = 1
                    if matches(pixels[nx, ny]):
                        queue.append((nx, ny))

    # Second pass: a background-colored pocket fully enclosed by opaque
    # subject pixels (e.g. the gap between roof beams in a gable) never
    # touches the border, so the flood-fill above can't reach it - it would
    # ship as a solid magenta/rose patch sitting inside the sprite. Safe to
    # sweep globally for any remaining near-key pixel regardless of
    # connectivity: the checklist's palette (§2.3) explicitly excludes
    # magenta/neon hues from every legitimate asset, so nothing this close to
    # the background color is ever meant to survive as real content.
    for y in range(height):
        for x in range(width):
            if matches(pixels[x, y]):
                r, g, b, _a = pixels[x, y]
                pixels[x, y] = (r, g, b, 0)

    return strip_magenta_family(rgba)


def strip_magenta_family(img: Image.Image) -> Image.Image:
    """Standalone hue-based sweep: zeroes the alpha of any currently-opaque
    pixel matching the "magenta family" hue shape, regardless of brightness.

    A contact shadow the model renders as a DARKENED magenta (e.g.
    (143, 0, 141) - the same hue as the background, just shaded) is far
    enough in raw RGB distance from the bright background color to survive
    chroma_key_to_alpha's first two passes (~152 distance vs. a ~80
    threshold observed on a real generation), even though it's obviously
    still "magenta family", not real content. Detected by HUE SHAPE instead
    of absolute distance: red and blue channels close to each other, green
    suppressed well below both, and both r/b bright enough to rule out a
    dark brown/black outline stroke (which has g closer to r/b, not
    near-zero) - this pattern is unique to magenta/purple hues at any
    brightness and never true to this project's warm wood/desert palette
    (§2.3 excludes magenta entirely).

    Callable standalone (not just as chroma_key_to_alpha's third pass) so an
    already-packed/shipped RGBA image can be retroactively cleaned up
    without re-deriving it from a raw source."""
    rgba = img.convert("RGBA")
    width, height = rgba.size
    pixels = rgba.load()
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            if abs(r - b) < 30 and min(r, b) > 60 and g < min(r, b) - 60:
                pixels[x, y] = (r, g, b, 0)
    return rgba


def downscale_exact(img: Image.Image, target_w: int, target_h: int) -> Image.Image:
    """Sharp downscale to the exact final pixel size (§2.9): a two-step
    bicubic-then-nearest pass rather than a single soft blur-downscale, so
    fine pixel-art detail survives instead of turning to mush."""
    src_w, src_h = img.size
    if (src_w, src_h) == (target_w, target_h):
        return img.copy()

    intermediate_w = max(target_w, min(src_w, target_w * 2))
    intermediate_h = max(target_h, min(src_h, target_h * 2))
    if (intermediate_w, intermediate_h) != (src_w, src_h) and (intermediate_w, intermediate_h) != (target_w, target_h):
        img = img.resize((intermediate_w, intermediate_h), Image.BICUBIC)

    return img.resize((target_w, target_h), Image.NEAREST)


def pack_atlas(
    frames: list[tuple[str, Image.Image]],
    out_png_path: Path,
    out_json_path: Path,
    atlas_png_filename: str,
    app_name: str = "western-village-phaser tools/asset_generation/generate_assets.py",
) -> tuple[int, int]:
    """Pack frames left-to-right in a single row (matches the JS placeholder
    generators' own layout convention, and every whole-file dimension check
    in tools/verify-asset-dimensions.mjs). Writes both the PNG and the
    Phaser JSONHash atlas JSON. Returns (atlas_width, atlas_height)."""
    atlas_width = sum(im.size[0] for _, im in frames)
    atlas_height = max(im.size[1] for _, im in frames)

    canvas = Image.new("RGBA", (atlas_width, atlas_height), (0, 0, 0, 0))
    atlas_json = {
        "frames": {},
        "meta": {
            "app": app_name,
            "version": "1.0",
            "image": atlas_png_filename,
            "format": "RGBA8888",
            "size": {"w": atlas_width, "h": atlas_height},
            "scale": "1",
        },
    }

    x_offset = 0
    for name, im in frames:
        w, h = im.size
        canvas.paste(im, (x_offset, 0))
        atlas_json["frames"][name] = {
            "frame": {"x": x_offset, "y": 0, "w": w, "h": h},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h},
            "sourceSize": {"w": w, "h": h},
        }
        x_offset += w

    out_png_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_png_path)
    out_json_path.parent.mkdir(parents=True, exist_ok=True)
    out_json_path.write_text(json.dumps(atlas_json, indent=2))

    return atlas_width, atlas_height
