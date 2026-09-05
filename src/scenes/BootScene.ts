import Phaser from 'phaser';
import { TILE_SIZE } from '../config/constants';
import {
  ANIMALS_ATLAS_KEY,
  ANIMAL_SPRITE_SIZE,
  AnimalKind,
  BUILDING_ATLAS_KEY,
  BUILDING_DEFINITIONS,
  BuildingType,
  animalTextureKey,
  buildingTextureKey,
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
  // Top row: P are the crank support posts, C is the horizontal crank bar
  // between them, replacing part of the stone-ring's roofline.
  palette: { S: 0x616161, B: 0xbdbdbd, H: 0xeeeeee, D: 0x0d47a1, P: 0x5d4037, C: 0x424242 },
  pattern: [
    '.P.CC.P.',
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
  palette: { S: 0x4e342e, D: 0x6d4c41, W: 0x8d6e4a, P: 0x7c5f3f, C: 0xfff8e1 },
  pattern: [
    '.SSSSSS.',
    'SDDDDDDS',
    'SDDDDDDS',
    'SSSSSSSS',
    'SWPCCPWS',
    'SWPCCPWS',
    'SWCCCCWS',
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
  // P alternates with B for wall planking; L stays reserved for the
  // hay-loft door frame so it keeps standing out against the planked wall.
  palette: { S: 0x3e2723, R: 0x7c5e3c, B: 0xa1887f, P: 0x8a7266, D: 0x5d4037, H: 0xe8ded1, L: 0x6d4c41 },
  pattern: [
    'SSSSSSSSSSSSSSSS',
    '.SRRRRRRRRRRRRS.',
    'SSRRRRRRRRRRRRSS',
    'SRRRRRRRRRRRRRRS',
    'SSSSSSSSSSSSSSSS',
    'SBPBPBPBPBPBPBPS',
    'SBPBLLLLLLBPBPBS',
    'SBPBLHHHHLBPBPBS',
    'SBPBLHHHHLBPBPBS',
    'SBPBLDDDDLBPBPBS',
    'SBPBLDDDDLBPBPBS',
    'SBPBLLLLLLBPBPBS',
    'SBPBPBPBPBPBPBPS',
    'SBPBPBPBPBPBPBPS',
    'SDDDDDDDDDDDDDDS',
    'SSSSSSSSSSSSSSSS',
  ],
};

const SUPERMARKET_SPRITE: PixelSprite = {
  // Rows 1-2 alternate A/W for a classic candy-striped general-store
  // awning; P alternates with B for planked walls below it.
  palette: { S: 0x3e2723, R: 0x8e24aa, A: 0xce93d8, B: 0xefebe9, P: 0xd8d0c8, D: 0x5d4037, W: 0xffffff, G: 0x2e7d32 },
  pattern: [
    'SSSSSSSSSSSSSSSS',
    '.AAWWAAWWAAWWAA.',
    'AAWWAAWWAAWWAAWW',
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
}
