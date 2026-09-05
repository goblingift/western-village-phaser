# Project: Western Village (Phaser 4)

## Goal

Small 2D building/management game in the browser (Phaser 4, TypeScript, Vite).  
Player places buildings (cattle farm, butcher, well, house, road) on a tilemap and optimizes simple production chains in a Western setting.

## Tech Stack

- **Phaser 4** (2D Game Framework)
- **TypeScript** (strict mode)
- **Vite** (Build Tool)
- **ESLint + Prettier** (Code Quality)
- **Git** (Version Control)

## Game Scope (Minimal)

### Map
- Fixed map: 40x30 tiles
- Tile types: Grass, Water, Sand

### Buildings
- Cattle Farm (produces raw meat)
- Butcher (processes raw meat + water → meat)
- Well (produces water)
- House (provides population/workforce)
- Road (connects buildings, optional production bonus)
- Optional: Warehouse (resource buffer)

### Resources
- Money (start: ~500)
- Raw Meat
- Meat
- Water

### Game Loop
1. Place buildings (cost in money/resources)
2. Automatic production per tick (every 2 seconds)
3. Simple UI: resource display, building selection, placement mode
4. Goal: Maximize meat production with limited space & resources

## Coding Standards

- **TypeScript strict**: No `any` types without compelling reason
- **Clear Interfaces**: Type all data structures
- **Modularity**: One feature per file/module
- **Comments**: Only for complex logic, code should be self-explanatory
- **Build**: After each feature, `npm run build` must pass without errors

## Workflow Rules for Claude Code

1. **Plan before Implementation**: For new features, first propose a plan (affected files, changes, risks), then wait for approval
2. **Focused Sessions**: One feature per session or clearly separated block
3. **Git Branches**: Each feature in its own branch, review diffs like code review
4. **Performance**: For >50 buildings use culling + pooling, avoid heavy calculations in update loop unless necessary
5. **Documentation**: Briefly document new features in this file under "Feature History"

## Performance Rules

- Viewport Culling: Only render visible tiles/buildings
- Object Pooling: For recurring objects (building visuals, particles)
- Texture Atlases: All building sprites in few large textures
- Separate Layers: Render ground, buildings, UI in different layers
- Reduced Update Rate: Don't update every object every frame

## Feature History

