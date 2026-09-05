import Phaser from 'phaser';
import { TILE_SIZE } from '../config/constants';
import {
  ACCENTS_ATLAS_KEY,
  AccentKind,
  ANIMALS_ATLAS_KEY,
  ANIMAL_SPRITE_SIZE,
  AnimalKind,
  BUILDING_ATLAS_KEY,
  BUILDING_DEFINITIONS,
  BuildingType,
  COWBOYS_ATLAS_KEY,
  COWBOY_SPRITE_SIZE,
  COWBOY_TEXTURE_KEY,
  MOUNTED_COWBOYS_ATLAS_KEY,
  MOUNTED_COWBOY_SPRITE_HEIGHT,
  MOUNTED_COWBOY_SPRITE_WIDTH,
  MOUNTED_COWBOY_TEXTURE_KEY,
  RAIDERS_ATLAS_KEY,
  RAIDER_SPRITE_SIZE,
  RaiderFaction,
  VILLAGERS_ATLAS_KEY,
  VILLAGER_SPRITE_SIZE,
  VILLAGER_TEXTURE_KEY,
  accentTextureKey,
  animalTextureKey,
  buildingTextureKey,
  raiderTextureKey,
} from '../config/buildingConfig';

export const TILESET_KEY = 'tiles-atlas';

/**
 * All sprites are drawn on a logical pixel grid, then scaled up to TILE_SIZE
 * to get a chunky "pixel art" look without loading external image assets.
 * PIXEL_GRID is the number of logical pixels per tile edge (8x8 per tile),
 * so PIXEL_SIZE (TILE_SIZE / PIXEL_GRID) is how many real pixels each
 * logical pixel occupies once rasterized into the texture.
 */
const PIXEL_GRID = 8;
const PIXEL_SIZE = TILE_SIZE / PIXEL_GRID;

/**
 * Animal critters are drawn on their own, much coarser logical grid (6x6)
 * scaled down to ANIMAL_SPRITE_SIZE on screen, so they read as small static
 * props next to a building rather than tile-sized sprites.
 */
const ANIMAL_PIXEL_GRID = 6;
const ANIMAL_PIXEL_SIZE = ANIMAL_SPRITE_SIZE / ANIMAL_PIXEL_GRID;

type PixelPalette = Record<string, number>;

interface PixelSprite {
  /** Rows of palette-key characters, top to bottom. '.' means transparent. */
  pattern: string[];
  palette: PixelPalette;
}

const GRASS_SPRITE: PixelSprite = {
  palette: { G: 0x4caf50, D: 0x357a38, H: 0x7cc47f },
  pattern: [
    'GGGGGGGG',
    'GGDGGGGG',
    'GGGGGHGG',
    'GGGDDGGG',
    'GDGGGGGG',
    'GGGGGHGG',
    'GGGGGGGD',
    'GGGGGGGG',
  ],
};

const WATER_SPRITE: PixelSprite = {
  palette: { W: 0x2196f3, D: 0x15599e, H: 0x6ec6ff },
  pattern: [
    'WWWWWWWW',
    'WWWWWWWW',
    'WHHWWHHW',
    'WWWWWWWW',
    'WWDWWWDW',
    'WWHHWWHH',
    'WWWWWWWW',
    'WWWWWWWW',
  ],
};

const SAND_SPRITE: PixelSprite = {
  // C forms a two-pixel stub hinting at a small cactus/scrub silhouette;
  // K forms a short cracked-earth fissure. Both kept to a subtle 2px line
  // since this tile is rendered 40x30 times across the map.
  palette: { S: 0xd2b48c, D: 0xb08968, H: 0xe8d0a9, C: 0x8c9a6b, K: 0x9c7b52 },
  pattern: [
    'SSSSSSSS',
    'SSDSSSSS',
    'SSSSSSHS',
    'SSSSDSSS',
    'SSSSSSSS',
    'SSCSSKSS',
    'SSCSSKSS',
    'SSSSSSSS',
  ],
};

// Order must match the TileType enum values (Grass=0, Water=1, Sand=2), since
// tile indices in the generated tilemap are used directly as frame indices.
const TILE_SPRITES: PixelSprite[] = [GRASS_SPRITE, WATER_SPRITE, SAND_SPRITE];

const CATTLE_FARM_SPRITE: PixelSprite = {
  // P alternates with B across wall columns to read as vertical wood planks.
  palette: { S: 0x4e342e, R: 0x6d4c41, B: 0x8d6748, P: 0x7a5a3d, H: 0xd7ccc8, D: 0x3e2723, F: 0xc9a063 },
  pattern: [
    'SSSSSSSSSSSSSSSS',
    'SRRRRRRRRRRRRRRS',
    'SRRRRRRRRRRRRRRS',
    'SRRRRRRRRRRRRRRS',
    'SSSSSSSSSSSSSSSS',
    'SBPBPBPBPBPBPBPS',
    'SBPBPHHHHBPBPBPS',
    'SBPBPHHHHBPBPBPS',
    'SBPBPDDBPBPBPBPS',
    'SBPBPDDBPBPBPBPS',
    'SSSSSSSSSSSSSSSS',
    'FF..FF..FF..FF..',
    '................',
    '................',
    'FF..FF..FF..FF..',
    'SSSSSSSSSSSSSSSS',
  ],
};

