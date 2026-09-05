export const TILE_SIZE = 32;
export const MAP_WIDTH_TILES = 40;
export const MAP_HEIGHT_TILES = 30;
export const VIEWPORT_WIDTH = 960;
export const VIEWPORT_HEIGHT = 640;
export const PRODUCTION_TICK_MS = 2000;
export const POPULATION_PER_HOUSE = 2;
export const GAME_DURATION_SECONDS = 300;
// Global per-resource storage cap: always-available base capacity plus a bonus
// for every currently-staffed Warehouse. Production beyond the cap is wasted.
export const BASE_STORAGE_CAP = 50;
export const WAREHOUSE_STORAGE_BONUS = 150;
// Minimap dims match the 40x30 tile map's 4:3 aspect ratio (5px per tile).
export const MINIMAP_WIDTH = 200;
export const MINIMAP_HEIGHT = 150;
export const MINIMAP_MARGIN = 8;
// Phase 22: Barracks & Cowboy Units. Cowboys are bought like Phase 16's
// animals (cost + per-Barracks cap) but aren't an AnimalConfig, since only
// one building type ever has them and they carry their own HP, not output.
export const COWBOY_TRAIN_COST = 40;
export const COWBOY_MAX_PER_BARRACKS = 3;
// Not read anywhere this phase; Phase 23's combat system consumes both.
export const COWBOY_RANGE_TILES = 5;
export const COWBOY_MAX_HP = 30;
