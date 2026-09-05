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
| 2026-09-05 | Fences for Cattle | Adjacent Fence tiles now render as a connected fence line (dedicated Graphics layer, right/down adjacency check in gameState's `getFenceLinks`); Cow Ranch's fenced state (full vs half output) is surfaced in the building info panel via `hasAdjacentFence` |
| 2026-09-05 | Visual Overhaul (Pixel Assets) | Replaced flat-color tiles/buildings with procedurally generated pixel-art textures: each tile/building is drawn on an 8x8-per-tile logical pixel grid (BootScene.ts `drawPixelSprite`) and scaled to TILE_SIZE, keeping the same TILESET_KEY/BUILDING_ATLAS_KEY contract |
| 2026-09-05 | Minimap | Fixed 200x150px minimap (5px/tile) below the resource HUD, top-left; flat-color terrain + per-building-type colored dots redrawn on `building-placed`/`game-reset`, a separately throttled camera-viewport rectangle updated on drag/click, and click-or-drag-to-navigate scoped to the minimap's screen rect via `isPointerInMinimap`/`minimapPointerActive` guards in the existing pointer handlers |
| 2026-09-05 | Population & Workforce | Houses grant `POPULATION_PER_HOUSE` (2) population capacity each; every production building's `workersRequired` is derived from its footprint (`getWorkersRequired` = width×height) so it stays DRY as new building types are added; each tick `gameState`'s `assignWorkforce` auto-staffs buildings in placement order, first-come-first-served, and a building only produces when fully staffed (`staffed`/`assignedWorkers` on `PlacedBuilding`); HUD shows `Population: employed/total`, building info panel shows `Workers: assigned/required` |

## License & Repo Info

- **License**: MIT (recommended for open-source projects)
- **Language**: English (README, comments), Code in English
- **Repo Name**: `western-village-phaser`