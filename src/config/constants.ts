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
// Phase 53: Rally Points & Training Queue. Training is no longer instant -
// trainCowboy enqueues a job that counts down this many production ticks
// (gameState.runTrainingQueues) before the unit actually spawns.
export const COWBOY_TRAIN_TICKS = 4;
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

/**
 * Phase 34: raid grace period. Raids used to be able to land ~41s into a run
 * (getThreatLevel already reads ~0.15 from the starting purse alone), before
 * the player had a Barracks, let alone a cowboy in it. Two gates now apply,
 * combined: nothing may spawn before RAID_EARLIEST_ELAPSED_MS of run time has
 * passed, AND raids only ever spawn at night. The earliest possible raid is
 * therefore the first nightfall at/after the 5:00 mark - i.e. night of day 2.
 */
export const RAID_EARLIEST_ELAPSED_MS = 300000;

// Phase 28: Horsery & Cowboy on Horse. Mirrors Phase 22's Barracks/Cowboy
// cost/cap/HP constants above rather than sharing them - the two units differ
// in cost, cap, HP and speed, so keeping separate named constants keeps each
// building's numbers independently readable/tunable.
export const MOUNTED_COWBOY_TRAIN_COST = 90;
export const MOUNTED_COWBOY_MAX_PER_HORSERY = 2;
export const MOUNTED_COWBOY_MAX_HP = 40;
// 3x MainScene's COWBOY_WALK_SPEED_PX_PER_SEC (60px/sec), reflecting the horse's speed advantage.
export const MOUNTED_COWBOY_WALK_SPEED_PX_PER_SEC = 180;
// Phase 53: mirrors COWBOY_TRAIN_TICKS above; longer, since a mounted Cowboy
// costs more than double a plain one.
export const MOUNTED_COWBOY_TRAIN_TICKS = 6;

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

/**
 * Phase 41: WASD/arrow-key camera panning. Screen-px/sec, applied the same
 * unscaled way setupCameraDrag already applies a right-drag's raw pointer
 * delta to scrollX/scrollY (no zoom adjustment) - keeping keyboard pan
 * consistent with the existing drag-pan feel rather than introducing a
 * second, zoom-aware convention. 480px/s covers the 960x640 viewport
 * left-to-right in two seconds, which read as brisk but controllable on the
 * 40x30 tile map in testing.
 */
export const CAMERA_KEYBOARD_PAN_SPEED_PX_PER_SEC = 480;

/** Phase 33: selectable game speeds; 0 is the paused state. */
export const GAME_SPEEDS: readonly number[] = [1, 2, 4];

/**
 * Phase 34: manual vegetation clearing with the bulldozer. Before this, the
 * only thing that ever removed a tree/cactus was a harvester draining it, so
 * a tile blocked by vegetation the player had no harvester for was a dead
 * end. Clearing costs cash and hands back a little of the felled material.
 */
export const VEGETATION_CLEAR_COST = 8;
export const VEGETATION_CLEAR_TREE_LOGS = 2;
export const VEGETATION_CLEAR_CACTUS_JUICE = 1;

/**
 * Phase 38: Watchtower auto-fire. A stationary counterpart to a manually
 * positioned Cowboy - longer reach (a tower sees further than a man on the
 * ground) but weaker per-shot damage than COWBOY_DAMAGE, so it's a
 * force-multiplier alongside garrisoned units rather than a replacement.
 */
export const WATCHTOWER_RANGE_TILES = 6;
export const WATCHTOWER_DAMAGE = 6;

/**
 * Phase 39: Endless Mode & Difficulty Select. Difficulty is a small runtime
 * multiplier bundle rather than mutated base constants - everything above
 * this line stays the Normal baseline, and gameState reads whichever
 * DifficultySettings the pre-game picker chose (resetGame/runUpkeep/
 * getThreatLevel), so Normal + Fixed reproduces the pre-Phase-39 numbers
 * exactly.
 */
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface DifficultySettings {
  startingMoneyMultiplier: number;
  upkeepMultiplier: number;
  /** Multiplies how fast getThreatLevel's time-based component ramps toward 1. */
  raidEscalationMultiplier: number;
}

