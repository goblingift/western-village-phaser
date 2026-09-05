# Phase 2 – Building Types & Placement

## Goal

Player can select buildings and place them on the map.

## Prompt for Claude Code

```text
Implement a simple building system:

Building Types:
- Cattle Farm
- Butcher
- Well
- House
- Road

Requirements:
- Each building has: type, cost (money), size (1x1 or 2x2), color.
- UI: bar at bottom with buttons per building type.
- Click on button -> placement mode: preview of building under mouse.
- Click on map -> place building, if:
  - enough money
  - space is free
  - within map bounds.
- After placement: deduct money, save building in data structure, render visually.

Steps:
1. Define data structure for buildings (TypeScript interfaces).
2. Create UI bar (simple HTML overlay or Phaser text buttons).
3. Implement placement logic.
4. Short test description (what I manually check).

Process:
1. Show plan first.
2. After approval: implement.
3. Provide test instructions.
```

## Acceptance Criteria

- [ ] All 5 building types are selectable in UI
- [ ] Placement mode shows preview under mouse
- [ ] Buildings can only be placed on free spaces
- [ ] Money is correctly deducted
- [ ] Buildings remain visible after placement

## Next Phase

See `phase_03_resources_production.md`