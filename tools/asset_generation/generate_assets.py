#!/usr/bin/env python3
"""
Automates generating every game art asset described in
docs/ASSET_GENERATION_CHECKLIST.md via the Gemini image-generation API, and
packs the results straight into public/art/ in the exact format the game's
BootScene.preload() expects.

Pipeline per frame:
  1. generate  — call Gemini with the shared style template + this frame's
                 SUBJECT text, save the raw PNG under raw/<category>/<frame>.png
  2. process   — chroma-key the #FF00FF background to real alpha (skipped for
                 terrain tiles, which stay opaque) and downscale to the exact
                 final pixel size, saved under frames/<category>/<frame>.png
  3. pack      — combine every processed frame in a category, left-to-right,
                 into public/art/<atlas>-atlas.png + .json

Usage examples:
  python generate_assets.py --list
  python generate_assets.py --category buildings --dry-run
  python generate_assets.py --category tiles
  python generate_assets.py --category buildings --frame building-Well
  python generate_assets.py --all --delay 6
  python generate_assets.py --category vegetation --step process,pack   # re-pack without re-calling the API

Setup:
  pip install -r requirements.txt
  export GEMINI_API_KEY=your-key-here

See README.md in this directory for the full walkthrough.
"""

from __future__ import annotations

import argparse
import sys
import textwrap
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))

from lib.image_ops import chroma_key_to_alpha, downscale_exact, pack_atlas  # noqa: E402
from manifest import CATEGORIES, CATEGORIES_BY_KEY, Category, Frame  # noqa: E402

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent.parent
RAW_DIR = SCRIPT_DIR / "raw"
FRAMES_DIR = SCRIPT_DIR / "frames"
PUBLIC_ART_DIR = REPO_ROOT / "public" / "art"


def load_dotenv(path: Path) -> None:
    """Minimal .env loader (no python-dotenv dependency needed for one
    variable) — sets os.environ from KEY=VALUE lines, skipping blanks/
    comments, without overwriting a variable already set in the real
    environment."""
    import os

    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


load_dotenv(SCRIPT_DIR / ".env")

# Pasted before every SUBJECT, mirroring docs/ASSET_GENERATION_CHECKLIST.md
# §2.10's reusable prompt template verbatim (kept in sync by hand — if the
# checklist's shared style guide changes, update this block to match).
STYLE_TEMPLATE = textwrap.dedent(
    """\
    STYLE: Hand-painted detailed pixel art game sprite, in the style of a
    classic late-1990s 2D settlement-building strategy game (Settlers II /
    Caesar III sprite quality). Dense readable detail, painterly dithered
    shading, crisp hard pixel edges, no anti-aliasing, no blur, no gradients.

    PERSPECTIVE: This is a MAP ICON for a flat 2D tile-based game, viewed
    almost straight from above — like a satellite/drone photo with only a
    very slight forward tilt (10-15 degrees), NOT a 3D-rendered game asset.
    Picture looking almost straight down at a dollhouse from just above and
    slightly in front of it.

    GEOMETRY TEST (must pass): if you trace the outer silhouette of the
    building's base/foundation, it must form an axis-aligned rectangle — top
    edge horizontal, bottom edge horizontal, left and right edges vertical,
    with four roughly 90-degree corners. It must NOT form a diamond/rhombus
    shape (a square rotated 45 degrees) — that shape means you drew
    isometric/dimetric 3D-game perspective, which is WRONG for this asset
    and must be avoided entirely.

    You should NOT be able to see the left or right SIDE wall of the
    building at all, not even a sliver — only the front face directly facing
    the viewer, and the roof/top surface compressed above it. No corner of
    the building points toward the viewer; a flat wall faces the viewer
    instead. Do not render this like Age of Empires, Clash of Clans, Stardew
    Valley building icons, or any isometric city-builder — those are all the
    WRONG style. Render it more like a simple flat top-down map icon or
    architectural roof-plan sketch with a touch of front-face detail added.

    LIGHTING: Single light source from the upper LEFT, high angle. Top and
    left surfaces lit, bottom and right surfaces in shadow, cast shadows
    fall to the lower right. Shadows are warm brown-tinted, never grey/blue.

    OUTLINE: Thin 1-pixel selective outline around the outer silhouette
    only, in a darker shade of each part's own local color (NOT flat
    black). No outline on interior details.

    PALETTE: Restricted, sun-bleached American Old West / desert frontier
    palette. Wood tones #3E2723 #4E342E #5D4037 #6D4C41 #8D6748 #C9A063.
    Ground tones #9C7B52 #8A8172 #D2B48C. Bone/cream #D7CCC8. Use AT MOST
    ONE saturated accent from: barn red #B71C1C, brass gold #FFD54F, forge
    orange #FF7043, sage green #689F38, sky-blue glass #90CAF9. NO pure
    black, NO pure white, NO neon colors. Warm, dusty, sun-faded overall.
    """
)