export const DIFFICULTY_SETTINGS: Record<Difficulty, DifficultySettings> = {
  easy: { startingMoneyMultiplier: 1.5, upkeepMultiplier: 0.75, raidEscalationMultiplier: 0.7 },
  normal: { startingMoneyMultiplier: 1, upkeepMultiplier: 1, raidEscalationMultiplier: 1 },
  hard: { startingMoneyMultiplier: 0.65, upkeepMultiplier: 1.3, raidEscalationMultiplier: 1.4 },
};

/** Fixed keeps the original DAY_COUNT-cycle buzzer; Endless repeats the day/night cycle forever, ending only via the 'destroyed' reason. */
export type RunMode = 'fixed' | 'endless';

/**
 * Endless mode has no total-run length for getThreatLevel's time component to
 * divide elapsed seconds against, so instead it saturates asymptotically
 * against *completed day/night cycles*: fraction = cycles / (cycles + this),
 * which crosses 0.5 at ENDLESS_THREAT_RAMP_CYCLES elapsed cycles (scaled by
 * the difficulty's raidEscalationMultiplier) and keeps creeping toward 1
 * forever after, rather than hitting the old GAME_DURATION_SECONDS ceiling
 * once and going flat for the remainder of a potentially unbounded run.
 */
export const ENDLESS_THREAT_RAMP_CYCLES = DAY_COUNT;

/**
 * Phase 44: how many consecutive ticks a staffed, enabled, input-driven
 * building must sit blocked on a missing input before the notification log
 * reports it as "stalled". Debounced rather than firing on the very first
 * blocked tick, since a one-tick input hiccup (another building draining the
 * pool the instant before this one runs) is normal and not worth a log entry.
 */
export const PRODUCTION_STALL_NOTIFY_TICKS = 3;

/** Phase 44: notification log retention - oldest entries drop once the log exceeds this many. */
export const MAX_NOTIFICATION_LOG_ENTRIES = 50;

/**
 * Phase 46: Population Needs & House Tiers. How many consecutive production
 * ticks a House's current tier's needs must sit fully met (to upgrade) or
 * fully unmet (to downgrade) before the tier actually changes. Debounced the
 * same way Phase 44's stall notification is (PRODUCTION_STALL_NOTIFY_TICKS)
 * so a House doesn't flip tiers on a single borderline tick where another
 * building happened to drain the pool a moment earlier.
 */
export const HOUSE_TIER_HYSTERESIS_TICKS = 5;

/**
 * Phase 50: Stone/Iron -> Blacksmith Tools Chain. Quarry and Iron Mine both
 * need to sit on or near Gravel, mirroring WELL_MAX_WATER_DISTANCE_TILES's
 * hard placement gate exactly (same distanceToNearestTileType search in
 * mapConfig.ts, just a different TileType) - but unlike a Well's yield, their
 * output doesn't fall off with distance, so there's no WELL_OUTPUT_BY_DISTANCE
 * equivalent here.
 */
export const GRAVEL_MAX_DISTANCE_TILES = 2;

/**
 * Phase 51: Trading Post & Fluctuating Prices. Every marketable resource
 * (state/market.ts) carries a slowly-drifting `baselinePrice` around its
 * BASE_MARKET_PRICES peg, plus a temporary supply-side "pressure" penalty
 * that grows with recent sold volume and decays back out. MARKET_DRIFT_
 * MAX_FRACTION is the per-tick random-walk step (as a fraction of the
 * baseline itself, not the original peg); FLOOR/CEIL_FRACTION clamp the
 * baseline against the peg so a long run of bad luck can't drift a price to
 * zero or to the moon.
 */
