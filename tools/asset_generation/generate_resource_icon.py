#!/usr/bin/env python3
"""Generate ONE new resource icon and repack the resource-icons atlas.

Why this exists (Phase 94): `generate_remaining.py` regenerates the resource
icons in fixed batches of 4, keyed by index (`raw/remaining/resource-icons-N.png`).
Adding a 16th `ResourceKey` changes the membership of the last batch, so
re-running that script would re-crop a cached 3-cell image as if it had 4
cells and silently corrupt three already-good icons. Adding a resource is
going to keep happening, so it gets its own safe entry point rather than a
one-off snippet.

What it does:
  1. generates the named icon alone (1 subject in the same 2x2 grid prompt
     shape every other batched category uses, 3 cells left empty - exactly
     what `generate_buildings.py --batch <one>` already does);
  2. writes the processed frame to frames/resource-icons/<name>.png, the same
     cache every other icon already lives in;
  3. repacks resource-icons-atlas.png/.json from ALL frames in the manifest,
     so the atlas stays complete and correctly ordered.

Every other icon is read from its cached processed frame - no other icon is
regenerated, and no other API call is made.

Usage:
  python generate_resource_icon.py --name resource-icon-rifles
  python generate_resource_icon.py --name resource-icon-rifles --dry-run
  python generate_resource_icon.py --repack-only     # no API call at all

Remember to run convert_to_webp.py afterwards - the game only loads .webp.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))

from generate_remaining import build_grid_prompt, crop_grid_cells, process_frame  # noqa: E402
from lib.image_ops import pack_atlas  # noqa: E402
from manifest import RESOURCE_ICONS  # noqa: E402

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent.parent
RAW_DIR = SCRIPT_DIR / "raw" / "remaining"
FRAMES_DIR = SCRIPT_DIR / "frames" / "resource-icons"
PUBLIC_ART_DIR = REPO_ROOT / "public" / "art"

ART_SCALE = 4


def generate_one(name: str, dry_run: bool) -> None:
    frame = next((f for f in RESOURCE_ICONS.frames if f.name == name), None)
    if frame is None:
        known = ", ".join(f.name for f in RESOURCE_ICONS.frames)
        sys.exit(f"Unknown icon frame '{name}'. Known frames: {known}")

    prompt = build_grid_prompt([frame.subject])
    if dry_run:
        print(prompt)
        return

    raw_path = RAW_DIR / f"{name}.png"
    if raw_path.exists():
        print(f"  [skip-gen] {name} (cached raw at {raw_path.relative_to(REPO_ROOT)})")
    else:
        from lib.gemini_client import DEFAULT_MODEL, GeminiImageClient

        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            # Same .env convention the other generators use.
            env_path = SCRIPT_DIR / ".env"
            if env_path.exists():
                for line in env_path.read_text().splitlines():
                    if line.startswith("GEMINI_API_KEY="):
                        api_key = line.split("=", 1)[1].strip()
        if not api_key:
            sys.exit("no GEMINI_API_KEY set (env or tools/asset_generation/.env)")

        client = GeminiImageClient(api_key=api_key, model=DEFAULT_MODEL)
        print(f"  [gen] requesting {name}...")
        img = client.generate_image(prompt, (2048, 2048))
        raw_path.parent.mkdir(parents=True, exist_ok=True)
        img.save(raw_path)
        print(f"  [gen] saved {raw_path.relative_to(REPO_ROOT)} ({img.size[0]}x{img.size[1]}px)")

    cell = crop_grid_cells(Image.open(raw_path), 1)[0]
    processed = process_frame(cell, frame.w * ART_SCALE, frame.h * ART_SCALE)
    FRAMES_DIR.mkdir(parents=True, exist_ok=True)
    processed.save(FRAMES_DIR / f"{name}.png")
    print(f"  [process] frames/resource-icons/{name}.png ({processed.size[0]}x{processed.size[1]}px)")


def repack() -> None:
    frames = []
    for frame in RESOURCE_ICONS.frames:
        path = FRAMES_DIR / f"{frame.name}.png"
        if not path.exists():
            sys.exit(f"Missing cached frame {path.relative_to(REPO_ROOT)} - generate it first.")
        frames.append((frame.name, Image.open(path)))

    png_path = PUBLIC_ART_DIR / f"{RESOURCE_ICONS.atlas_basename}-atlas.png"
    json_path = PUBLIC_ART_DIR / f"{RESOURCE_ICONS.atlas_basename}-atlas.json"
    w, h = pack_atlas(frames, png_path, json_path, png_path.name)
    print(f"  [pack] {RESOURCE_ICONS.atlas_basename}-atlas.png ({w}x{h}px, {len(frames)} frames)")
    print("  Now run: python3 tools/asset_generation/convert_to_webp.py")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", help="frame name from manifest.RESOURCE_ICONS, e.g. resource-icon-rifles")
    parser.add_argument("--dry-run", action="store_true", help="print the prompt, generate nothing")
    parser.add_argument("--repack-only", action="store_true", help="repack the atlas from cached frames, no API call")
    args = parser.parse_args()

    if not args.repack_only:
        if not args.name:
            sys.exit("--name is required unless --repack-only is passed")
        generate_one(args.name, args.dry_run)
        if args.dry_run:
            return

    repack()


if __name__ == "__main__":
    main()