const BUTCHER_SPRITE: PixelSprite = {
  palette: { S: 0x3e2723, R: 0xb71c1c, B: 0xe8ded1, P: 0xd2c3ae, H: 0xffffff, D: 0x4e342e, C: 0x8d0000 },
  pattern: [
    'SSSSSSSSSSSSSSSS',
    'SRRRRRRRRRRRRRRS',
    'SRRRRRRRRRRRRRRS',
    'SRRRRRRRRRRRRRRS',
    'SRRRRRRRRRRRRRRS',
    'SSSSSSSSSSSSSSSS',
    'SBPBPBPBPBPBPBPS',
    'SBPBPBCCBPBPBPBS',
    'SBPBPCCCCBPBPBPS',
    'SBPBPBCCBPBPBPBS',
    'SBPBPBCCBPBPBPBS',
    'SBPBPHHHHBPBPBPS',
    'SBPBPHHHHBPBPBPS',
    'SBPBPDDDDBPBPBPS',
    'SBPBPDDDDBPBPBPS',
    'SSSSSSSSSSSSSSSS',
  ],
};

const WELL_SPRITE: PixelSprite = {
  // Top row: P are the crank support posts; the horizontal crank bar itself
  // is carved out as a separate WELL_CRANK_ACCENT_SPRITE (Phase 19) so it
  // can rotate independently instead of being baked into this flat texture.
  palette: { S: 0x616161, B: 0xbdbdbd, H: 0xeeeeee, D: 0x0d47a1, P: 0x5d4037, C: 0x424242 },
  pattern: [
    '.P....P.',
    '.SHBBHS.',
    'SBBDDBBS',
    'SBDDDDBS',
    'SBDDDDBS',
    'SBBDDBBS',
    '.SBBBBS.',
    '..SSSS..',
  ],
};

const HOUSE_SPRITE: PixelSprite = {
  // Narrowed top cap (row 0) reads as a raised saloon-style false-front
  // parapet rather than a gable peak.
  palette: { R: 0xa1442e, S: 0x4e342e, B: 0xffcb8e, P: 0xe0a968, W: 0x90caf9, D: 0x5d4037 },
  pattern: [
    '..SSSS..',
    'SRRRRRRS',
    'SRRRRRRS',
    'SSSSSSSS',
    'SBPWWPBS',
    'SBPWWPBS',
    'SBPDDPBS',
    'SSSSSSSS',
  ],
};

const ROAD_SPRITE: PixelSprite = {
  // Columns 2 and 5 stay D on every row, forming two continuous wagon-wheel
  // ruts that line up across adjacent road tiles; H are sparse dirt flecks.
  palette: { B: 0x8d6e63, D: 0x6d4c41, H: 0xa1887f },
  pattern: [
    'BBDBBDBB',
    'BHDBBDBB',
    'BBDBBDHB',
    'HBDBBDBB',
    'BBDHBDBB',
    'BBDBBDBH',
    'BBDBHDBB',
    'BBDBBDBB',
  ],
};

const CHICKEN_FARM_SPRITE: PixelSprite = {
  // The coop opening (C, rows 4-6) used to be baked in here; it's now
  // carved out as its own CHICKEN_DOOR_ACCENT_SPRITE (Phase 19) layered on
  // top so it can flap, leaving the wall (W) showing through underneath.
  palette: { S: 0x4e342e, D: 0x6d4c41, W: 0x8d6e4a, P: 0x7c5f3f, C: 0xfff8e1 },
  pattern: [
    '.SSSSSS.',
    'SDDDDDDS',
    'SDDDDDDS',
    'SSSSSSSS',
    'SWPWWPWS',
    'SWPWWPWS',
    'SWWWWWWS',
    'SSSSSSSS',
  ],
};

const PIG_FARM_SPRITE: PixelSprite = {
  palette: { S: 0x4e342e, R: 0xd08a9e, B: 0xe8a5b8, P: 0xd48ea0, H: 0xfff0f3, D: 0x8d5a68, F: 0xc9a063 },
  pattern: [
    'SSSSSSSSSSSSSSSS',
    'SRRRRRRRRRRRRRRS',
    'SRRRRRRRRRRRRRRS',
    'SRRRRRRRRRRRRRRS',
    'SSSSSSSSSSSSSSSS',
    'SBPBPBPBPBPBPBPS',
    'SBPBPHHHHBPBPBPS',
    'SBPBPHHHHBPBPBPS',
    'SBPBPDDBPBPBPBPS',
    'SBPBPDDBPBPBPBPS',
    'SSSSSSSSSSSSSSSS',
    'FF..FF..FF..FF..',
    '................',
    '................',
    'FF..FF..FF..FF..',
    'SSSSSSSSSSSSSSSS',
  ],
};

