import { MAP_HEIGHT_TILES, MAP_WIDTH_TILES } from '../config/constants';

/**
 * Phase 6 (Real Fence Enclosures). Pure flood-fill algorithm with zero
 * gameState import, matching vegetation.ts/market.ts's convention: every tile
 * query the algorithm needs (is this tile a Fence, a Gate, or occupied by
 * some other building) is passed in as a callback rather than read from
 * module-level building state, so this file can be unit-reasoned about (and
 * unit-tested) without a live gameState.
 *
 * Algorithm (see the caller-facing doc on computeEnclosure below for the
 * gameplay-facing summary): starting from every open tile orthogonally
 * adjacent to a farm's footprint, BFS outward through open ground only
 * (never through a Fence tile, and never through a tile occupied by another
 * building - a farm's own footprint counts as "occupied" so the fill can't
 * walk back through it). Gate tiles are open ground for the purposes of the
 * fill (animals conceptually pass through a gate) but are separately recorded
 * as boundary tiles the fill touched, so the caller can count them.
 *
 * The fill is bounded twice, both meaning "not enclosed": reaching outside
 * the map's tile bounds, or exceeding MAX_FLOOD_FILL_TILES - a huge open
 * field with no wall anywhere would otherwise flood-fill most of the 60x45
 * map before giving up, which is wasted work for an already-obvious "open"
 * verdict. Raised 400 -> 900 after a QA-confirmed bug report: a genuinely,
 * fully closed player-built pen (e.g. a generously-sized ~20x20 interior =
 * 400 open tiles, well within reach on the map) was being reported as
 * "not enclosed" purely because its real, legitimate area met or exceeded
 * the old cap - 900 comfortably covers a very large pen (a 29x29 interior).
 * Phase 66: raised again 900 -> 2000 alongside the 40x30 -> 60x45 map size
 * increase, keeping the same safety margin relative to the full map (now
 * ~2700 tiles) while still bailing out well before it for a genuinely open
 * field.
 */
const MAX_FLOOD_FILL_TILES = 2000;

export type EnclosureTileQuery = (tileX: number, tileY: number) => EnclosureTileState;

export type EnclosureTileState = 'open' | 'fence' | 'gate' | 'building';

export interface EnclosureResult {
  /** False if the flood-fill escaped the map bounds or exceeded MAX_FLOOD_FILL_TILES before it could fully bound itself. */
  closed: boolean;
  /**
   * Distinct Gate tiles found touching the enclosed area's boundary (only
   * meaningful when closed is true). Kept for the debug overlay/UI to still
   * report "how many Gates does this pen have" as trivia, but Refinement 4
   * (Item 4) dropped it from isEnclosureValid - a closed perimeter no longer
   * requires exactly one Gate to be valid. Gate tiles are still passable
   * (not flooded past) rather than blocking, since a raider/animal
   * conceptually walks through one either way.
   */
  gateCount: number;
  /** Total open (non-Fence/Gate/building) tiles enclosed, i.e. the usable pen area. Only meaningful when closed is true. */
  enclosedTileCount: number;
  /** The enclosed open tiles themselves, for the debug overlay. Empty when not closed. */
  enclosedTiles: { tileX: number; tileY: number }[];
}

const NOT_ENCLOSED: EnclosureResult = {
  closed: false,
  gateCount: 0,
  enclosedTileCount: 0,
  enclosedTiles: [],
};

function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Computes whether the given footprint (a farm's tile rectangle) sits inside
 * a closed Fence/Gate perimeter, and if so, how big that pen is and how many
 * Gates sit on its boundary. Iterative BFS (never recursive - the map is only
 * 60x45 but an unbounded recursive flood-fill is still the wrong shape for a
 * grid this size to risk a stack limit on).
 */
export function computeEnclosure(
  footprintX: number,
  footprintY: number,
  footprintWidth: number,
  footprintHeight: number,
  queryTile: EnclosureTileQuery,
): EnclosureResult {
  const visited = new Set<string>();
  const gateTiles = new Set<string>();
  const enclosedTiles: { tileX: number; tileY: number }[] = [];
  const queue: { x: number; y: number }[] = [];

  const seedIfOpen = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= MAP_WIDTH_TILES || y >= MAP_HEIGHT_TILES) {
      return;
    }
    const key = tileKey(x, y);
    if (visited.has(key)) {
      return;
    }
    const state = queryTile(x, y);
    if (state === 'fence' || state === 'building') {
      return;
    }
    visited.add(key);
    if (state === 'gate') {
      gateTiles.add(key);
      // Gate tiles are boundary, not open pen area - don't flood further out
      // through them and don't count them as enclosed floor space.
      return;
    }
    enclosedTiles.push({ tileX: x, tileY: y });
    queue.push({ x, y });
  };

  // Seed from every open tile orthogonally adjacent to the farm's footprint.
  for (let x = footprintX; x < footprintX + footprintWidth; x++) {
    seedIfOpen(x, footprintY - 1);
    seedIfOpen(x, footprintY + footprintHeight);
  }
  for (let y = footprintY; y < footprintY + footprintHeight; y++) {
    seedIfOpen(footprintX - 1, y);
    seedIfOpen(footprintX + footprintWidth, y);
  }

  // An empty queue with zero gates found means every tile immediately
  // adjacent to the footprint was Fence/another building - sealed solid, no
  // interior to speak of. That's still "closed" (nothing to escape through),
  // just with a 0 enclosedTileCount/gateCount, so it falls through to the
  // same return below rather than needing a special case.
  while (queue.length > 0) {
    if (visited.size > MAX_FLOOD_FILL_TILES) {
      return NOT_ENCLOSED;
    }
    const current = queue.shift()!;
    const neighbors: [number, number][] = [
      [current.x, current.y - 1],
      [current.x, current.y + 1],
      [current.x - 1, current.y],
      [current.x + 1, current.y],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= MAP_WIDTH_TILES || ny >= MAP_HEIGHT_TILES) {
        // Escaped the map boundary through open ground - definitely not enclosed.
        return NOT_ENCLOSED;
      }
      seedIfOpen(nx, ny);
      if (visited.size > MAX_FLOOD_FILL_TILES) {
        return NOT_ENCLOSED;
      }
    }
  }

  return {
    closed: true,
    gateCount: gateTiles.size,
    enclosedTileCount: enclosedTiles.length,
    enclosedTiles,
  };
}

/**
 * Valid for animal-buying purposes: a closed perimeter is sufficient on its
 * own, regardless of Gate presence/count/absence.
 *
 * Refinement 4 (Item 4, 2026-09-07): dropped the earlier `gateCount === 1`
 * requirement. Gate remains a real, working passive building (raiders still
 * walk through it unimpeded per Phase 61's isWallSegment/findBlockingFence
 * split - that behavior is untouched), but it is no longer load-bearing for
 * enclosure validity: a fully-fenced pen with zero Gates (or two, or five) is
 * just as valid as one with exactly one. This removes a rule that added
 * friction (a forgotten/extra Gate silently invalidated an otherwise-correct
 * pen) without ever being explained anywhere in-game beyond the info panel's
 * error text.
 */
export function isEnclosureValid(result: EnclosureResult): boolean {
  return result.closed;
}