| Date | Feature | Description |
|------|---------|-------------|
| 2026-09-05 | Project Setup | Initial Phaser 4 + TypeScript + Vite setup |
| 2026-09-05 | Tilemap & Camera | Code-generated 40x30 tilemap (grass/water/sand), draggable camera, tile-coord readout |
| 2026-09-05 | Building Placement | Building definitions, placement preview with validity check, DOM building bar, money deduction |
| 2026-09-05 | Resources & Production | Global resource pools (raw meat/meat/water), 2s production tick per building, resource HUD, building info panel |
| 2026-09-05 | Roads & Logistics | Road-network connectivity (BFS through road chains) grants +10% production output, green outline on connected buildings |
| 2026-09-05 | Goal & Score | 5-minute countdown, cumulative meat score, game-over overlay with building counts, Play Again reset |
| 2026-09-05 | Polish & Performance | Building sprites packed into one texture atlas, connection outlines merged into a single shared Graphics object, throttled tile-info HUD updates, Western color palette, tooltips, procedural placement sound |
| 2026-09-05 | Barracks & Cowboy Units | Barracks building (2x2, staffed, no production) trains garrisoned Cowboy units ($40 each, up to 3, own atlas/sprite, static slot near the Barracks, no wander); Cowboys have their own regenerating HP (`cowboyHp` array on the Barracks' `PlacedBuilding`) and a `COWBOY_RANGE_TILES` constant reserved for Phase 23's combat |
| 2026-09-05 | Villager Characters | POPULATION_PER_HOUSE pixel-art villagers spawn per placed House (capped at 30 rendered sprites), wandering forever between random placed buildings via chained point-to-point tweens with directional flip; cleaned up on game-reset |
| 2026-09-05 | Livestock Economy | Chicken Farm, Pig Farm, Cattle Farm and Cow Ranch now start with 0 animals and produce nothing until stocked; `buyAnimal()` buys one animal per click (hard-gated on an adjacent Fence, the per-building animal cap, and money), with per-tick output scaling as `outputPerAnimal * animalCount`. Retired the old Cow-Ranch-only "half output without a Fence" rule (`requiresFence`) in favor of this buy-gate. Building info panel shows Animals: count/max and a Buy button with a disabled reason (no Fence / at cap / can't afford). |
| 2026-09-05 | Warehouse & Autonomous Logistics | Removed click-to-collect (Phase 8): production now flows straight into the global resource pool each tick, capped by a global storage cap (`BASE_STORAGE_CAP` + `WAREHOUSE_STORAGE_BONUS` per staffed Warehouse); added 2x2 Warehouse building (workers required, no production output) reusing Phase 12's workforce-assignment pass; HUD shows the current storage cap |
| 2026-09-05 | Fences for Cattle | Adjacent Fence tiles now render as a connected fence line (dedicated Graphics layer, right/down adjacency check in gameState's `getFenceLinks`); Cow Ranch's fenced state (full vs half output) is surfaced in the building info panel via `hasAdjacentFence` |
| 2026-09-05 | Visual Overhaul (Pixel Assets) | Replaced flat-color tiles/buildings with procedurally generated pixel-art textures: each tile/building is drawn on an 8x8-per-tile logical pixel grid (BootScene.ts `drawPixelSprite`) and scaled to TILE_SIZE, keeping the same TILESET_KEY/BUILDING_ATLAS_KEY contract |
| 2026-09-05 | Minimap | Fixed 200x150px minimap (5px/tile) below the resource HUD, top-left; flat-color terrain + per-building-type colored dots redrawn on `building-placed`/`game-reset`, a separately throttled camera-viewport rectangle updated on drag/click, and click-or-drag-to-navigate scoped to the minimap's screen rect via `isPointerInMinimap`/`minimapPointerActive` guards in the existing pointer handlers |
| 2026-09-05 | Population & Workforce | Houses grant `POPULATION_PER_HOUSE` (2) population capacity each; every production building's `workersRequired` is derived from its footprint (`getWorkersRequired` = width×height) so it stays DRY as new building types are added; each tick `gameState`'s `assignWorkforce` auto-staffs buildings in placement order, first-come-first-served, and a building only produces when fully staffed (`staffed`/`assignedWorkers` on `PlacedBuilding`); HUD shows `Population: employed/total`, building info panel shows `Workers: assigned/required` |
| 2026-09-05 | Supermarket & Autonomous Sales | Added 2x2 Supermarket (cost 200, `requiresWorkers: true`, no `production` field); each tick, after normal production, a new `runSupermarketSales` pass in `gameState.ts` has every staffed Supermarket sell up to `SUPERMARKET_SELL_RATES` (2 Meat @$5, 2 Eggs @$3) out of the global pool into Money — `active`/`lastSale` on a Supermarket reflect whether it actually sold something this tick rather than the normal input/output check; building info panel shows "Sold: X Meat, Y Eggs -> +$Z" or why it isn't selling |
| 2026-09-05 | Western Art Pass | Content-only pass over `BootScene.ts`'s pixel sprites: wood-plank wall texture on every walled building, saloon-style false-front roof on House, windmill/crank detail on Well, longhorn-horns motif + hitching rail distinguishing Cow Ranch from Cattle/Pig Farm, enhanced barn/general-store detailing on Warehouse/Supermarket, wagon-wheel-rut Road, sparse cracked-earth/cactus flecks on Grass/Sand tiles — same `PixelSprite`/`drawPixelSprite` renderer, no logic changes |
| 2026-09-05 | Animal Sprites (Static) | Owned animals are now visible: three small critter sprites (Chicken/Pig/Cow) drawn on a separate, coarser 6x6 logical grid scaled to a 12px `ANIMAL_SPRITE_SIZE`, packed into their own `ANIMALS_ATLAS_KEY` atlas (same `drawPixelSprite` renderer, now parameterized by pixel size). `MainScene`'s `BuildingVisual` tracks each building's `animalImages[]`; `redrawAnimalSprites` (re)creates `building.animalCount` static Images at deterministic per-index slots in a row beneath the footprint (wrapping into further rows as needed), depth 11 above the building's depth-10 sprite — driven only by placement and the `animal-bought` event, never by `production-tick`. Cleaned up alongside the rest of a building's visuals on `game-reset`. |
| 2026-09-05 | Animal Walking Animation | Animals now wander instead of sitting frozen: `startAnimalWander` (called once per Image right after creation in `redrawAnimalSprites`) gives each animal sprite a single looping `yoyo: true, repeat: -1` tween drifting it between its Phase-17 slot anchor and a randomized point ~10-12px away on X (plus a subtle ±4px Y bob), with randomized duration (900-1600ms) and start delay (0-1000ms) per animal so a group doesn't move in lockstep. No new frame art: facing direction is faked via `setFlipX`, toggled in the tween's `onYoyo`/`onRepeat` callbacks — the two points where the movement direction actually reverses. Tweens are killed with `this.tweens.killTweensOf(animalImage)` right before each `animalImage.destroy()`, both in `redrawAnimalSprites`'s destroy-and-recreate loop and in `setupGameReset`'s cleanup loop, so no tween ever targets a destroyed GameObject. |
| 2026-09-05 | Building Idle Animation | Five building types get a small ambient accent, created once in `tryPlaceAt` (`createBuildingAccents`) and tracked in `BuildingVisual.accentObjects[]`: Well's crank bar (carved out of `WELL_SPRITE` into its own `ACCENTS_ATLAS_KEY` frame) swings -15°/+15° via a center-pivot yoyo rotation tween; Warehouse's hay-loft door (also carved out of the base sprite) swings 0°/+8° from a top-edge pivot (deviated from the doc's symmetric center-rotation suggestion — a top-hinged swing read as an actual door at this scale, a center swing just looked like wobbling); Supermarket's awning (carved out) sways via a 0.95x/1.05x `scaleX` yoyo tween; Chicken Farm's coop opening (carved out) flaps via a 1.0/0.3 `scaleY` yoyo tween with a per-building-randomized duration (600-900ms) and `repeatDelay` so multiple coops don't flap in sync; House gets 3 small `Arc` circle "smoke puffs" near the roofline, each on its own `y`-rise + fade-to-0 tween with `repeat: -1` (which auto-resets start values) and a staggered per-puff start delay. All new atlas accents (`WellCrank`/`WarehouseDoor`/`SupermarketAwning`/`ChickenDoor`) live in a new `ACCENTS_ATLAS_KEY` atlas (`BootScene.generateAccentAtlas`, same `drawPixelSprite` renderer, variable-width layout like `generateBuildingAtlas`); the corresponding detail was removed from each base `BUILDING_SPRITES` entry so it isn't drawn twice. Cleanup follows the exact `killTweensOf` + `.destroy()` pattern Phase 18 added for animal sprites, now also applied to `accentObjects` in `setupGameReset`. |
| 2026-09-05 | HP & Regeneration | Every `BuildingDefinition` gets a tiered `maxHp` (Road 15, Fence 20, House/Well/ChickenFarm 45-50, the four 2x2 farms/Butcher 80, CowRanch/Warehouse 100, Supermarket 90); `PlacedBuilding.hp` starts at `maxHp` on placement and regenerates `ceil(maxHp * 2%)` per tick unconditionally (`runHpRegen` in `gameState.ts`, run even for staffed=false/inactive/0-HP buildings, since regen is the only recovery path). 0 HP means "disabled": the production loop early-continues on `hp <= 0` before the staffing check, `assignWorkforce` skips 0-HP buildings entirely (zeroing `assignedWorkers`/`staffed`, recomputed fresh every tick so a building that just hit 0 HP is corrected the same tick), and `getStorageCap` excludes disabled Warehouses from the staffed-Warehouse bonus. Building info panel shows `HP: current/max`, red/bold with an "(Disabled)" suffix at 0 HP (`.hp-disabled` class in `index.html`). `MainScene` draws a small two-layer HP bar (depth 13, above villagers) over any building currently below `maxHp`, hidden at full health, redrawn every `production-tick` alongside the other per-tick Graphics passes. No damage source exists yet (Phase 23) — this phase is HP/regen/gating plumbing only. |
| 2026-09-05 | Raid Events & Combat | Three fictional threat factions (`RaiderFaction`/`RAIDER_DEFINITIONS` in `buildingConfig.ts` — Outlaws: 30hp/6dmg/50px-s, targets any building; Rustlers: 25hp/5dmg/50px-s, prefers farm buildings with an `animal` config, falling back to any; Coyotes: 15hp/3dmg/75px-s, same farm preference) raid on a self-rescheduling random 45-90s timer (`MainScene.scheduleNextRaidCheck`, skips spawning if a raid is already active, always re-picks a fresh random delay). A triggered raid picks one faction at random and spawns 2-5 units (own `RAIDERS_ATLAS_KEY` sprites, same 12px small-unit size class as animals/villagers/Cowboys) at a random point along a random map edge; each raider commits once to its nearest valid target building (per its faction's targeting rule, re-picked only if the current target dies or was never found) and walks straight there via a single Phase-20-style point-to-point tween, then stops and attacks in place. Combat resolution (`MainScene.runRaidCombatTick`) rides the existing 2s production-tick cadence rather than `update()`: raiders in range deal damage straight to `PlacedBuilding.hp` (gameState remains the source of truth for building HP, floored at 0 — Phase 21's existing disable/regen gates handle the rest unmodified), and every living Cowboy (`cowboyHp[i] > 0`) fires `COWBOY_DAMAGE` (8) at its own nearest raider within `COWBOY_RANGE_TILES`, with a cheap fading `Graphics` line as the shot visual. Raider state (hp/faction/target/tween) lives entirely in `MainScene` as a local `Raider[]`, not in `gameState.ts` — ephemeral/wave-scoped and tween-heavy, unlike core building/resource state. A wave ends when every raider is dead or after a 60s timeout, whichever first; a HUD notice ("Outlaws incoming!" etc., same `add.text(...).setScrollFactor(0).setDepth(1000)` style as the resource/timer HUD) shows for the wave's duration. `game-reset` cancels the pending raid-check timer, ends any active wave, and destroys all raider/shot visuals before rescheduling a fresh randomized raid timer. |

## License & Repo Info

- **License**: MIT (recommended for open-source projects)
- **Language**: English (README, comments), Code in English
- **Repo Name**: `western-village-phaser`