const COW_RANCH_SPRITE: PixelSprite = {
  // Row 0: N pixels form a longhorn-skull silhouette mounted on the roof
  // ridge. L is a lighter plank shade than CattleFarm/PigFarm's, giving
  // the "premium" ranch a whitewashed wood look. T is the hitching rail.
  palette: {
    S: 0x6d4c41,
    R: 0x8d6e4a,
    B: 0xbca88a,
    L: 0xd4c3a3,
    H: 0xfff8e1,
    D: 0x5d4037,
    F: 0x7c5e3c,
    N: 0xf5f0e1,
    T: 0x9c7b52,
  },
  pattern: [
    'SSSSSN.NN.NSSSSS',
    'SRRRRRRRRRRRRRRS',
    'SRRRRRRRRRRRRRRS',
    'SRRRRRRRRRRRRRRS',
    'SSSSSSSSSSSSSSSS',
    'SBLBLBLBLBLBLBLS',
    'SBLBLHHHHBLBLBLS',
    'SBLBFFFFFFBLBLBS',
    'SBLBLDDBLBLBLBLS',
    'SBLBLDDBLBLBLBLS',
    'SSSSSSSSSSSSSSSS',
    'FF..FF..FF..FF..',
    'TTTTTTTTTTTTTTTT',
    '................',
    'FF..FF..FF..FF..',
    'SSSSSSSSSSSSSSSS',
  ],
};

const WAREHOUSE_SPRITE: PixelSprite = {
  // P alternates with B for wall planking. The hay-loft door (frame L,
  // window H, base D) used to be baked in here; it's now carved out as its
  // own WAREHOUSE_DOOR_ACCENT_SPRITE (Phase 19) layered on top so it can
  // swing, leaving plain planking underneath.
  palette: { S: 0x3e2723, R: 0x7c5e3c, B: 0xa1887f, P: 0x8a7266, D: 0x5d4037, H: 0xe8ded1, L: 0x6d4c41 },
  pattern: [
    'SSSSSSSSSSSSSSSS',
    '.SRRRRRRRRRRRRS.',
    'SSRRRRRRRRRRRRSS',
    'SRRRRRRRRRRRRRRS',
    'SSSSSSSSSSSSSSSS',
    'SBPBPBPBPBPBPBPS',
    'SBPBPBPBPBPBPBPS',
    'SBPBPBPBPBPBPBPS',
    'SBPBPBPBPBPBPBPS',
    'SBPBPBPBPBPBPBPS',
    'SBPBPBPBPBPBPBPS',
    'SBPBPBPBPBPBPBPS',
    'SBPBPBPBPBPBPBPS',
    'SBPBPBPBPBPBPBPS',
    'SDDDDDDDDDDDDDDS',
    'SSSSSSSSSSSSSSSS',
  ],
};

const SUPERMARKET_SPRITE: PixelSprite = {
  // The candy-striped awning (rows 1-2, A/W) used to be baked in here; it's
  // now carved out as its own SUPERMARKET_AWNING_ACCENT_SPRITE (Phase 19)
  // layered on top so it can sway, leaving a plain roof band underneath.
  // P alternates with B for planked walls below it.
  palette: { S: 0x3e2723, R: 0x8e24aa, A: 0xce93d8, B: 0xefebe9, P: 0xd8d0c8, D: 0x5d4037, W: 0xffffff, G: 0x2e7d32 },
  pattern: [
    'SSSSSSSSSSSSSSSS',
    'SSSSSSSSSSSSSSSS',
    'SSSSSSSSSSSSSSSS',
    'SSSSSSSSSSSSSSSS',
    'SBPBPBPBPBPBPBPS',
    'SBPWWWWWWWWWWPBS',
    'SBPWGGWWWWGGWPBS',
    'SBPWWWWWWWWWWPBS',
    'SBPBPBPBPBPBPBPS',
    'SBPBPRRRRBPBPBPS',
    'SBPBPRDDRBPBPBPS',
    'SBPBPRDDRBPBPBPS',
    'SBPBPBPBPBPBPBPS',
    'SBPBPBPBPBPBPBPS',
    'SDDDDDDDDDDDDDDS',
    'SSSSSSSSSSSSSSSS',
  ],
};

const FENCE_SPRITE: PixelSprite = {
  palette: { F: 0xc9a063, D: 0x8d6748 },
  pattern: [
    '........',
    'F..F..F.',
    'F..F..F.',
    'DDDDDDDD',
    'F..F..F.',
    'F..F..F.',
    'DDDDDDDD',
    '........',
  ],
};

const BARRACKS_SPRITE: PixelSprite = {
  // Row 0's alternating S/gap crenellations give the roofline a small-fort
  // parapet silhouette; the H pair (rows 6-7) reads as a sheriff's-office
  // badge window between the wood-plank walls, F is a banner below the door.
  palette: { S: 0x4e342e, R: 0x6d4c41, B: 0x8d6748, P: 0x7a5a3d, H: 0xffd54f, D: 0x2b1d12, F: 0xc62828 },
  pattern: [
    'S.S.S.S.S.S.S.S.',
    'SRRRRRRRRRRRRRRS',
    'SRRRRRRRRRRRRRRS',
    'SRRRRRRRRRRRRRRS',
    'SSSSSSSSSSSSSSSS',
    'SBPBPBPBPBPBPBPS',
    'SBPBP.HH.BPBPBPS',
    'SBPBP.HH.BPBPBPS',
    'SBPBPBPBPBPBPBPS',
    'SBPBPBPBPBPBPBPS',
    'SBPBPDDDDBPBPBPS',
    'SBPBPDDDDBPBPBPS',
    'SBPBPFFFFBPBPBPS',
    'SBPBPBPBPBPBPBPS',
    'SBPBPBPBPBPBPBPS',
    'SSSSSSSSSSSSSSSS',
  ],
};

