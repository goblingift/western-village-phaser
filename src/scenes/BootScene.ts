import Phaser from 'phaser';
import { TILE_SIZE } from '../config/constants';
import { BUILDING_ATLAS_KEY, BUILDING_DEFINITIONS, BuildingType, buildingTextureKey } from '../config/buildingConfig';

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
    'GGGGGGGG',
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
  palette: { S: 0xd2b48c, D: 0xb08968, H: 0xe8d0a9 },
  pattern: [
    'SSSSSSSS',
    'SSDSSSSS',
    'SSSSSSHS',
    'SSSSDSSS',
    'SSSSSSSS',
    'SHSSSSDS',
    'SSSSSSSS',
    'SSSSSSSS',
  ],
};

// Order must match the TileType enum values (Grass=0, Water=1, Sand=2), since
// tile indices in the generated tilemap are used directly as frame indices.
const TILE_SPRITES: PixelSprite[] = [GRASS_SPRITE, WATER_SPRITE, SAND_SPRITE];

const CATTLE_FARM_SPRITE: PixelSprite = {
  palette: { S: 0x4e342e, R: 0x6d4c41, B: 0x8d6748, H: 0xd7ccc8, D: 0x3e2723, F: 0xc9a063 },
  pattern: [
    'SSSSSSSSSSSSSSSS',
    'SRRRRRRRRRRRRRRS',
    'SRRRRRRRRRRRRRRS',
    'SRRRRRRRRRRRRRRS',
    'SSSSSSSSSSSSSSSS',
    'SBBBBBBBBBBBBBBS',
    'SBBBBHHHHBBBBBBS',
    'SBBBBHHHHBBBBBBS',
    'SBBBBDDBBBBBBBBS',
    'SBBBBDDBBBBBBBBS',
    'SSSSSSSSSSSSSSSS',
    'FF..FF..FF..FF..',
    '................',
    '................',
    'FF..FF..FF..FF..',
    'SSSSSSSSSSSSSSSS',
  ],
};

const BUTCHER_SPRITE: PixelSprite = {
  palette: { S: 0x3e2723, R: 0xb71c1c, B: 0xe8ded1, H: 0xffffff, D: 0x4e342e, C: 0x8d0000 },
  pattern: [
    'SSSSSSSSSSSSSSSS',
    'SRRRRRRRRRRRRRRS',
    'SRRRRRRRRRRRRRRS',
    'SRRRRRRRRRRRRRRS',
    'SRRRRRRRRRRRRRRS',
    'SSSSSSSSSSSSSSSS',
    'SBBBBBBBBBBBBBBS',
    'SBBBBBCCBBBBBBBS',
    'SBBBBCCCCBBBBBBS',
    'SBBBBBCCBBBBBBBS',
    'SBBBBBCCBBBBBBBS',
    'SBBBBHHHHBBBBBBS',
    'SBBBBHHHHBBBBBBS',
    'SBBBBDDDDBBBBBBS',
    'SBBBBDDDDBBBBBBS',
    'SSSSSSSSSSSSSSSS',
  ],
};