TERRAIN_EXTRA = textwrap.dedent(
    """\
    BACKGROUND: Fully opaque, edge-to-edge, no transparency. Seamless
    tileable texture, uniform lighting across the entire tile, no vignette,
    no centered subject, detail spread evenly to all four edges — this tile
    repeats hundreds of times across the map, so a visible tile boundary
    when repeated is a failure.

    FRAMING: Fills the entire frame edge-to-edge, no border, no margin.
    """
)

NON_TERRAIN_EXTRA = textwrap.dedent(
    """\
    BACKGROUND: Solid flat magenta #FF00FF background, completely uniform,
    no gradient, no texture. Subject must not touch the frame edges. Clean
    hard edges against the magenta for easy removal.

    FRAMING: Single object, centered, filling the frame. No text, no
    labels, no watermark, no UI, no border.
    """
)


def build_prompt(frame: Frame, category: Category) -> str:
    extra = TERRAIN_EXTRA if category.terrain else NON_TERRAIN_EXTRA
    gen = frame.gen if isinstance(frame.gen, tuple) else (frame.gen, frame.gen)
    return (
        f"{STYLE_TEMPLATE}\n{extra}\n"
        f"SUBJECT: {frame.subject}\n\n"
        f"CANVAS: {gen[0]}x{gen[1]}px"
    )


def raw_path(category: Category, frame: Frame) -> Path:
    return RAW_DIR / category.key / f"{frame.name}.png"


def processed_path(category: Category, frame: Frame) -> Path:
    return FRAMES_DIR / category.key / f"{frame.name}.png"


def gen_size(frame: Frame) -> tuple[int, int]:
    return frame.gen if isinstance(frame.gen, tuple) else (frame.gen, frame.gen)


def step_generate(category: Category, frame: Frame, client, force: bool, dry_run: bool, reference: Path | None) -> None:
    out_path = raw_path(category, frame)
    prompt = build_prompt(frame, category)

    if dry_run:
        print(f"  [dry-run] {frame.name} -> {out_path.relative_to(SCRIPT_DIR)}")
        print(textwrap.indent(prompt, "      "))
        return

    if out_path.exists() and not force:
        print(f"  [skip]    {frame.name} (raw already exists, use --force to regenerate)")
        return

    print(f"  [gen]     {frame.name} ...")
    reference_images = None
    if reference and reference.exists():
        reference_images = [reference.read_bytes()]

    image = client.generate_image(prompt, gen_size(frame), reference_images=reference_images)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(out_path)
    print(f"  [gen]     {frame.name} -> {out_path.relative_to(SCRIPT_DIR)} ({image.size[0]}x{image.size[1]}px)")


def step_process(category: Category, frame: Frame, dry_run: bool) -> None:
    src_path = raw_path(category, frame)
    out_path = processed_path(category, frame)

    if dry_run:
        print(f"  [dry-run] would process {frame.name} -> {out_path.relative_to(SCRIPT_DIR)}")
        return

    if not src_path.exists():
        print(f"  [MISSING] {frame.name}: no raw image at {src_path.relative_to(SCRIPT_DIR)} — run the generate step first")
        return

    img = Image.open(src_path)
    if not category.terrain:
        img = chroma_key_to_alpha(img)
    else:
        img = img.convert("RGB")
    img = downscale_exact(img, frame.w, frame.h)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path)
    print(f"  [process] {frame.name} -> {out_path.relative_to(SCRIPT_DIR)} ({frame.w}x{frame.h}px)")