const SEWERY_SPRITE: PixelSprite = {
  // Cloth bolt (C/G striped bands) hangs in the window in place of Butcher's
  // cleaver; the yard swaps its fence line for a tan hide stretched across a
  // drying rack (H rows 12-13, P posts either side) - a tannery detail.
  palette: { S: 0x3e2723, R: 0x6d4c41, B: 0x8d6748, P: 0x7a5a3d, C: 0xad1457, G: 0xf9a825, D: 0x4e342e, H: 0xc9a063 },
  pattern: [
    'SSSSSSSSSSSSSSSS',
    'SRRRRRRRRRRRRRRS',
    'SRRRRRRRRRRRRRRS',
    'SRRRRRRRRRRRRRRS',
    'SSSSSSSSSSSSSSSS',
    'SBPBPBPBPBPBPBPS',
    'SBPBPCCCCBPBPBPS',
    'SBPBPGGGGBPBPBPS',
    'SBPBPCCCCBPBPBPS',
    'SBPBPDDDDBPBPBPS',
    'SSSSSSSSSSSSSSSS',
    'PP..PP..PP..PP..',
    'HHHHHHHHHHHHHHHH',
    'HHHHHHHHHHHHHHHH',
    'PP..PP..PP..PP..',
    'SSSSSSSSSSSSSSSS',
  ],
};

const FORESTRY_SPRITE: PixelSprite = {
  // No building walls at all - a dense stand of three pine trees (G/L
  // canopy tiers, T trunks) over a log pile (K logs, E cut ends) instead of
  // a facade, since Forestry is an outdoor gathering site like Well.
  palette: { G: 0x1b5e20, L: 0x2e7d32, T: 0x4e342e, S: 0x6d4c41, K: 0x8d6748, E: 0xd7ccc8 },
  pattern: [
    '..G.....G....G..',
    '..G.....G....G..',
    '.GGG...GGG..GGG.',
    '.LLL...LLL..LLL.',
    '.GGG...GGG..GGG.',
    'LLLLL.LLLLLLLLLL',
    'GGGGG.GGGGGGGGGG',
    'LLLLL.LLLLLLLLLL',
    '..T.....T....T..',
    '..T.....T....T..',
    'SSSSSSSSSSSSSSSS',
    'SSSSSSSSSSSSSSSS',
    'SSSEKKKKKKKKESSS',
    'SSEKKKKKKKKKKESS',
    'SSSSSSSSSSSSSSSS',
    'SSSSSSSSSSSSSSSS',
  ],
};

const WOOD_CUTTER_SPRITE: PixelSprite = {
  // Grey tin roof (sawmill, not a farm's red barn roof) and a circular saw
  // blade (W ring, D axle) set in the wall in place of Butcher's cleaver;
  // the yard swaps the fence line for stacked logs (K) instead.
  palette: { S: 0x3e2723, R: 0x757575, B: 0xa1887f, P: 0x8a7266, W: 0xb0bec5, D: 0x5d4037, K: 0x8d6748 },
  pattern: [
    'SSSSSSSSSSSSSSSS',
    'SRRRRRRRRRRRRRRS',
    'SRRRRRRRRRRRRRRS',
    'SRRRRRRRRRRRRRRS',
    'SSSSSSSSSSSSSSSS',
    'SBPBPBPBPBPBPBPS',
    'SBPBPWWWWBPBPBPS',
    'SBPBPWDDWBPBPBPS',
    'SBPBPWDDWBPBPBPS',
    'SBPBPWWWWBPBPBPS',
    'SSSSSSSSSSSSSSSS',
    'KK..KK..KK..KK..',
    '................',
    '................',
    'KK..KK..KK..KK..',
    'SSSSSSSSSSSSSSSS',
  ],
};

const POTATO_FIELD_SPRITE: PixelSprite = {
  // No walls, like Forestry: tilled soil ridges (D) alternate with troughs
  // (L), green sprigs (G) dot every ridge, and a row of exposed tan tubers
  // (T) near the bottom reads as harvest-ready potatoes.
  palette: { D: 0x4e342e, L: 0x6d4c41, G: 0x4caf50, T: 0xc9a063 },
  pattern: [
    'DDDDDDDDDDDDDDDD',
    'DG..DG..DG..DG..',
    'LLLLLLLLLLLLLLLL',
    'DDDDDDDDDDDDDDDD',
    'DG..DG..DG..DG..',
    'LLLLLLLLLLLLLLLL',
    'DDDDDDDDDDDDDDDD',
    'DG..DG..DG..DG..',
    'LLLLLLLLLLLLLLLL',
    'DDDDDDDDDDDDDDDD',
    'DG..DG..DG..DG..',
    'LLLLLLLLLLLLLLLL',
    'DDDDDDDDDDDDDDDD',
    'DDDTTDDDDTTDDDTT',
    'LLLLLLLLLLLLLLLL',
    'DDDDDDDDDDDDDDDD',
  ],
};

