export const TILE_SIZE = 32;
export const MAP_WIDTH_TILES = 40;
export const MAP_HEIGHT_TILES = 30;
export const VIEWPORT_WIDTH = 960;
export const VIEWPORT_HEIGHT = 640;
export const PRODUCTION_TICK_MS = 2000;
export const POPULATION_PER_HOUSE = 2;
export const GAME_DURATION_SECONDS = 300;
// Caps a building's uncollected output buffer at N ticks worth of production,
// so an idle/forgotten building loses future output instead of stockpiling forever.
export const HARVEST_BUFFER_CAP_MULTIPLIER = 5;
// Minimap dims match the 40x30 tile map's 4:3 aspect ratio (5px per tile).
export const MINIMAP_WIDTH = 200;
export const MINIMAP_HEIGHT = 150;
export const MINIMAP_MARGIN = 8;
