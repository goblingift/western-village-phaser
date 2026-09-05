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
// Phase 23's combat system reads both: range for targeting the nearest
// raider, max HP as the regen cap already applied in gameState.runHpRegen.
export const COWBOY_RANGE_TILES = 5;
export const COWBOY_MAX_HP = 30;
// Damage dealt by a single Cowboy shot per combat tick.
export const COWBOY_DAMAGE = 8;

// Phase 23: Raid Events & Combat. The gap before the next raid is randomized
// per-raid (not a fixed period) so raids don't become predictable/farmable.
export const RAID_MIN_INTERVAL_MS = 45000;
export const RAID_MAX_INTERVAL_MS = 90000;
export const RAID_MIN_UNITS = 2;
export const RAID_MAX_UNITS = 5;
// A wave force-ends after this long even if raiders survive (e.g. an
// undefended town with nothing shooting back), so raids never stall forever.
export const RAID_WAVE_TIMEOUT_MS = 60000;

// Phase 28: Horsery & Cowboy on Horse. Mirrors Phase 22's Barracks/Cowboy
// cost/cap/HP constants above rather than sharing them - the two units differ
// in cost, cap, HP and speed, so keeping separate named constants keeps each
// building's numbers independently readable/tunable.
export const MOUNTED_COWBOY_TRAIN_COST = 90;
export const MOUNTED_COWBOY_MAX_PER_HORSERY = 2;
export const MOUNTED_COWBOY_MAX_HP = 40;
// 3x MainScene's COWBOY_WALK_SPEED_PX_PER_SEC (60px/sec), reflecting the horse's speed advantage.
export const MOUNTED_COWBOY_WALK_SPEED_PX_PER_SEC = 180;

// Phase 29: Bank. Fixed per-click deposit/withdraw increment; interest is a
// flat compounding rate applied to a Bank's own bankBalance each production
// tick, independent of the RAID_* constants above (those are perturbed at
// runtime by MainScene's bank-risk check, not redefined here).
export const BANK_TRANSACTION_AMOUNT = 50;
export const BANK_INTEREST_RATE = 0.005;
