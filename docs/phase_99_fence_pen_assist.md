# Phase 99: Fence-Pen Assist

## Goal

Buying an animal requires a closed fence perimeter with enough enclosed floor
area (`ANIMAL_ENCLOSURE_TILES_PER_ANIMAL x animalCount`). The rule is sound but
the player had to reverse-engineer it from a "too small (need N more tiles)"
message, then hand-lay a ring tile by tile and hope. A Cow Ranch at full
capacity needs 45 enclosed tiles - a 9x9 ring - which almost nobody guesses.

One-click, correctly pre-sized pen placement, computed from the farm's own
requirement.

## Tasks

1. A pen tool offered contextually on any farm with an `AnimalConfig`.
2. Ghost preview reusing Phase 88's blueprint machinery, not a new mechanism.
3. Live "N more enclosed tiles needed" readout sourced from the same enclosure
   logic `buyAnimal` gates on.
4. The `Enclosure: ...` info line and the 'E' debug overlay unchanged - this is
   a placement convenience, not a change to how enclosures are validated.

## Design decisions

### Mechanically this IS a blueprint stamp, so it reuses that code path

`updatePenPreview`/`commitPenPlacement` are deliberate near-copies of
`updateBlueprintPastePreview`/`commitBlueprintPaste`: the same pooled ghost
images, the same per-tile `getPlacementRejection` green/red tint, the same
running cost tag, and the same tile-by-tile `placeBuildingAt` commit - including
its established semantic that a stamp which outruns the player's funds stops
placing partway rather than overspending or aborting.

The one real difference is that the tile list is **computed** from the farm
rather than captured off the map, which is also why a pen is not stored as a
`Blueprint` record: it is a function of the farm, not a saved artifact.

Pen mode joins the existing left-drag mode chain as a fifth mutually-exclusive
mode, resolved exactly the way Phase 43 and Phase 88 resolved theirs - one more
condition ahead of the chain, no new state machine.

### The pen is cursor-positioned but clamped to always contain its farm

A pen that does not contain its own farm is never something anyone wants, so
rather than reporting that mistake after the fact, `resolvePenOrigin` clamps the
cursor-driven origin so the farm's whole footprint always sits in the ring's
interior. A second, weaker clamp keeps the ring on the map where possible -
weaker because if a farm sits too close to an edge for both to hold,
containment wins and the preview honestly shows the off-map side as blocked.

### Square interior

`getPenLayout` grows a square interior until
`interior^2 - footprintArea >= requiredArea`. A square is the cheapest perimeter
for a given area (7x7 needs 32 fence tiles; a 4x13 covering the same area needs
38), it reads as a pen, and it makes the suggested size predictable. The farm's
own footprint is added on top of the required area because it self-blocks in
`computeEnclosure`'s flood fill and therefore does not count as floor.

### Perimeter tiles that are already walls are skipped, not marked blocked

`getPlacementRejection` would reject an existing Fence tile as "Tile already
occupied" and paint a perfectly good pen red. Reusing or extending an existing
wall line is the common case, so `getPenPlanAt` omits any perimeter tile already
holding a wall segment. Verified: asking for the same pen twice after building
it returns 32 tiles, then 0.

### Numbers come from gameState, not from a second implementation

`getPenLayout`/`getPenPlanAt` live in `gameState.ts` and derive the requirement
from `getRequiredEnclosureArea` - the exact function `getEnclosureBuyStatus` and
`buyAnimal` gate on. The preview's "N more enclosed tiles needed" therefore
cannot disagree with the message the info panel shows after the pen is built.

### Disarms after committing

Unlike blueprint paste (which stays armed for repeat stamping), pen mode
disarms on commit: a farm needs exactly one pen, and staying armed would only
invite a second overlapping ring.

## Acceptance criteria

- Every animal farm offers a "Build Pen" button labelled with the real pen size.
- The generated pen satisfies the real buy gate for the farm's LAST animal, not
  just its first.
- The preview's predicted enclosed-tile count matches what `computeEnclosure`
  reports once the ring is built.
- Existing enclosure validation, the info-panel `Enclosure:` line and the 'E'
  overlay are untouched.

## Verification

Node harness driving the real `gameState.ts`, building the generated ring and
then running the real `recomputeAllEnclosures`/`getEnclosureFor`/
`getEnclosureBuyStatus`:

```
Chicken Farm: 1x1, max 4, required 4   -> pen 5x5 (16 fence)  predicted 8  ACTUAL closed=true enclosed=8   match  gate(1st)=true gate(LAST)=true
Pig Farm:     2x2, max 6, required 24  -> pen 8x8 (28 fence)  predicted 32 ACTUAL closed=true enclosed=32  match  gate(1st)=true gate(LAST)=true
Ostrich Farm: 2x2, max 4, required 16  -> pen 7x7 (24 fence)  predicted 21 ACTUAL closed=true enclosed=21  match  gate(1st)=true gate(LAST)=true
Cow Ranch:    2x2, max 5, required 45  -> pen 9x9 (32 fence)  predicted 45 ACTUAL closed=true enclosed=45  match  gate(1st)=true gate(LAST)=true
```

Clamping, driven with extreme cursor positions:

```
cursor(-999,-999) -> origin(30,14)  farm inside pen: true  ring fully on map: true
cursor(999,999)   -> origin(35,19)  farm inside pen: true  ring fully on map: true
```

Existing-wall reuse:

```
fence tiles first pass: 32, after the ring exists: 0
```

## Status

`npm run build` and `npm run lint` pass clean. No art touched.