const WELL_SPRITE: PixelSprite = {
  palette: { S: 0x616161, B: 0xbdbdbd, H: 0xeeeeee, D: 0x0d47a1 },
  pattern: [
    '..SSSS..',
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
  palette: { R: 0xa1442e, S: 0x4e342e, B: 0xffcb8e, W: 0x90caf9, D: 0x5d4037 },
  pattern: [
    '.SSSSSS.',
    'SRRRRRRS',
    'SRRRRRRS',
    'SSSSSSSS',
    'SBBWWBBS',
    'SBBWWBBS',
    'SBBDDBBS',
    'SSSSSSSS',
  ],
};

const ROAD_SPRITE: PixelSprite = {
  palette: { B: 0x8d6e63, D: 0x6d4c41, H: 0xa1887f },
  pattern: [
    'BBBBBBBB',
    'BBDBBBBB',
    'BBBBBHBB',
    'BDBBBBBB',
    'BBBBBBDB',
    'BHBBBBBB',
    'BBBBDBBB',
    'BBBBBBBB',
  ],
};

const CHICKEN_FARM_SPRITE: PixelSprite = {
  palette: { S: 0x4e342e, D: 0x6d4c41, W: 0x8d6e4a, C: 0xfff8e1 },
  pattern: [
    '.SSSSSS.',
    'SDDDDDDS',
    'SDDDDDDS',
    'SSSSSSSS',
    'SWWCCWWS',
    'SWWCCWWS',
    'SWCCCCWS',
    'SSSSSSSS',
  ],
};

const PIG_FARM_SPRITE: PixelSprite = {
  palette: { S: 0x4e342e, R: 0xd08a9e, B: 0xe8a5b8, H: 0xfff0f3, D: 0x8d5a68, F: 0xc9a063 },
  pattern: [
    'SSSSSSSSSSSSSSSS',
    'SRRRRRRRRRRRRRRS',
    'SRRRRRRRRRRRRRRS',
    'SRRRRRRRRRRRRRRS',
    'SSSSSSSSSSSSSSSS',
    'SBBBBBBBBBBBBBBS',
    'SBBBBHHHHBBBBBBS',
    'SBBBBHHHHBBBBBBS',
    'SBBBBDDBBBBBBBBS',
    'SBBBBDDBBBBBBBBS',
    'SSSSSSSSSSSSSSSS',
    'FF..FF..FF..FF..',
    '................',
    '................',
    'FF..FF..FF..FF..',
    'SSSSSSSSSSSSSSSS',
  ],
};

const COW_RANCH_SPRITE: PixelSprite = {
  palette: { S: 0x6d4c41, R: 0x8d6e4a, B: 0xbca88a, H: 0xfff8e1, D: 0x5d4037, F: 0x7c5e3c },
  pattern: [
    'SSSSSSSSSSSSSSSS',
    'SRRRRRRRRRRRRRRS',
    'SRRRRRRRRRRRRRRS',
    'SRRRRRRRRRRRRRRS',
    'SSSSSSSSSSSSSSSS',
    'SBBBBBBBBBBBBBBS',
    'SBBBBHHHHBBBBBBS',
    'SBBBFFFFFFBBBBBS',
    'SBBBBDDBBBBBBBBS',
    'SBBBBDDBBBBBBBBS',
    'SSSSSSSSSSSSSSSS',
    'FF..FF..FF..FF..',
    '................',
    '................',
    'FF..FF..FF..FF..',
    'SSSSSSSSSSSSSSSS',
  ],
};

const WAREHOUSE_SPRITE: PixelSprite = {
  palette: { S: 0x3e2723, R: 0x7c5e3c, B: 0xa1887f, D: 0x5d4037, H: 0xe8ded1, L: 0x6d4c41 },
  pattern: [
    'SSSSSSSSSSSSSSSS',
    '.SRRRRRRRRRRRRS.',
    'SSRRRRRRRRRRRRSS',
    'SRRRRRRRRRRRRRRS',
    'SSSSSSSSSSSSSSSS',
    'SBBBBBBBBBBBBBBS',
    'SBBBLLLLLLBBBBBS',
    'SBBBLHHHHLBBBBBS',
    'SBBBLHHHHLBBBBBS',
    'SBBBLDDDDLBBBBBS',
    'SBBBLDDDDLBBBBBS',
    'SBBBLLLLLLBBBBBS',
    'SBBBBBBBBBBBBBBS',
    'SBBBBBBBBBBBBBBS',
    'SDDDDDDDDDDDDDDS',
    'SSSSSSSSSSSSSSSS',
  ],
};

const SUPERMARKET_SPRITE: PixelSprite = {
  palette: { S: 0x3e2723, R: 0x8e24aa, A: 0xce93d8, B: 0xefebe9, D: 0x5d4037, W: 0xffffff, G: 0x2e7d32 },
  pattern: [
    'SSSSSSSSSSSSSSSS',
    '.AAAAAAAAAAAAAA.',
    'AAAAAAAAAAAAAAAA',
    'SSSSSSSSSSSSSSSS',
    'SBBBBBBBBBBBBBBS',
    'SBBWWWWWWWWWWBBS',
    'SBBWGGWWWWGGWBBS',
    'SBBWWWWWWWWWWBBS',
    'SBBBBBBBBBBBBBBS',
    'SBBBBRRRRBBBBBBS',
    'SBBBBRDDRBBBBBBS',
    'SBBBBRDDRBBBBBBS',
    'SBBBBBBBBBBBBBBS',
    'SBBBBBBBBBBBBBBS',
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

function drawPixelSprite(
  graphics: Phaser.GameObjects.Graphics,
  originX: number,
  originY: number,
  sprite: PixelSprite,
): void {
  sprite.pattern.forEach((row, rowIndex) => {
    for (let col = 0; col < row.length; col++) {
      const key = row[col];
      if (key === '.') {
        continue;
      }
      graphics.fillStyle(sprite.palette[key], 1);
      graphics.fillRect(originX + col * PIXEL_SIZE, originY + rowIndex * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
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
}
