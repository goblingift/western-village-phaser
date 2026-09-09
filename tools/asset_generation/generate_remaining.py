#!/usr/bin/env python3
"""
One-off script generating the final 7 categories (raiders, wildlife, raider
camps, vegetation, carts, accents, resource icons) at ART_SCALE=4, using
grid-batching where safe (same technique as generate_buildings.py) and solo
calls for accents (precise non-uniform pivoted sizes, not worth the batching
risk for 6 frames).

Usage: python generate_remaining.py [--dry-run]
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))

from generate_assets import NON_TERRAIN_EXTRA, STYLE_TEMPLATE, build_prompt  # noqa: E402
from lib.image_ops import chroma_key_to_alpha, downscale_exact, pack_atlas, strip_magenta_family  # noqa: E402
from manifest import ACCENTS, CARTS, RAIDER_CAMPS, RAIDERS, RESOURCE_ICONS, VEGETATION, WILDLIFE  # noqa: E402

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent.parent
RAW_DIR = SCRIPT_DIR / "raw" / "remaining"
PUBLIC_ART_DIR = REPO_ROOT / "public" / "art"

ART_SCALE = 4
CELL_LABELS = ["top-left", "top-right", "bottom-left", "bottom-right"]
GRID_CELL_POSITIONS = [(0, 0), (1, 0), (0, 1), (1, 1)]


def build_grid_prompt(subjects: list[str]) -> str:
    lines = [f"- {CELL_LABELS[i]} cell: {s}" for i, s in enumerate(subjects)]
    for i in range(len(subjects), 4):
        lines.append(f"- {CELL_LABELS[i]} cell: leave EMPTY (solid magenta background only, no artwork).")
    subject_block = (
        "A single 2x2 grid sprite sheet, four cells with a clear ~40px empty "
        "magenta gutter between every cell (so each cell can be cropped out "
        "separately later) and no cell's artwork crossing into another cell's "
        "quadrant. Every non-empty cell must be at the SAME camera "
        "angle/perspective/scale/style as every other:\n" + "\n".join(lines)
    )
    return f"{STYLE_TEMPLATE}\n{NON_TERRAIN_EXTRA}\nSUBJECT: {subject_block}\n\nCANVAS: exactly 2048x2048px, each of the 4 quadrants exactly 1024x1024px."


def crop_grid_cells(img: Image.Image, count: int) -> list[Image.Image]:
    width, height = img.size
    cell_w, cell_h = width // 2, height // 2
    cells = []
    for i in range(count):
        cx, cy = GRID_CELL_POSITIONS[i]
        cells.append(img.crop((cx * cell_w, cy * cell_h, (cx + 1) * cell_w, (cy + 1) * cell_h)))
    return cells


def process_frame(raw_img: Image.Image, target_w: int, target_h: int) -> Image.Image:
    keyed = chroma_key_to_alpha(raw_img)
    master = downscale_exact(keyed, target_w, target_h)
    return strip_magenta_family(master)


def run_batched_category(cat, client, delay: float, dry_run: bool) -> None:
    print(f"\n=== {cat.key} (batched, {len(cat.frames)} frames) ===")
    raw_path = RAW_DIR / f"{cat.key}.png"

    if dry_run:
        prompt = build_grid_prompt([f.subject for f in cat.frames])
        print("  [dry-run] " + prompt[:200] + "...")
        return

    if raw_path.exists():
        print(f"  [skip-gen] {cat.key} (cached raw)")
    else:
        prompt = build_grid_prompt([f.subject for f in cat.frames])
        print(f"  [gen] requesting batch of {len(cat.frames)}...")
        img = client.generate_image(prompt, (2048, 2048))
        raw_path.parent.mkdir(parents=True, exist_ok=True)
        img.save(raw_path)
        print(f"  [gen] saved ({img.size[0]}x{img.size[1]}px)")
        time.sleep(delay)

    img = Image.open(raw_path)
    cells = crop_grid_cells(img, len(cat.frames))
    frames = []
    for frame, cell in zip(cat.frames, cells):
        processed = process_frame(cell, frame.w * ART_SCALE, frame.h * ART_SCALE)
        frames.append((frame.name, processed))

    png_path = PUBLIC_ART_DIR / f"{cat.atlas_basename}-atlas.png"
    json_path = PUBLIC_ART_DIR / f"{cat.atlas_basename}-atlas.json"
    w, h = pack_atlas(frames, png_path, json_path, png_path.name)
    print(f"  [pack] {cat.atlas_basename}-atlas.png ({w}x{h}px, {len(frames)} frames)")


def run_solo_category(cat, client, delay: float, dry_run: bool) -> None:
    print(f"\n=== {cat.key} (solo, {len(cat.frames)} frames) ===")
    frames = []
    for frame in cat.frames:
        raw_path = RAW_DIR / f"{frame.name}.png"
        if dry_run:
            print(f"  [dry-run] {frame.name}")
            continue
        if raw_path.exists():
            print(f"  [skip-gen] {frame.name} (cached raw)")
        else:
            prompt = build_prompt(frame, cat)
            gen_size = frame.gen if isinstance(frame.gen, tuple) else (frame.gen, frame.gen)
            print(f"  [gen] {frame.name} ...")
            img = client.generate_image(prompt, gen_size)
            raw_path.parent.mkdir(parents=True, exist_ok=True)
            img.save(raw_path)
            print(f"  [gen] saved ({img.size[0]}x{img.size[1]}px)")
            time.sleep(delay)
        img = Image.open(raw_path)
        processed = process_frame(img, frame.w * ART_SCALE, frame.h * ART_SCALE)
        frames.append((frame.name, processed))

    if dry_run:
        return

    png_path = PUBLIC_ART_DIR / f"{cat.atlas_basename}-atlas.png"
    json_path = PUBLIC_ART_DIR / f"{cat.atlas_basename}-atlas.json"
    w, h = pack_atlas(frames, png_path, json_path, png_path.name)
    print(f"  [pack] {cat.atlas_basename}-atlas.png ({w}x{h}px, {len(frames)} frames)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--delay", type=float, default=6.0)
    args = parser.parse_args()

    client = None
    if not args.dry_run:
        import os

        from lib.gemini_client import DEFAULT_MODEL, GeminiImageClient

        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            print("no GEMINI_API_KEY set")
            sys.exit(1)
        client = GeminiImageClient(api_key=api_key, model=DEFAULT_MODEL)

    for cat in [RAIDERS, WILDLIFE, RAIDER_CAMPS, VEGETATION]:
        run_batched_category(cat, client, args.delay, args.dry_run)

    run_solo_category(CARTS, client, args.delay, args.dry_run)
    run_solo_category(ACCENTS, client, args.delay, args.dry_run)

    # Resource icons: 15 frames, batch in groups of 4.
    icon_frames = RESOURCE_ICONS.frames
    for i in range(0, len(icon_frames), 4):
        batch = icon_frames[i : i + 4]
        print(f"\n=== resource-icons batch {i // 4} ({len(batch)} frames) ===")
        raw_path = RAW_DIR / f"resource-icons-{i // 4}.png"
        if args.dry_run:
            prompt = build_grid_prompt([f.subject for f in batch])
            print("  [dry-run] " + prompt[:200] + "...")
            continue
        if raw_path.exists():
            print(f"  [skip-gen] batch {i // 4} (cached raw)")
        else:
            prompt = build_grid_prompt([f.subject for f in batch])
            print(f"  [gen] requesting batch of {len(batch)}...")
            img = client.generate_image(prompt, (2048, 2048))
            raw_path.parent.mkdir(parents=True, exist_ok=True)
            img.save(raw_path)
            print(f"  [gen] saved ({img.size[0]}x{img.size[1]}px)")
            time.sleep(args.delay)
        img = Image.open(raw_path)
        cells = crop_grid_cells(img, len(batch))
        for frame, cell in zip(batch, cells):
            processed = process_frame(cell, frame.w * ART_SCALE, frame.h * ART_SCALE)
            out_dir = RAW_DIR.parent.parent / "frames" / "resource-icons"
            out_dir.mkdir(parents=True, exist_ok=True)
            processed.save(out_dir / f"{frame.name}.png")

    if not args.dry_run:
        # Pack all 15 resource icons from the processed frame files.
        frames = []
        frames_dir = RAW_DIR.parent.parent / "frames" / "resource-icons"
        for frame in icon_frames:
            frames.append((frame.name, Image.open(frames_dir / f"{frame.name}.png")))
        png_path = PUBLIC_ART_DIR / f"{RESOURCE_ICONS.atlas_basename}-atlas.png"
        json_path = PUBLIC_ART_DIR / f"{RESOURCE_ICONS.atlas_basename}-atlas.json"
        w, h = pack_atlas(frames, png_path, json_path, png_path.name)
        print(f"  [pack] {RESOURCE_ICONS.atlas_basename}-atlas.png ({w}x{h}px, {len(frames)} frames)")


if __name__ == "__main__":
    main()
