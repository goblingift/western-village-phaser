# Phase 89 – Damage-State Rendering Fix

> Numbering note: Phases 85–88 are the MainScene decomposition + blueprint
> copy-paste. Three commits landed after Phase 88 without phase numbers
> (asset drop, construction-progress mechanic, AI art pipeline completion);
> this phase continues the sequence at 89.

## Goal

Make the `Damaged` / `Ruined` building art that already ships in every
player's download actually render when a building takes damage.

## Bug (confirmed, shipped)

`tools/asset_generation/generate_buildings.py` generates 6 state frames per
building (`Intact`, `Damaged`, `Ruined`, `Construction25/50/75`) and all 34
atlases under `public/art/buildings/` carry them. But
`damageStateSuffix(hp, maxHp)` returned a **suffix** (`'-Damaged'`), which
`resolveBuildingFrameName` concatenated onto the base frame — looking up
`Intact-Damaged`, a name no atlas has ever contained. The
existence-checked fallback then silently returned the base frame, so raids
showed **zero visual damage on any building**, ever.

Verified against the real atlas JSONs (`Well.json`, `House.json`, and all 32
others) rather than assumed: frame names are plain `Damaged` / `Ruined`.

## Changes

### 1. Frame-name resolution (`src/config/buildingConfig.ts`)

- `damageStateSuffix()` → `damageStateFrameName(hp, maxHp): 'Damaged' | 'Ruined' | null`
  — returns the standalone frame name the atlases actually use, not a suffix.
- `resolveBuildingFrameName()` now tries, in order:
  1. `${baseFrame}-${damageFrame}` (e.g. `Tier2-Damaged`) — always misses
     today, present so per-variant damage art lights up with zero code
     changes if it's ever generated;
  2. the plain `Damaged` / `Ruined` frame (the hit);
  3. the base frame (graceful degradation if damage art is missing).

### 2. Precedence decisions (documented in code)

**Damage state wins over base variant.**

- **House Tier2/Tier3 + damaged** → renders `Damaged`/`Ruined`, not `Tier2`.
  No `Tier2-Damaged` art exists (the pipeline generates one damage set per
  building, not one per variant), so the alternative is "tiered houses never
  show damage at all". A burning building is more urgent information than its
  tier, and the tier stays readable in `BuildingInfoPanel` (and is legible
  again the moment the player repairs).
- **WoodenGate closed + damaged** → same call, for consistency. The gate's
  open/closed state remains visible in the info panel and via the fence-line
  graphic; a damaged gate additionally shows an HP bar.

### 3. Unreachable construction frame (found while writing the check)

`constructionFrameNameForTicks` used 0.4/0.7 cutoffs on a float fraction.
With `CONSTRUCTION_TICKS_1X1 = 3` the only fractions that can occur are 0,
1/3 and 2/3 — and 2/3 < 0.7, so **`Construction75` was dead art for every
1x1 building**. Cutoffs moved to thirds and compared in integer tick space
(no float-boundary drift). All three construction frames are now reachable
at both tick counts.

### 4. Verification tightened (`tools/verify-building-frames.mjs`)

The gap that let the original bug ship: damage frames were "checked only if
present, never required". Now a **reachability check**: the real runtime
resolution path (`buildingTextureKey` → `resolveBuildingFrameName` /
`constructionFrameNameForTicks`, all three mirrored in the script) is
simulated across every base variant, every damage band and every
construction tick a building can occupy. **Any frame present in an atlas
that no runtime state can select is a build-breaking FAILURE.** Plus an
explicit, clearer-message assertion that a building at 50/100 hp resolves
to `Damaged` and at 10/100 hp to `Ruined`.

## Verification

- Scripted check against the **real** compiled `buildingConfig.ts` (bundled
  via esbuild) and the **real** 34 atlas JSONs: `Damaged`/`Ruined` resolve
  correctly for all 34 buildings; `House Tier3 @ 50% hp → Damaged`;
  `WoodenGate closed @ 20% hp → Ruined`; `Closed`/`Tier2` still correct at
  full health; all 3 construction frames reachable for both footprints.
- `npm run build`, `npm run lint`, `npm run verify:art` (7/7) all pass.
  207 frames now reachability-verified.

## Acceptance Criteria

- [x] Damaged/Ruined frames resolve and render on hp loss
- [x] House tier + damage precedence decided and documented
- [x] WoodenGate closed + damage precedence decided and documented
- [x] Unreachable atlas frames are now a build failure
- [x] build / lint / verify:art clean
