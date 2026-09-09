#!/usr/bin/env python3
"""
Automated per-building spriteset pipeline. Replaces the manual, one-off
Python snippets used to generate Well's real art with a real, repeatable
script covering all 34 buildings.

Cost strategy (see memory: gemini-grid-batching-discovery, asset-spritesets-scope):
  - Buildings of the same footprint are batched up to 4-per-call into one
    2x2 grid image (flat-rate pricing means 4 buildings ~= the price of 1).
  - Each cell is cropped into a per-building "master" (Intact) image.
  - Damaged/Ruined/Construction25/50/75 are derived LOCALLY (free,
    lib/post_process.py) from the master - no extra paid calls.
  - House is handled specially: it needs real Tier1/2/3 art (a genuine
    structural difference, not a filter), generated as its own 2x2 grid
    batch (Tier1/Tier2/Tier3 + 1 blank cell) - see --house.
  - Every building's states are packed into its own
    public/art/buildings/<BuildingType>.png/.json (asset-pipeline rework).

Usage:
  python generate_buildings.py --list                       # show batch plan, no cost
  python generate_buildings.py --all --dry-run               # print every prompt, no cost
  python generate_buildings.py --batch OstrichFarm,Butcher,PigFarm,CowRanch
  python generate_buildings.py --all --delay 8                # real run, all remaining buildings
  python generate_buildings.py --house                        # House's own Tier1/2/3 grid batch
  python generate_buildings.py --all --step process,pack      # re-run from cached raw/ only, no API calls
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))

from generate_assets import NON_TERRAIN_EXTRA, STYLE_TEMPLATE  # noqa: E402
from lib.image_ops import chroma_key_to_alpha, downscale_exact, pack_atlas  # noqa: E402
from lib.post_process import apply_construction_stage, apply_damage_state  # noqa: E402
from manifest import BUILDINGS  # noqa: E402

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent.parent
RAW_DIR = SCRIPT_DIR / "raw" / "buildings-v2"
PUBLIC_BUILDINGS_DIR = REPO_ROOT / "public" / "art" / "buildings"

ART_SCALE = 4  # supersample factor over the plain tile-footprint pixel size (see asset_generation_pipeline memory)
BATCH_SIZE = 4
GRID_CELL_POSITIONS = [(0, 0), (1, 0), (0, 1), (1, 1)]  # top-left, top-right, bottom-left, bottom-right
CELL_LABELS = ["top-left", "top-right", "bottom-left", "bottom-right"]

VARIANT_FRAME_NAMES = {"building-House-tier2", "building-House-tier3", "building-WoodenGate-closed"}


ALREADY_GENERATED_TYPES = {"House", "Well"}  # House: has its own --house tier-batch flow. Well: already shipped real art.


def building_entries() -> list[dict]:
    """Every base building (34), excluding House (handled separately by
    --house), Well (already has real generated art), and the 3
    texture-variant entries (not real buildings)."""
    entries = []
    for f in BUILDINGS.frames:
        if f.name in VARIANT_FRAME_NAMES:
            continue
        type_name = f.name.removeprefix("building-")
        if type_name in ALREADY_GENERATED_TYPES:
            continue
        entries.append({"type": type_name, "w": f.w, "h": f.h, "subject": f.subject})
    return entries


def group_into_batches(entries: list[dict], batch_size: int = BATCH_SIZE) -> list[list[dict]]:
    """Groups by (w, h) footprint pixel size so every cell in a batch shares
    the same aspect ratio/scale - a 1x1 and a 2x2 building side by side in
    one grid cell would force one of them to the wrong apparent scale."""
    by_footprint: dict[tuple[int, int], list[dict]] = {}
    for e in entries:
        by_footprint.setdefault((e["w"], e["h"]), []).append(e)

    batches = []
    for group in by_footprint.values():
        for i in range(0, len(group), batch_size):
            batches.append(group[i : i + batch_size])
    return batches


def build_grid_prompt(cell_subjects: list[str]) -> str:
    """cell_subjects: 1-4 SUBJECT strings, one per occupied cell, in
    top-left/top-right/bottom-left/bottom-right order. Fewer than 4 leaves
    the remaining cells explicitly blank."""
    lines = []
    for i, subject in enumerate(cell_subjects):
        lines.append(f"- {CELL_LABELS[i]} cell: {subject}")
    for i in range(len(cell_subjects), 4):
        lines.append(f"- {CELL_LABELS[i]} cell: leave EMPTY (solid magenta background only, no artwork).")

    subject_block = (
        "A single 2x2 grid sprite sheet, four cells with a clear ~40px empty "
        "magenta gutter between every cell (so each cell can be cropped out "
        "separately later) and no cell's artwork crossing into another cell's "
        "quadrant. Every non-empty cell must be at the SAME camera "
        "angle/perspective/scale/style (each is a completely different, unrelated "
        "building - they do NOT need to look like the same building, only the "
        "SAME rendering style/scale/perspective as each other):\n" + "\n".join(lines)
    )
    return f"{STYLE_TEMPLATE}\n{NON_TERRAIN_EXTRA}\nSUBJECT: {subject_block}\n\nCANVAS: exactly 2048x2048px, each of the 4 quadrants exactly 1024x1024px."


def build_house_tier_prompt() -> str:
    subject_block = (
        "A single 2x2 grid sprite sheet, four DISTINCT sub-images arranged in a "
        "strict 2x2 grid with a clear ~40px empty magenta gutter between every "
        "cell (so each cell can be cropped out separately later) and no cell's "
        "artwork crossing into another cell's quadrant:\n"
        "- top-left cell: a small modest wooden frontier House (Tier 1) - single window, simple door.\n"
        "- top-right cell: the SAME house upgraded to Tier 2 - a second window row, painted trim stripe, "
        "more prosperous look. Same exact camera angle/perspective/style/scale as the Tier 1 cell.\n"
        "- bottom-left cell: the SAME house upgraded further to Tier 3 - twin windows, a small balcony "
        "rail, flagged parapet, gold trim accent, most prosperous. Same exact camera angle/perspective/"
        "style/scale as the other cells.\n"
        "- bottom-right cell: leave this cell EMPTY (solid magenta background only, no artwork).\n"
        "All three house cells must be the same building at the same scale/size/camera angle, differing "
        "ONLY in their tier upgrade details, so they can be used as interchangeable game sprites at "
        "identical dimensions."
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


def raw_batch_path(batch_index: int | str, footprint: tuple[int, int]) -> Path:
    return RAW_DIR / f"batch-{footprint[0]}x{footprint[1]}-{batch_index}.png"


def raw_house_path() -> Path:
    return RAW_DIR / "house-tiers.png"


def process_building(type_name: str, master_w: int, master_h: int, raw_cell: Image.Image, dry_run: bool) -> None:
    """Chroma-key + downscale the cropped cell into a master (Intact) image,
    derive Damaged/Ruined/Construction25/50/75 locally, and pack all 6 into
    public/art/buildings/<type_name>.png/.json."""
    target_w, target_h = master_w * ART_SCALE, master_h * ART_SCALE

    if dry_run:
        print(f"  [dry-run] would process+pack {type_name} -> {target_w}x{target_h}px master + 5 derived states")
        return

    keyed = chroma_key_to_alpha(raw_cell)
    master = downscale_exact(keyed, target_w, target_h)

    states = {
        "Intact": master,
        "Damaged": apply_damage_state(master, "damaged", seed=hash(type_name) & 0xFFFF),
        "Ruined": apply_damage_state(master, "ruined", seed=hash(type_name) & 0xFFFF),
        "Construction25": apply_construction_stage(master, 25, seed=hash(type_name) & 0xFFFF),
        "Construction50": apply_construction_stage(master, 50, seed=hash(type_name) & 0xFFFF),
        "Construction75": apply_construction_stage(master, 75, seed=hash(type_name) & 0xFFFF),
    }
    frame_list = [(name, img) for name, img in states.items()]

    PUBLIC_BUILDINGS_DIR.mkdir(parents=True, exist_ok=True)
    png_path = PUBLIC_BUILDINGS_DIR / f"{type_name}.png"
    json_path = PUBLIC_BUILDINGS_DIR / f"{type_name}.json"
    width, height = pack_atlas(frame_list, png_path, json_path, png_path.name)
    print(f"  [pack]    {type_name}.png ({width}x{height}px, {len(frame_list)} frames)")


def process_house(raw_img: Image.Image, dry_run: bool) -> None:
    house_frame = next(f for f in BUILDINGS.frames if f.name == "building-House")
    w, h = house_frame.w, house_frame.h
    target_w, target_h = w * ART_SCALE, h * ART_SCALE

    if dry_run:
        print(f"  [dry-run] would process+pack House -> {target_w}x{target_h}px, Tier1/2/3 + derived Damaged/Ruined/Construction from Tier1")
        return

    tier1_raw, tier2_raw, tier3_raw = crop_grid_cells(raw_img, 3)
    tier1 = downscale_exact(chroma_key_to_alpha(tier1_raw), target_w, target_h)
    tier2 = downscale_exact(chroma_key_to_alpha(tier2_raw), target_w, target_h)
    tier3 = downscale_exact(chroma_key_to_alpha(tier3_raw), target_w, target_h)

    states = {
        "Intact": tier1,
        "Tier2": tier2,
        "Tier3": tier3,
        "Damaged": apply_damage_state(tier1, "damaged", seed=1),
        "Ruined": apply_damage_state(tier1, "ruined", seed=1),
        "Construction25": apply_construction_stage(tier1, 25, seed=1),
        "Construction50": apply_construction_stage(tier1, 50, seed=1),
        "Construction75": apply_construction_stage(tier1, 75, seed=1),
    }
    frame_list = [(name, img) for name, img in states.items()]

    PUBLIC_BUILDINGS_DIR.mkdir(parents=True, exist_ok=True)
    png_path = PUBLIC_BUILDINGS_DIR / "House.png"
    json_path = PUBLIC_BUILDINGS_DIR / "House.json"
    width, height = pack_atlas(frame_list, png_path, json_path, png_path.name)
    print(f"  [pack]    House.png ({width}x{height}px, {len(frame_list)} frames)")


def run_batch(batch: list[dict], batch_index: int | str, client, args) -> None:
    footprint = (batch[0]["w"], batch[0]["h"])
    names = ", ".join(e["type"] for e in batch)
    print(f"\n=== batch {batch_index} ({footprint[0]}x{footprint[1]}px footprint): {names} ===")

    raw_path = raw_batch_path(batch_index, footprint)
    steps = args.step.split(",")

    if "generate" in steps:
        if args.dry_run:
            prompt = build_grid_prompt([e["subject"] for e in batch])
            print(f"  [dry-run] {raw_path.relative_to(SCRIPT_DIR)}")
            print("      " + prompt.replace("\n", "\n      "))
        elif raw_path.exists() and not args.force:
            print(f"  [skip]    raw batch image already exists ({raw_path.relative_to(SCRIPT_DIR)})")
        else:
            prompt = build_grid_prompt([e["subject"] for e in batch])
            print(f"  [gen]     requesting batch of {len(batch)}...")
            img = client.generate_image(prompt, (2048, 2048))
            raw_path.parent.mkdir(parents=True, exist_ok=True)
            img.save(raw_path)
            print(f"  [gen]     saved {raw_path.relative_to(SCRIPT_DIR)} ({img.size[0]}x{img.size[1]}px)")
            time.sleep(args.delay)

    if "process" in steps or "pack" in steps:
        if args.dry_run:
            for e in batch:
                process_building(e["type"], e["w"], e["h"], None, dry_run=True)
            return
        if not raw_path.exists():
            print(f"  [MISSING] no raw batch image at {raw_path.relative_to(SCRIPT_DIR)} - run the generate step first")
            return
        img = Image.open(raw_path)
        cells = crop_grid_cells(img, len(batch))
        for entry, cell in zip(batch, cells):
            process_building(entry["type"], entry["w"], entry["h"], cell, dry_run=False)


def run_house(client, args) -> None:
    print("\n=== House (Tier 1/2/3 grid batch) ===")
    raw_path = raw_house_path()
    steps = args.step.split(",")

    if "generate" in steps:
        if args.dry_run:
            prompt = build_house_tier_prompt()
            print(f"  [dry-run] {raw_path.relative_to(SCRIPT_DIR)}")
            print("      " + prompt.replace("\n", "\n      "))
        elif raw_path.exists() and not args.force:
            print(f"  [skip]    raw House tier image already exists ({raw_path.relative_to(SCRIPT_DIR)})")
        else:
            prompt = build_house_tier_prompt()
            print("  [gen]     requesting House Tier1/2/3...")
            img = client.generate_image(prompt, (2048, 2048))
            raw_path.parent.mkdir(parents=True, exist_ok=True)
            img.save(raw_path)
            print(f"  [gen]     saved {raw_path.relative_to(SCRIPT_DIR)} ({img.size[0]}x{img.size[1]}px)")
            time.sleep(args.delay)

    if "process" in steps or "pack" in steps:
        if args.dry_run:
            process_house(None, dry_run=True)
            return
        if not raw_path.exists():
            print(f"  [MISSING] no raw House tier image at {raw_path.relative_to(SCRIPT_DIR)} - run the generate step first")
            return
        process_house(Image.open(raw_path), dry_run=False)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--list", action="store_true", help="print the batch plan (which buildings group together) and exit, no cost")
    parser.add_argument("--all", action="store_true", help="process every batch + House")
    parser.add_argument("--batch", help="comma-separated list of building types to run as one explicit batch (max 4, must share footprint)")
    parser.add_argument("--house", action="store_true", help="run House's own Tier1/2/3 grid batch")
    parser.add_argument("--step", default="generate,process,pack", help="comma-separated subset of generate,process,pack")
    parser.add_argument("--force", action="store_true", help="regenerate raw batch images even if cached")
    parser.add_argument("--dry-run", action="store_true", help="print prompts/actions without calling the API or writing files")
    parser.add_argument("--delay", type=float, default=6.0, help="seconds to sleep after each real API call (default 6)")
    parser.add_argument("--model", default=None, help="override the Gemini model id")
    parser.add_argument("--api-key", default=None, help="Gemini API key (default: GEMINI_API_KEY env var / .env)")
    args = parser.parse_args()

    entries = building_entries()
    batches = group_into_batches(entries)

    if args.list:
        print(f"{len(entries)} buildings (excluding House) grouped into {len(batches)} batches of up to {BATCH_SIZE}:\n")
        for i, batch in enumerate(batches):
            footprint = (batch[0]["w"], batch[0]["h"])
            print(f"  batch {i} ({footprint[0]}x{footprint[1]}px): {', '.join(e['type'] for e in batch)}")
        print("\n  House: handled separately via --house (needs real Tier1/2/3 art, not just Intact)")
        print(f"\nEstimated real cost: {len(batches)} batch calls + 1 House call, ~$0.134 each = ~${(len(batches) + 1) * 0.134:.2f}")
        return

    client = None
    if not args.dry_run and "generate" in args.step.split(","):
        import os

        from lib.gemini_client import DEFAULT_MODEL, GeminiImageClient

        api_key = args.api_key or os.environ.get("GEMINI_API_KEY")
        if not api_key:
            parser.error("no API key: pass --api-key or set GEMINI_API_KEY (or tools/asset_generation/.env)")
        client = GeminiImageClient(api_key=api_key, model=args.model or DEFAULT_MODEL)

    if args.house:
        run_house(client, args)
        return

    if args.batch:
        types = [t.strip() for t in args.batch.split(",")]
        selected = [e for e in entries if e["type"] in types]
        missing = set(types) - {e["type"] for e in selected}
        if missing:
            parser.error(f"unknown building type(s): {', '.join(missing)}")
        footprints = {(e["w"], e["h"]) for e in selected}
        if len(footprints) > 1:
            parser.error(f"--batch entries must share the same footprint, got: {footprints}")
        if len(selected) > BATCH_SIZE:
            parser.error(f"--batch supports at most {BATCH_SIZE} buildings per call, got {len(selected)}")
        # Use the batch's own type names (not a fixed index) for the raw cache
        # filename, so back-to-back --batch calls for different single
        # buildings don't overwrite each other's cached raw image.
        batch_tag = "-".join(e["type"] for e in selected)
        run_batch(selected, batch_tag, client, args)
        return

    if args.all:
        for i, batch in enumerate(batches):
            run_batch(batch, i, client, args)
        run_house(client, args)
        return

    parser.error("pass --list, --all, --batch <types>, or --house")


if __name__ == "__main__":
    main()
