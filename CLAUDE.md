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

## License & Repo Info

- **License**: MIT (recommended for open-source projects)
- **Language**: English (README, comments), Code in English
- **Repo Name**: `western-village-phaser`