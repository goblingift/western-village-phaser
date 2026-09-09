# AI Asset Generation Pipeline

Automates generating every image asset listed in
[`docs/ASSET_GENERATION_CHECKLIST.md`](../../docs/ASSET_GENERATION_CHECKLIST.md)
via the Gemini image-generation API, and drops the finished atlases directly
into `public/art/` at the exact filenames/frame names the game's
`BootScene.preload()` expects. No code changes are needed after running this
— it produces the same files the checklist tells you to hand-author.

`manifest.py` is a Python transcription of the checklist's 15 asset
categories (84 frames total): frame names, exact final pixel sizes, "generate
at" hints, and per-asset SUBJECT descriptions. If the checklist changes
(a building added/removed, a resource renamed, etc.), update `manifest.py`
to match — this script has no independent knowledge of the game's real
requirements.

## Setup

```bash
cd tools/asset_generation
python3 -m venv .venv && source .venv/bin/activate   # optional but recommended
pip install -r requirements.txt
```

Get a key at <https://aistudio.google.com/apikey>. Set it either way:

```bash
export GEMINI_API_KEY=your-key-here
# or, copy .env.example to .env and fill it in — generate_assets.py auto-loads it,
# and .env is gitignored so the key never gets committed.
cp .env.example .env
```

## Pipeline

Each frame goes through three steps (`--step generate,process,pack`, the
default — all three run unless you restrict it):

1. **generate** — calls Gemini with the shared style template (perspective,
   lighting, outline, palette — copied from the checklist's §2.10 prompt
   template) plus that frame's own SUBJECT text and "generate at" canvas
   size. Saves the raw result to `raw/<category>/<frame-name>.png` (gitignored
   — intermediate output, not a deliverable).
2. **process** — chroma-keys the `#FF00FF` magenta background to real
   transparency (skipped for terrain tiles, which stay opaque per the
   checklist's one exception) and does a sharp two-step downscale to the
   *exact* final pixel size. Saves to `frames/<category>/<frame-name>.png`
   (also gitignored).
3. **pack** — combines every processed frame in a category left-to-right
   into one atlas, writing `public/art/<atlas>-atlas.png` and the matching
   Phaser "JSONHash" `.json`, exactly like the existing placeholder
   generators in `tools/*.mjs` already do.

Because `generate`/`process`/`pack` are separate steps that read from disk,
you can re-run just `process,pack` after manually touching up a raw image,
without spending another API call.

## Usage

```bash
# See every category, frame name, and final size:
python generate_assets.py --list

# Preview the exact prompts without calling the API or touching public/art/:
python generate_assets.py --category tiles --dry-run

# Generate + process + pack one category (recommended: do this one row of
# the checklist's §15 table at a time, test in-game, then move to the next):
python generate_assets.py --category tiles
npm run verify:art        # from the repo root
npm run dev                # eyeball it in the browser

# Every category in one run (84 API calls — budget for the delay too):
python generate_assets.py --all --delay 6

# Re-roll a single bad asset without touching the rest of its category:
python generate_assets.py --category buildings --frame building-Saloon --force --step generate,process
python generate_assets.py --category buildings --step pack   # re-pack the whole atlas with the new frame

# Re-pack from already-processed frames only (no API calls):
python generate_assets.py --category vegetation --step pack
```

Valid `--category` keys (see `--list` for the full frame breakdown):
`tiles`, `buildings`, `cowboys`, `mounted-cowboys`, `brawlers`, `dynamiters`,
`villagers`, `animals`, `raiders`, `raider-camps`, `wildlife`, `vegetation`,
`carts`, `accents`, `resource-icons`.

## Style consistency across a whole category

The checklist's §2.11 tip: generate the first few assets in a category, pick
a favorite, and reuse it as a reference image for the rest so the batch
doesn't visually drift. Pass `--reference path/to/favorite.png` (a raw
generated PNG works fine) and every `generate` call in that run includes it
as an image input alongside the text prompt, asking the model to match its
style.

```bash
python generate_assets.py --category buildings --frame building-Well --step generate
# ...review raw/buildings/building-Well.png, happy with it...
python generate_assets.py --category buildings --step generate --reference raw/buildings/building-Well.png
```

## Cost and rate limits

Each frame is one billed image-generation call — 84 frames total if you
generate everything. `--delay` (default 5s) is a courtesy pause between
calls, not a hard rate-limit guarantee; if you see throttling errors, raise
it. The client retries transient failures with backoff automatically (see
`lib/gemini_client.py`).

## Known rough edges

- Chroma-keying is a hard threshold (matches ImageMagick's `-fuzz 12%`), not
  edge-aware feathering — a sprite with soft/anti-aliased edges against the
  magenta may keep a faint magenta fringe. Open the processed PNG in an
  editor and touch up the edge pixels by hand if you see this; it's the same
  manual step the checklist itself describes for any AI tool's output.
- The Gemini image API's `aspect_ratio`/`image_size` parameters are presets,
  not exact pixel dimensions — `downscale_exact()` always does the final
  precise resize, so this only affects how much detail survives the
  downscale, not the final file's correctness.
- This script targets the `interactions.create()` API surface documented at
  <https://ai.google.dev/gemini-api/docs/image-generation> as of writing. If
  Google changes the SDK's response shape, `lib/gemini_client.py`'s
  `_extract_image()` has a fallback search but may still need a small update
  — it raises a clear error naming the problem rather than failing silently.

## After generating

```bash
npm run verify:art   # from the repo root — confirms every atlas/frame matches
npm run dev           # look at it in the browser at a few zoom levels
```
