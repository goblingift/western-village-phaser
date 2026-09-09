# Phase 91 – Deferred Building Art + ART_SCALE Decision

Second half of the asset-load-budget item, kept separate from Phase 90 so
each step is independently reviewable and revertible.

## 1. ART_SCALE: evaluated, kept at 4 (no change shipped)

The naive case for 4 → 2: `CAMERA_MAX_ZOOM` is 2.0, so a 1x1 building never
exceeds 64 canvas px, while a 4x source is 128 px — twice the resolution the
renderer can ever display.

**Rejected on evidence.** An A/B render of the House sprite at both real
on-screen sizes (4x source vs. a Lanczos-downscaled 2x source, each resampled
to the display size and magnified for inspection):

- at **32 px** (zoom 1.0, the common case) the two are indistinguishable;
- at **64 px** (max zoom) the 4x source is visibly smoother and richer in the
  roof planks and wall boards; the 2x source reads harsher and slightly
  aliased.

Combined with: the art payload after Phase 90 is already only 2.34 MB, §2
below cuts the *blocking* part of it by 82% without touching a pixel, and the
54 MB of source renders under `tools/asset_generation/raw/` is **gitignored**
— so downscaling would be effectively irreversible for anyone but the
original author. There was no load-time case left worth trading picture
quality for. Rationale recorded in `constants.ts`'s `ART_SCALE` comment so
this isn't re-litigated from the math alone.

## 2. Deferred loading of unlock-gated building atlases

**22-of-34 in the brief; actually 27-of-34.** Only 7 buildings have no
`unlockRequirement` and are therefore placeable at t=0: House, Well, Road,
Fence, ChickenFarm, Granary, Forestry.

| | before | after |
|---|---|---|
| blocking initial art load | 2.43 MB | **0.42 MB** (−83%) |
| — eager buildings | — | 0.30 MB (7 atlases) |
| — shared atlases (units, tiles, icons…) | — | 0.12 MB |
| loaded in background | — | 2.02 MB (27 atlases) |

Against the original PNG baseline (7.84 MB), the blocking load is now **95%
smaller**.

### How

- `buildingConfig.isEagerBuildingArt(type)` = `!definition.unlockRequirement`
  — *derived*, not a hand-listed table, so a new building can never be
  accidentally omitted from loading (worst case: it loads eagerly).
- `BootScene.preload()` loads only the eager atlases; `create()` filters and
  publishes icons only for those.
- `MainScene.startDeferredBuildingArtLoad()` queues the remaining 27 onto the
  scene's own loader and calls `load.start()` — Phaser's per-scene loader can
  be re-armed after a scene is running, and fires a per-file event so each
  atlas is usable the moment it lands.
- Icon rasterisation moved out of `BootScene` into
  `scenes/buildingIconRaster.ts` so both callers share it;
  `ui/buildingIcons.ts`'s publish now **merges** rather than replaces, and
  `onBuildingIconsReady` subscribes to *every* publish rather than only the
  first (otherwise the bar would keep text-label fallbacks forever for the 27
  deferred buildings).

### Correctness

**Self-healing, not gated.** Rather than threading a "is this art loaded yet"
check through the building bar, placement preview, blueprint stamping and
save loading, `refreshVisualsForBuildingType()` re-points any already-placed
building of that type at its real texture the moment its atlas arrives. So
even the pathological case — a blueprint stamping a Watchtower on a slow
connection seconds into a run — resolves itself, and no gameplay path needs
to know loading exists. The normal path can't hit it anyway: the earliest
unlock gate is `populationAtLeast: 3`, which needs Houses placed *and* built
(construction ticks) first.

**Phaser event-name trap, caught before shipping:** `load.atlas` builds a
MultiFile whose type is `atlasjson`, not `atlas` (verified in
`phaser/dist/phaser.js`: `MultiFile.call(loader, 'atlasjson', ...)` and
`FILE_KEY_COMPLETE + type + '-' + key`). Listening for
`filecomplete-atlas-<key>` would have silently never fired. Uses
`filecomplete-atlasjson-<key>`, plus an idempotent `complete` sweep as
belt-and-braces against a future rename.

## Verification

`npm run build`, `npm run lint`, `npm run verify:art` (7/7) clean. Served
asset URLs smoke-tested through `vite preview` (`200 image/webp` for eager,
deferred and shared atlases alike). No browser-automation tool was available
in this environment, so the runtime load sequence was verified by reading
Phaser's own loader source rather than by watching it in a live browser.