const LIQUOR_SPRITE: PixelSprite = {
  // A copper pot still (W body, D shading, narrow W neck) in place of
  // Butcher's cleaver window; the yard swaps the fence/log line for stacked
  // barrels (H bands, K staves) instead.
  palette: { S: 0x3e2723, R: 0xb87333, B: 0xa1887f, P: 0x8a7266, W: 0xd2823a, D: 0x5d4037, H: 0xc9a063, K: 0x6d4c41 },
  pattern: [
    'SSSSSSSSSSSSSSSS',
    'SRRRRRRRRRRRRRRS',
    'SRRRRRRRRRRRRRRS',
    'SRRRRRRRRRRRRRRS',
    'SSSSSSSSSSSSSSSS',
    'SBPBPBPBPBPBPBPS',
    'SBPBPBWWPBPBPBPS',
    'SBPBPWWWWBPBPBPS',
    'SBPBPWDDWBPBPBPS',
    'SBPBPWDDWBPBPBPS',
    'SSSSSSSSSSSSSSSS',
    'HH..HH..HH..HH..',
    'KK..KK..KK..KK..',
    'KK..KK..KK..KK..',
    'HH..HH..HH..HH..',
    'SSSSSSSSSSSSSSSS',
  ],
};

const SALOON_SPRITE: PixelSprite = {
  // Stepped false-front parapet (rows 0-1) over a hanging sign band (H),
  // a second-story window row (W) with a balcony rail underneath (G/D
  // ticks), then batwing doors on the ground floor - the dark K gap
  // between the D door panels reads as the swinging doors' open middle.
  palette: {
    S: 0x4e342e,
    R: 0x8d6e4a,
    H: 0xffd54f,
    B: 0xefebe9,
    P: 0xd8d0c8,
    W: 0x90caf9,
    G: 0x8d6748,
    D: 0x5d4037,
    K: 0x2b1d12,
  },
  pattern: [
    '..SSSSSSSSSSSS..',
    'SSSSSSSSSSSSSSSS',
    'SRRRRRHHHHRRRRRS',
    'SBPBWWBPPBWWBPBS',
    'SBPBWWBPPBWWBPBS',
    'SGDGDGDGDGDGDGDS',
    'SSSSSSSSSSSSSSSS',
    'SBPBPBPBPBPBPBPS',
    'SBPBPDDKKDDBPBPS',
    'SBPBPDDKKDDBPBPS',
    'SBPBPDDDDDDBPBPS',
    'SSSSSSSSSSSSSSSS',
    'G..............G',
    'G..............G',
    'SSSSSSSSSSSSSSSS',
    'SSSSSSSSSSSSSSSS',
  ],
};

const HORSERY_SPRITE: PixelSprite = {
  // Horse-head silhouette (H, rows 5-7) sits over the doorway (D) in place of
  // Barracks' badge window; the yard swaps Barracks' banner/fence line for a
  // wood rail fence (F) alternating with a hay bale (W) - a stable/corral
  // read instead of a fort/office read.
  palette: { S: 0x4e342e, R: 0x8d6e4a, B: 0xa1887f, P: 0x8a7266, H: 0x3e2723, D: 0x2b1d12, F: 0x8d6748, W: 0xf9d776 },
  pattern: [
    'SSSSSSSSSSSSSSSS',
    'SRRRRRRRRRRRRRRS',
    'SRRRRRRRRRRRRRRS',
    'SRRRRRRRRRRRRRRS',
    'SSSSSSSSSSSSSSSS',
    'SBPBP.HH.BPBPBPS',
    'SBPBPHHHHBPBPBPS',
    'SBPBP.HH.BPBPBPS',
    'SBPBPBPBPBPBPBPS',
    'SBPBPDDDDBPBPBPS',
    'SBPBPDDDDBPBPBPS',
    'SSSSSSSSSSSSSSSS',
    'FF..WW..FF..WW..',
    '................',
    'FF..WW..FF..WW..',
    'SSSSSSSSSSSSSSSS',
  ],
};

const BUILDING_SPRITES: Record<BuildingType, PixelSprite> = {
  [BuildingType.CattleFarm]: CATTLE_FARM_SPRITE,
  [BuildingType.Butcher]: BUTCHER_SPRITE,
  [BuildingType.Well]: WELL_SPRITE,
  [BuildingType.House]: HOUSE_SPRITE,
  [BuildingType.Road]: ROAD_SPRITE,
  [BuildingType.ChickenFarm]: CHICKEN_FARM_SPRITE,
  [BuildingType.PigFarm]: PIG_FARM_SPRITE,
  [BuildingType.CowRanch]: COW_RANCH_SPRITE,
  [BuildingType.Fence]: FENCE_SPRITE,
  [BuildingType.Warehouse]: WAREHOUSE_SPRITE,
  [BuildingType.Supermarket]: SUPERMARKET_SPRITE,
  [BuildingType.Barracks]: BARRACKS_SPRITE,
  [BuildingType.Sewery]: SEWERY_SPRITE,
  [BuildingType.Forestry]: FORESTRY_SPRITE,
  [BuildingType.WoodCutter]: WOOD_CUTTER_SPRITE,
  [BuildingType.PotatoField]: POTATO_FIELD_SPRITE,
  [BuildingType.Liquor]: LIQUOR_SPRITE,
  [BuildingType.Saloon]: SALOON_SPRITE,
  [BuildingType.Horsery]: HORSERY_SPRITE,
};

const CHICKEN_ANIMAL_SPRITE: PixelSprite = {
  // C is the comb, Y the beak/legs; W/B mix the white/brown feather look asked for.
  palette: { C: 0xd32f2f, W: 0xfff8e1, B: 0x8d6e4a, Y: 0xffa000 },
  pattern: ['..C...', '.WWBY.', 'WWWBWW', 'WBWWWW', '.W..W.', '.Y..Y.'],
};