def step_pack(category: Category, dry_run: bool) -> None:
    frame_images: list[tuple[str, Image.Image]] = []
    missing = []
    for frame in category.frames:
        path = processed_path(category, frame)
        if not path.exists():
            missing.append(frame.name)
            continue
        img = Image.open(path).convert("RGBA" if not category.terrain else "RGB")
        if img.size != (frame.w, frame.h):
            print(f"  [WARN]    {frame.name}: processed file is {img.size}, expected {(frame.w, frame.h)} — re-run the process step")
        frame_images.append((frame.name, img))

    if missing:
        print(f"  [MISSING] cannot pack '{category.key}' — missing processed frames: {', '.join(missing)}")
        return

    png_path = PUBLIC_ART_DIR / f"{category.atlas_basename}-atlas.png"
    json_path = PUBLIC_ART_DIR / f"{category.atlas_basename}-atlas.json"

    if dry_run:
        print(f"  [dry-run] would pack {len(frame_images)} frames -> {png_path.relative_to(REPO_ROOT)}")
        return

    # Terrain frames must stay RGB/opaque in the final PNG too, but
    # pack_atlas() always builds an RGBA canvas — convert back before saving
    # so the tileset never picks up an unintended alpha channel.
    if category.terrain:
        rgba_frames = [(name, img.convert("RGBA")) for name, img in frame_images]
        width, height = pack_atlas(rgba_frames, png_path, json_path, png_path.name)
        Image.open(png_path).convert("RGB").save(png_path)
    else:
        width, height = pack_atlas(frame_images, png_path, json_path, png_path.name)

    print(f"  [pack]    {category.atlas_basename}-atlas.png ({width}x{height}px, {len(frame_images)} frames) -> {png_path.relative_to(REPO_ROOT)}")


def run_category(category: Category, args, client) -> None:
    print(f"\n=== {category.key} ({len(category.frames)} frames) -> public/art/{category.atlas_basename}-atlas.png ===")
    frames = [f for f in category.frames if args.frame is None or f.name == args.frame]
    if not frames:
        print(f"  no frame named '{args.frame}' in category '{category.key}'")
        return

    reference = Path(args.reference).resolve() if args.reference else None

    steps = args.step.split(",")
    if "generate" in steps:
        for frame in frames:
            step_generate(category, frame, client, args.force, args.dry_run, reference)
            if not args.dry_run and client is not None:
                import time

                time.sleep(args.delay)

    if "process" in steps:
        for frame in frames:
            step_process(category, frame, args.dry_run)

    if "pack" in steps and args.frame is None:
        step_pack(category, args.dry_run)
    elif "pack" in steps:
        print("  [skip]    pack step skipped: --frame restricts to a single frame, packing needs the whole category")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--list", action="store_true", help="list categories and frame counts, then exit")
    parser.add_argument("--category", action="append", help="category key to process (repeatable). See --list.")
    parser.add_argument("--all", action="store_true", help="process every category")
    parser.add_argument("--frame", help="restrict to a single frame name within the given --category (for re-rolling one bad asset)")
    parser.add_argument(
        "--step",
        default="generate,process,pack",
        help="comma-separated subset of generate,process,pack to run (default: all three)",
    )
    parser.add_argument("--force", action="store_true", help="regenerate raw images even if already cached")
    parser.add_argument("--dry-run", action="store_true", help="print prompts/actions without calling the API or writing files")
    parser.add_argument("--delay", type=float, default=5.0, help="seconds to sleep between API calls (default 5)")
    parser.add_argument("--model", default=None, help="override the Gemini model id (default: gemini-3.1-flash-image)")
    parser.add_argument("--api-key", default=None, help="Gemini API key (default: GEMINI_API_KEY env var)")
    parser.add_argument(
        "--reference",
        default=None,
        help="path to a PNG used as a style-consistency reference image for every generate call in this run "
        "(see checklist §2.11 — pick a favorite generated building/unit and reuse it across the rest of that category)",
    )
    args = parser.parse_args()

    if args.list:
        for c in CATEGORIES:
            print(f"{c.key:16s} {len(c.frames):3d} frames  -> public/art/{c.atlas_basename}-atlas.png{' (terrain)' if c.terrain else ''}")
            for f in c.frames:
                print(f"    {f.name:32s} {f.w}x{f.h}")
        return

    if args.all:
        selected = list(CATEGORIES)
    elif args.category:
        selected = []
        for key in args.category:
            if key not in CATEGORIES_BY_KEY:
                parser.error(f"unknown category '{key}'. Run --list to see valid keys.")
            selected.append(CATEGORIES_BY_KEY[key])
    else:
        parser.error("pass --category <key> (repeatable), --all, or --list")

    client = None
    if not args.dry_run and "generate" in args.step.split(","):
        import os

        from lib.gemini_client import DEFAULT_MODEL, GeminiImageClient

        api_key = args.api_key or os.environ.get("GEMINI_API_KEY")
        if not api_key:
            parser.error("no API key: pass --api-key or set the GEMINI_API_KEY environment variable")
        client = GeminiImageClient(api_key=api_key, model=args.model or DEFAULT_MODEL)

    for category in selected:
        run_category(category, args, client)

    print("\nDone. Run `npm run verify:art` from the repo root to confirm every atlas matches the pipeline's expectations.")


if __name__ == "__main__":
    main()
