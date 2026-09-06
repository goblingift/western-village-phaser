export const TILE_SIZE = 32;
export const MAP_WIDTH_TILES = 40;
export const MAP_HEIGHT_TILES = 30;
export const VIEWPORT_WIDTH = 960;
export const VIEWPORT_HEIGHT = 640;
export const PRODUCTION_TICK_MS = 2000;
// Phase 32: raised from 500 now that upkeep (per-tick drain), repairs and
// rebuilding after destruction all compete for the same starting purse.
export const STARTING_MONEY = 1800;
export const POPULATION_PER_HOUSE = 2;
/**
 * Phase 34: the one-shot 5-minute countdown is gone. A run is now DAY_COUNT
 * repetitions of a day/night cycle; GAME_DURATION_SECONDS is kept as the
 * derived total (3 x (150 + 150) = 900s = ~15 min at 1x) because threat
 * scaling and the score screen still want "how long is a whole run".
 */
export const DAY_PHASE_SECONDS = 150;
export const NIGHT_PHASE_SECONDS = 150;
export const DAY_COUNT = 3;
export const CYCLE_SECONDS = DAY_PHASE_SECONDS + NIGHT_PHASE_SECONDS;
export const GAME_DURATION_SECONDS = CYCLE_SECONDS * DAY_COUNT;
/**
 * Dusk/dawn are tweened rather than snapped so the transition reads as time
 * passing; NIGHT_OVERLAY_ALPHA is how dark full night gets (deliberately far
 * from opaque - the player still has to be able to play).
 */
export const DAY_NIGHT_TRANSITION_MS = 20000;
export const NIGHT_OVERLAY_ALPHA = 0.45;
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

// Phase 30: Wells must sit near open water and produce less the further away
// they are. WELL_MAX_WATER_DISTANCE_TILES is both the placement gate and the
// last band that still yields anything, so the two can never disagree.
export const WELL_MAX_WATER_DISTANCE_TILES = 3;
export const WELL_OUTPUT_BY_DISTANCE: readonly number[] = [1, 1, 0.75, 0.5];

// Phase 31: damage is permanent (no more free per-tick regen) - a damaged
// building is repaired by paying REPAIR_COST_FRACTION of its build cost,
// pro-rated by how much HP is missing.
export const REPAIR_COST_FRACTION = 0.5;

// Phase 31: refund fraction when the player bulldozes one of their own
// buildings. Destroyed-by-raiders buildings refund nothing.
export const DEMOLISH_REFUND_FRACTION = 0.5;

// Phase 31: raiders now hit defending units as well as buildings; a raider
// prefers any unit inside this radius over its building target.
export const RAIDER_UNIT_ATTACK_RANGE_TILES = 2;

// Phase 31: raid escalation. Threat (0..1) is blended from elapsed game time
// and town net worth; at full threat waves reach RAID_MAX_UNITS_ESCALATED,
// raiders carry RAID_MAX_HP_MULTIPLIER x their base HP, and the gap between
// waves shrinks to (1 - RAID_MAX_INTERVAL_SQUEEZE) of the normal roll.
export const THREAT_NET_WORTH_FULL = 6000;
export const RAID_MAX_UNITS_ESCALATED = 9;
export const RAID_MAX_HP_MULTIPLIER = 2;
export const RAID_MAX_INTERVAL_SQUEEZE = 0.5;
/** How long before a wave lands the incoming-raid countdown notice appears. */
export const RAID_WARNING_LEAD_MS = 10000;

// Phase 33: camera zoom bounds and per-wheel-notch step.
export const CAMERA_MIN_ZOOM = 0.5;
export const CAMERA_MAX_ZOOM = 2;
export const CAMERA_ZOOM_STEP = 0.1;

/** Phase 33: selectable game speeds; 0 is the paused state. */
export const GAME_SPEEDS: readonly number[] = [1, 2, 4];