export const MARKET_DRIFT_MAX_FRACTION = 0.02;
export const MARKET_PRICE_FLOOR_FRACTION = 0.5;
export const MARKET_PRICE_CEIL_FRACTION = 1.5;
/** Rolling window (in production ticks) of recent sold volume feeding the supply-pressure penalty - same rolling-window shape as Phase 49's productivity tracking. */
export const MARKET_PRESSURE_WINDOW_TICKS = 10;
/** Price cut (as a fraction) per unit of a resource sold within the pressure window; summed across the window and capped at MARKET_MAX_PRESSURE_FRACTION. */
export const MARKET_PRESSURE_PER_UNIT = 0.015;
export const MARKET_MAX_PRESSURE_FRACTION = 0.6;
/** Absolute floor (as a fraction of BASE_MARKET_PRICES) the final price can never drop below, even under max pressure plus a low baseline. */
export const MARKET_ABSOLUTE_FLOOR_FRACTION = 0.2;

/** Trading Post: sensible starting values for a freshly-toggled-on order row, before the player tunes it. */
export const TRADING_POST_DEFAULT_THRESHOLD = 10;
export const TRADING_POST_DEFAULT_AMOUNT = 4;

/**
 * Phase 51: Traveling Merchant. Self-rescheduling timer in MainScene,
 * following the exact scheduleNextRaidCheck pattern - a random delay is
 * picked, the deal fires, and the next delay is rolled immediately after.
 */
export const MERCHANT_MIN_INTERVAL_MS = 90000;
export const MERCHANT_MAX_INTERVAL_MS = 180000;
export const MERCHANT_DEAL_MIN_SECONDS = 30;
export const MERCHANT_DEAL_MAX_SECONDS = 60;
export const MERCHANT_MULTIPLIER_MIN = 1.5;
export const MERCHANT_MULTIPLIER_MAX = 2;

/**
 * Phase 54: Irrigation & Crop Water Needs. A water-dependent crop
 * (PotatoField) is never hard-gated on water at placement - unlike a Well, it
 * CAN be built far from water - but its flat production output falls off
 * with distance using the same distance-band shape as WELL_OUTPUT_BY_DISTANCE,
 * just over a longer range and reaching 0 rather than bottoming out, since a
 * bone-dry field really should yield nothing. WATER_DEPENDENT_CROP_MAX_
 * DISTANCE_TILES both bounds the distanceToNearestWater search and is the
 * last index CROP_OUTPUT_BY_DISTANCE holds a non-zero value for; a null
 * distance from getCropWaterDistance (nothing in range even with Water Tower
 * assist, see below) means 0 output, mirroring wellOutputMultiplier's
 * null-means-0 handling exactly.
 */
export const WATER_DEPENDENT_CROP_MAX_DISTANCE_TILES = 6;
export const CROP_OUTPUT_BY_DISTANCE: readonly number[] = [1, 1, 0.85, 0.7, 0.55, 0.4, 0.25];

/**
 * Phase 54: Water Tower. A staffed relay building, hard-gated on its own
 * placement exactly like a Well (must be within WELL_MAX_WATER_DISTANCE_TILES
 * of open water - it relays an existing source rather than conjuring one).
 * Once staffed and enabled, it extends irrigation out to
 * WATER_TOWER_IRRIGATION_RADIUS_TILES around itself: any water-dependent crop
 * within that radius has its effective water distance recomputed as
 * `min(actualDistanceToWater, distanceToTower + WATER_TOWER_ASSIST_OFFSET_TILES)`
 * (see getCropWaterDistance in gameState.ts) - i.e. the tower stands in for a
 * water source exactly WATER_TOWER_ASSIST_OFFSET_TILES tiles further away
 * than the tower itself, so a field built right next to the tower reads as
 * almost-at-the-water-line regardless of how far the real water actually is.
 */
export const WATER_TOWER_IRRIGATION_RADIUS_TILES = 6;
export const WATER_TOWER_ASSIST_OFFSET_TILES = 1;