const PIG_ANIMAL_SPRITE: PixelSprite = {
  // S doubles as the snout nostrils (row 3) and the legs (row 5).
  palette: { P: 0xe8a5b8, S: 0x8d5a68 },
  pattern: ['.PPPP.', 'PPPPPP', 'PPPPPP', 'PPSSPP', '.PPPP.', '.S..S.'],
};

const COW_ANIMAL_SPRITE: PixelSprite = {
  // H in row 0 corners hints at horns; B is the brown spot pattern, D the legs.
  palette: { W: 0xfff8e1, B: 0x6d4c41, H: 0xf5f0e1, D: 0x5d4037 },
  pattern: ['H....H', '.WWWW.', 'WBWWBW', 'WWWBWW', '.WWWW.', '.D..D.'],
};

const ANIMAL_SPRITES: Record<AnimalKind, PixelSprite> = {
  Chicken: CHICKEN_ANIMAL_SPRITE,
  Pig: PIG_ANIMAL_SPRITE,
  Cow: COW_ANIMAL_SPRITE,
};

/**
 * Phase 19 idle-animation accents: small pieces carved out of the building
 * sprites above (well crank, warehouse door, supermarket awning, chicken
 * coop opening) so MainScene can layer and tween them independently. Drawn
 * at the same PIXEL_SIZE as buildings so they line up pixel-for-pixel with
 * the spot they were cut from.
 */
const WELL_CRANK_ACCENT_SPRITE: PixelSprite = {
  palette: { C: 0x424242 },
  pattern: ['CCCC'],
};

const WAREHOUSE_DOOR_ACCENT_SPRITE: PixelSprite = {
  palette: { L: 0x6d4c41, H: 0xe8ded1, D: 0x5d4037 },
  pattern: ['LLLLLL', 'LHHHHL', 'LHHHHL', 'LDDDDL', 'LDDDDL', 'LLLLLL'],
};

const SUPERMARKET_AWNING_ACCENT_SPRITE: PixelSprite = {
  palette: { A: 0xce93d8, W: 0xffffff },
  pattern: ['.AAWWAAWWAAWWAA.', 'AAWWAAWWAAWWAAWW'],
};

const CHICKEN_DOOR_ACCENT_SPRITE: PixelSprite = {
  palette: { C: 0xfff8e1 },
  pattern: ['.CC.', '.CC.', 'CCCC'],
};

const ACCENT_SPRITES: Record<AccentKind, PixelSprite> = {
  WellCrank: WELL_CRANK_ACCENT_SPRITE,
  WarehouseDoor: WAREHOUSE_DOOR_ACCENT_SPRITE,
  SupermarketAwning: SUPERMARKET_AWNING_ACCENT_SPRITE,
  ChickenDoor: CHICKEN_DOOR_ACCENT_SPRITE,
};

/**
 * Phase 20 villager: a minimal human silhouette readable at animal-sprite
 * scale - hat brim, face, vest/torso, two legs. No walk-cycle frames; facing
 * is handled by flipping this single frame (MainScene.startVillagerWander).
 */
const VILLAGER_SPRITE: PixelSprite = {
  palette: { H: 0x3e2723, F: 0xffcb8e, V: 0x6d4c41, L: 0x4e342e },
  pattern: ['.HHHH.', '.FFFF.', 'VVVVVV', 'VVVVVV', '.L..L.', '.L..L.'],
};

/**
 * Phase 22 Cowboy: a wide brim (row 0) reads as a cowhand's hat rather than
 * the Villager's rounder cap; G is a single holstered-gun pixel at the hip
 * (row 3), the only silhouette hint this small a sprite can carry.
 */
const COWBOY_SPRITE: PixelSprite = {
  palette: { H: 0x4e342e, F: 0xffcb8e, V: 0x8d6748, L: 0x3e2723, G: 0x212121 },
  pattern: ['HHHHHH', '.FFFF.', 'VVVVVV', 'VVVVVG', '.L..L.', '.L..L.'],
};

/**
 * Phase 28 Cowboy on Horse: a horse+rider silhouette, drawn wider than the
 * plain Cowboy's square 6x6 frame (8 cols instead of 6, same 6 rows) so a
 * mounted body reads clearly at this scale - a narrow rider (hat/face/vest,
 * rows 0-2) over a wide horse body (rows 3-4) with four separate leg pixels
 * (row 5) instead of the Cowboy's two-legged human gait.
 */
const MOUNTED_COWBOY_SPRITE: PixelSprite = {
  palette: { H: 0x4e342e, F: 0xffcb8e, V: 0x8d6748, B: 0x6d4c41, L: 0x3e2723 },
  pattern: ['..HHHH..', '..FFFF..', '.VVVVVV.', 'BBBBBBBB', 'BBBBBBBB', 'L.L..L.L'],
};

/**
 * Phase 23 Outlaw: a near-black hat and a kerchief mask (M) drawn straight
 * across the face row - no visible skin tone at all - reads as a masked
 * bandit and keeps this raider's palette clearly darker/more muted than the
 * friendly Cowboy's warm browns. G is the same holstered-gun hint as Cowboy.
 */
