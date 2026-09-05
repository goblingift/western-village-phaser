# Phase 15 – Western Art Pass

## Goal

Push every sprite (tiles + all buildings, old and new) toward a
distinctly Western look, not just "pixel art" — saloon-style
false-fronts, wood grain, ranch motifs, general-store signage.

## Prompt for Claude Code

```text
Western-theme art pass across all sprites.

Tasks:
1. Revisit every building sprite in BootScene.ts (Cattle Farm,
   Butcher, Well, House, Road, Chicken Farm, Pig Farm, Cow Ranch,
   Fence, Warehouse, Supermarket) for stronger Western identity:
   - wood-plank wall texture instead of flat fill
   - false-front / saloon-style roof silhouette where it fits
   - Well: windmill or bucket-crank detail
   - Cow Ranch: horns/hitching-post motif
   - Warehouse: big barn silhouette with hay-loft door
   - Supermarket: general-store signage/awning
2. Ground tiles: add sparse decorative, non-blocking detail (tumbleweed
   fleck, cactus silhouette on sand, cracked-earth pattern) — must not
   imply the tile is unbuildable or change gameplay, purely visual.
3. Keep the existing PixelSprite/PixelPalette/drawPixelSprite system —
   this is a content pass (more/better patterns), not a new renderer.
4. Verify readability at 32px (2x2 buildings at 64px) — don't over-detail
   to the point sprites become muddy/illegible.

Process:
1. Show before/after description per building (or screenshot if possible).
2. Wait for approval.
3. Implement, npm run build must pass.
```

## Acceptance Criteria

- [ ] Every building reads as distinctly "Western" at a glance
- [ ] No readability regression at actual in-game size
- [ ] Ground tiles have subtle Western flavor, still clearly walkable/buildable
- [ ] `npm run build` passes, no console errors

## Completion

Closes this feature round: population/workforce, autonomous
warehouse->supermarket economy, and a cohesive Western look.
