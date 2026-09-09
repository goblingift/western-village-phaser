# Phase 90 – Asset Load Budget: WebP + Bundle Split

## Goal

Cut the eager preload cost of a publicly deployed web game. Before: 7.84 MB
of PNG art (buildings alone 7.7 MB across 34 files, several >380 KB) loaded
before the title screen, plus a single 1.92 MB JS bundle tripping Vite's
`>500 kB chunk` warning on every build.

## Measured result

| | before | after | change |
|---|---|---|---|
| art (48 files) | 7.84 MB PNG | 2.34 MB WebP | **−70%** |
| JS bundle | 1.92 MB (1 chunk, warning) | 237 kB app + 1.68 MB phaser | split, no warning |
| `dist/` total | 11 MB (8.8 MB art) | **4.33 MB** (2.45 MB art) | −61% |

## WebP conversion

New `tools/asset_generation/convert_to_webp.py` (Pillow, already a declared
dependency of the Python asset pipeline) converts every PNG under
`public/art/` in place, deletes the source PNG, and rewrites the atlas JSON's
`meta.image` field. Re-run it after any `generate_*.py` pass.

**Quality — measured, not assumed** (the user has previously rejected
resolution regressions, so this was checked rather than argued):

- **Alpha is bit-exact**: max per-pixel alpha delta 0 across every file.
  Lossy WebP encodes the alpha plane losslessly here, so sprite cutout edges
  over terrain — the thing that would actually be noticeable — do not
  degrade at all.
- Mean per-pixel RGB delta over **visible** (alpha > 0) pixels: 2–5 / 255.
- Side-by-side at **3× magnification** (orig / q95 / q90 / q80) is
  indistinguishable. The game renders buildings *downscaled* (128 px source
  at 32–64 screen px), so the sampled result is closer still.
- Naive whole-image diffs look alarming (mean delta ~20) but that is entirely
  in fully transparent pixels, whose RGB is arbitrary and invisible. Not a
  quality signal.

q90 chosen over q95 (3.00 MB) because the visible-pixel error difference is
0.6/255 and neither is distinguishable magnified. `WEBP_QUALITY` is a single
constant if this ever needs retuning.

Browser support is universal in every browser that can run Phaser 4.

## Tooling updated

- `BootScene.preload()` — all 48 load paths `.png` → `.webp`.
- New `tools/webp-reader.mjs` — dependency-free WebP header reader
  (VP8X / VP8L / VP8 containers), the counterpart to `png-writer.mjs`'s
  `readPngDimensions`. Read-only; encoding stays offline in Python.
- `tools/verify-asset-dimensions.mjs`, `tools/verify-building-frames.mjs` —
  now check `.webp`, and emit an explicit *"the .png still exists — run
  `convert_to_webp.py`"* hint rather than a bare "file not found" when art
  has been regenerated but not converted.
- `docs/ASSET_GENERATION_CHECKLIST.md` §2.8 — conversion documented as a
  required final step (the game only ever requests `.webp`).

## Bundle split

`vite.config.ts` gained a `manualChunks` rule isolating `node_modules/phaser`
into its own chunk. Phaser changes only on dependency upgrade while game code
changes every commit, so a returning player now re-downloads 237 kB instead
of 1.92 MB after a deploy. `chunkSizeWarningLimit` raised to 1750 kB — just
above the irreducible Phaser chunk — so the warning stays a real signal about
the *app* chunk growing.

No deeper code-splitting: the game is a single scene graph with no route
boundaries, so any further split would be arbitrary round-trips.

## Deferred to Phase 91

Right-sizing `ART_SCALE` (4 → 2) and deferring the 22 unlock-gated building
atlases to a background load are kept as their own separate, reversible
phase, per the brief.

## Verification

`npm run build` (no chunk warning), `npm run lint`, `npm run verify:art`
(7/7) all clean.