const OUTLAW_SPRITE: PixelSprite = {
  palette: { H: 0x212121, M: 0x37474f, V: 0x3e2723, L: 0x1c1c1c, G: 0x000000 },
  pattern: ['HHHHHH', 'MMMMMM', 'VVVVVV', 'VVVVVG', '.L..L.', '.L..L.'],
};

/**
 * Phase 23 Rustler: unmasked (F, visible face) unlike the Outlaw, and a rope
 * coil (R) at the hip instead of a gun - a cattle thief's tool, not a
 * gunslinger's. Olive/tan palette keeps it distinct from both Outlaw and Cowboy.
 */
const RUSTLER_SPRITE: PixelSprite = {
  palette: { H: 0x6d5a3a, F: 0xd9a066, V: 0x5b5a3c, L: 0x3e3a28, R: 0x9c7b52 },
  pattern: ['HHHHHH', '.FFFF.', 'VVVVVV', 'VVVVRR', '.L..L.', '.L..L.'],
};

/**
 * Phase 23 Coyote: a low four-legged canine silhouette, deliberately
 * non-humanoid unlike the other two raiders - pointed ears (E) top corners,
 * a tan body block, a dark tail tip (T) trailing off one side, and four
 * separate leg pixels on the bottom row instead of the two-legged human gait.
 */
const COYOTE_SPRITE: PixelSprite = {
  palette: { E: 0x6d5a42, B: 0xbfa980, T: 0x6d5a42, L: 0x4e3f2c },
  pattern: ['E....E', 'BBBBBB', 'BBBBBB', 'BBBBBT', 'L.LL.L', '......'],
};

const RAIDER_SPRITES: Record<RaiderFaction, PixelSprite> = {
  [RaiderFaction.Outlaws]: OUTLAW_SPRITE,
  [RaiderFaction.Rustlers]: RUSTLER_SPRITE,
  [RaiderFaction.Coyotes]: COYOTE_SPRITE,
};

