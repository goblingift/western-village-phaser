# Phase 1 – Tilemap & Camera

## Goal

Fixed map (40x30 tiles), scrollable camera, basic rendering.

## Prompt for Claude Code

```text
Extend the project with a fixed tilemap (40x30 tiles).

Requirements:
- Use Phaser Tilemap (static, no external tiles, use colored rectangles).
- Tiles: Grass (green), Water (blue), Sand (yellow).
- Generate the map in code (no external JSON).
- Camera should be scrollable with mouse/touch.
- Add a mini info UI top-left (mouse x/y in tile coordinates).

Step by step:
1. Plan the changes (files, rough logic).
2. Implement the map.
3. Test performance (describe how I can check this locally).

Process:
1. Show plan first.
2. After approval: implement.
3. Provide short test instructions.
```

## Acceptance Criteria

- [ ] Map with 40x30 tiles is displayed
- [ ] Three tile types (green, blue, yellow) are visible
- [ ] Camera can be scrolled with mouse/touch
- [ ] UI shows mouse position in tile coordinates
- [ ] Performance is smooth (60 FPS with empty scene)

## Next Phase

See `phase_02_buildings_placement.md`