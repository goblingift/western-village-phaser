#!/usr/bin/env python3
"""Convert every shipped art PNG under public/art/ to WebP (Phase 90).

WHY: BootScene.preload() eagerly loads every atlas before the game starts.
As PNG that was 7.84 MB (buildings alone: 7.7 MB across 34 files, several
over 380 KB) - by far the worst first-impression cost on a publicly deployed
web game.

QUALITY: lossy WebP at WEBP_QUALITY with method=6. Measured on the real
assets:

  * alpha is bit-exact (max per-pixel alpha delta 0 across every file) -
    lossy WebP encodes the alpha plane losslessly here, so cutout edges,
    which is what would actually be noticeable on sprites over terrain, do
    not degrade at all;
  * mean per-pixel RGB delta over VISIBLE (alpha > 0) pixels is ~2-5/255;
  * side-by-side at 3x magnification (orig / q95 / q90 / q80) is
    indistinguishable - and the game renders buildings DOWN-scaled
    (a 128px source drawn at 32-64 screen px), so the sampled result is
    even closer than the comparison suggests.

The large whole-image RGB deltas you get from a naive diff are entirely in
fully transparent pixels, whose RGB is arbitrary and invisible; they are not
a quality signal. WEBP_QUALITY is a single constant here precisely so this is
trivially retunable if a future art pass ever wants more headroom.

USAGE (run after any generate_*.py pass that writes into public/art/):

    python3 tools/asset_generation/convert_to_webp.py           # convert + delete PNGs
    python3 tools/asset_generation/convert_to_webp.py --keep    # keep the PNGs
    python3 tools/asset_generation/convert_to_webp.py --dry-run

The companion atlas JSON's `meta.image` field is rewritten to the .webp name
for correctness/tooling; Phaser itself ignores it (load.atlas takes an
explicit texture URL). `npm run verify:art` requires the .webp files and will
tell you to run this script if it only finds PNGs.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover - dependency guidance only
    sys.exit("Pillow is required: python3 -m pip install -r tools/asset_generation/requirements.txt")

REPO_ROOT = Path(__file__).resolve().parents[2]
PUBLIC_ART_DIR = REPO_ROOT / "public" / "art"

# See the module docstring for the measurements behind this number.
WEBP_QUALITY = 90
WEBP_METHOD = 6  # slowest/best encoder effort; this runs offline, not in CI


def convert_one(png_path: Path, *, keep_png: bool, dry_run: bool) -> tuple[int, int]:
    """Returns (png_bytes, webp_bytes)."""
    webp_path = png_path.with_suffix(".webp")
    png_bytes = png_path.stat().st_size

    if dry_run:
        return png_bytes, png_bytes

    image = Image.open(png_path).convert("RGBA")
    image.save(webp_path, "WEBP", quality=WEBP_QUALITY, method=WEBP_METHOD)
    webp_bytes = webp_path.stat().st_size

    # Keep the atlas JSON's meta.image honest (tooling/documentation only -
    # Phaser never reads it, load.atlas is given an explicit texture URL).
    json_path = png_path.with_suffix(".json")
    if json_path.exists():
        data = json.loads(json_path.read_text())
        meta = data.get("meta")
        if isinstance(meta, dict) and meta.get("image") == png_path.name:
            meta["image"] = webp_path.name
            json_path.write_text(json.dumps(data, indent=2) + "\n")

    if not keep_png:
        png_path.unlink()

    return png_bytes, webp_bytes


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--keep", action="store_true", help="keep the source PNGs (default: delete them)")
    parser.add_argument("--dry-run", action="store_true", help="list what would be converted, change nothing")
    args = parser.parse_args()

    png_paths = sorted(PUBLIC_ART_DIR.rglob("*.png"))
    if not png_paths:
        print("No PNGs under public/art/ - nothing to convert.")
        return

    total_png = 0
    total_webp = 0
    for png_path in png_paths:
        png_bytes, webp_bytes = convert_one(png_path, keep_png=args.keep, dry_run=args.dry_run)
        total_png += png_bytes
        total_webp += webp_bytes
        rel = png_path.relative_to(REPO_ROOT)
        print(f"  {rel}  {png_bytes / 1024:8.1f} KB -> {webp_bytes / 1024:8.1f} KB")

    saved = total_png - total_webp
    pct = (100 * saved / total_png) if total_png else 0
    print(
        f"\n{len(png_paths)} file(s): {total_png / 1024 / 1024:.2f} MB PNG -> "
        f"{total_webp / 1024 / 1024:.2f} MB WebP ({pct:.0f}% smaller, quality={WEBP_QUALITY})"
    )


if __name__ == "__main__":
    main()