function drawPixelSprite(
  graphics: Phaser.GameObjects.Graphics,
  originX: number,
  originY: number,
  sprite: PixelSprite,
  pixelSize: number = PIXEL_SIZE,
): void {
  sprite.pattern.forEach((row, rowIndex) => {
    for (let col = 0; col < row.length; col++) {
      const key = row[col];
      if (key === '.') {
        continue;
      }
      graphics.fillStyle(sprite.palette[key], 1);
      graphics.fillRect(originX + col * pixelSize, originY + rowIndex * pixelSize, pixelSize, pixelSize);
    }
  });
}

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    this.generateTilesetTexture();
    this.generateBuildingAtlas();
    this.generateAnimalAtlas();
    this.generateAccentAtlas();
    this.generateVillagerAtlas();
    this.generateCowboyAtlas();
    this.generateMountedCowboyAtlas();
    this.generateRaiderAtlas();
  }

  create(): void {
    this.scene.start('MainScene');
  }

  private generateTilesetTexture(): void {
    const graphics = this.make.graphics({ x: 0, y: 0 });

    TILE_SPRITES.forEach((sprite, index) => {
      drawPixelSprite(graphics, index * TILE_SIZE, 0, sprite);
    });

    graphics.generateTexture(TILESET_KEY, TILE_SPRITES.length * TILE_SIZE, TILE_SIZE);
    graphics.destroy();
  }

  private generateBuildingAtlas(): void {
    const definitions = Object.values(BUILDING_DEFINITIONS);
    const layout = definitions.map((definition) => ({
      definition,
      width: definition.size.width * TILE_SIZE,
      height: definition.size.height * TILE_SIZE,
    }));

    let atlasWidth = 0;
    let atlasHeight = 0;
    const positions: number[] = [];
    for (const { width, height } of layout) {
      positions.push(atlasWidth);
      atlasWidth += width;
      atlasHeight = Math.max(atlasHeight, height);
    }

    const graphics = this.make.graphics({ x: 0, y: 0 });
    layout.forEach(({ definition }, index) => {
      drawPixelSprite(graphics, positions[index], 0, BUILDING_SPRITES[definition.type]);
    });

    graphics.generateTexture(BUILDING_ATLAS_KEY, atlasWidth, atlasHeight);
    graphics.destroy();

    const texture = this.textures.get(BUILDING_ATLAS_KEY);
    layout.forEach(({ definition, width, height }, index) => {
      texture.add(buildingTextureKey(definition.type), 0, positions[index], 0, width, height);
    });
  }

  private generateAnimalAtlas(): void {
    const kinds = Object.keys(ANIMAL_SPRITES) as AnimalKind[];

    const graphics = this.make.graphics({ x: 0, y: 0 });
    kinds.forEach((kind, index) => {
      drawPixelSprite(graphics, index * ANIMAL_SPRITE_SIZE, 0, ANIMAL_SPRITES[kind], ANIMAL_PIXEL_SIZE);
    });

    graphics.generateTexture(ANIMALS_ATLAS_KEY, kinds.length * ANIMAL_SPRITE_SIZE, ANIMAL_SPRITE_SIZE);
    graphics.destroy();

    const texture = this.textures.get(ANIMALS_ATLAS_KEY);
    kinds.forEach((kind, index) => {
      texture.add(animalTextureKey(kind), 0, index * ANIMAL_SPRITE_SIZE, 0, ANIMAL_SPRITE_SIZE, ANIMAL_SPRITE_SIZE);
    });
  }

  /** Frames vary in size per accent (a thin crank bar vs. a wide awning strip), so this follows generateBuildingAtlas's side-by-side layout rather than the animal atlas's uniform grid. */
  private generateAccentAtlas(): void {
    const kinds = Object.keys(ACCENT_SPRITES) as AccentKind[];
    const layout = kinds.map((kind) => {
      const sprite = ACCENT_SPRITES[kind];
      return {
        kind,
        width: sprite.pattern[0].length * PIXEL_SIZE,
        height: sprite.pattern.length * PIXEL_SIZE,
      };
    });

    let atlasWidth = 0;
    let atlasHeight = 0;
    const positions: number[] = [];
    for (const { width, height } of layout) {
      positions.push(atlasWidth);
      atlasWidth += width;
      atlasHeight = Math.max(atlasHeight, height);
    }

    const graphics = this.make.graphics({ x: 0, y: 0 });
    layout.forEach(({ kind }, index) => {
      drawPixelSprite(graphics, positions[index], 0, ACCENT_SPRITES[kind]);
    });

    graphics.generateTexture(ACCENTS_ATLAS_KEY, atlasWidth, atlasHeight);
    graphics.destroy();

    const texture = this.textures.get(ACCENTS_ATLAS_KEY);
    layout.forEach(({ kind, width, height }, index) => {
      texture.add(accentTextureKey(kind), 0, positions[index], 0, width, height);
    });
  }

  /** Single-frame atlas (only one villager look exists), drawn at the same coarse grid as animal critters. */
  private generateVillagerAtlas(): void {
    const graphics = this.make.graphics({ x: 0, y: 0 });
    drawPixelSprite(graphics, 0, 0, VILLAGER_SPRITE, ANIMAL_PIXEL_SIZE);

    graphics.generateTexture(VILLAGERS_ATLAS_KEY, VILLAGER_SPRITE_SIZE, VILLAGER_SPRITE_SIZE);
    graphics.destroy();

    const texture = this.textures.get(VILLAGERS_ATLAS_KEY);
    texture.add(VILLAGER_TEXTURE_KEY, 0, 0, 0, VILLAGER_SPRITE_SIZE, VILLAGER_SPRITE_SIZE);
  }

  /** Single-frame atlas (only one Cowboy look exists), same coarse grid as animal/villager sprites. */
  private generateCowboyAtlas(): void {
    const graphics = this.make.graphics({ x: 0, y: 0 });
    drawPixelSprite(graphics, 0, 0, COWBOY_SPRITE, ANIMAL_PIXEL_SIZE);

    graphics.generateTexture(COWBOYS_ATLAS_KEY, COWBOY_SPRITE_SIZE, COWBOY_SPRITE_SIZE);
    graphics.destroy();

    const texture = this.textures.get(COWBOYS_ATLAS_KEY);
    texture.add(COWBOY_TEXTURE_KEY, 0, 0, 0, COWBOY_SPRITE_SIZE, COWBOY_SPRITE_SIZE);
  }

  /**
   * Single-frame atlas, same technique as generateCowboyAtlas but with a
   * non-square frame (MOUNTED_COWBOY_SPRITE_WIDTH x ...HEIGHT rather than the
   * uniform ANIMAL_SPRITE_SIZE square every other small-unit atlas uses).
   */
  private generateMountedCowboyAtlas(): void {
    const graphics = this.make.graphics({ x: 0, y: 0 });
    drawPixelSprite(graphics, 0, 0, MOUNTED_COWBOY_SPRITE, ANIMAL_PIXEL_SIZE);

    graphics.generateTexture(MOUNTED_COWBOYS_ATLAS_KEY, MOUNTED_COWBOY_SPRITE_WIDTH, MOUNTED_COWBOY_SPRITE_HEIGHT);
    graphics.destroy();

    const texture = this.textures.get(MOUNTED_COWBOYS_ATLAS_KEY);
    texture.add(
      MOUNTED_COWBOY_TEXTURE_KEY,
      0,
      0,
      0,
      MOUNTED_COWBOY_SPRITE_WIDTH,
      MOUNTED_COWBOY_SPRITE_HEIGHT,
    );
  }

  /** Multi-frame atlas (one look per faction), same uniform-grid layout as generateAnimalAtlas. */
  private generateRaiderAtlas(): void {
    const factions = Object.keys(RAIDER_SPRITES) as RaiderFaction[];

    const graphics = this.make.graphics({ x: 0, y: 0 });
    factions.forEach((faction, index) => {
      drawPixelSprite(graphics, index * RAIDER_SPRITE_SIZE, 0, RAIDER_SPRITES[faction], ANIMAL_PIXEL_SIZE);
    });

    graphics.generateTexture(RAIDERS_ATLAS_KEY, factions.length * RAIDER_SPRITE_SIZE, RAIDER_SPRITE_SIZE);
    graphics.destroy();

    const texture = this.textures.get(RAIDERS_ATLAS_KEY);
    factions.forEach((faction, index) => {
      texture.add(raiderTextureKey(faction), 0, index * RAIDER_SPRITE_SIZE, 0, RAIDER_SPRITE_SIZE, RAIDER_SPRITE_SIZE);
    });
  }
}
