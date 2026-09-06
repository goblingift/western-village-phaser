import Phaser from 'phaser';
import {
  CAMERA_KEYBOARD_PAN_SPEED_PX_PER_SEC,
  CAMERA_MAX_ZOOM,
  CAMERA_MIN_ZOOM,
  CAMERA_ZOOM_STEP,
  CATTLE_DISEASE_DURATION_MAX_SECONDS,
  CATTLE_DISEASE_DURATION_MIN_SECONDS,
  COWBOY_DAMAGE,
  COWBOY_MAX_HP,
  COWBOY_RANGE_TILES,
  DAY_PHASE_SECONDS,
  DROUGHT_DURATION_MAX_SECONDS,
  DROUGHT_DURATION_MIN_SECONDS,
  DUST_STORM_DURATION_MAX_SECONDS,
  DUST_STORM_DURATION_MIN_SECONDS,
  GOLD_RUSH_DURATION_MAX_SECONDS,
  GOLD_RUSH_DURATION_MIN_SECONDS,
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  MERCHANT_DEAL_MAX_SECONDS,
  MERCHANT_DEAL_MIN_SECONDS,
  MERCHANT_MAX_INTERVAL_MS,
  MERCHANT_MIN_INTERVAL_MS,
  MERCHANT_MULTIPLIER_MAX,
  MERCHANT_MULTIPLIER_MIN,
  MINIMAP_HEIGHT,
  MINIMAP_MARGIN,
  MINIMAP_WIDTH,
  MOUNTED_COWBOY_MAX_HP,
  MOUNTED_COWBOY_WALK_SPEED_PX_PER_SEC,
  POPULATION_PER_HOUSE,
  PRODUCTION_TICK_MS,
  RAIDER_CAMP_ATTACK_HIT_RADIUS_PX,
  RAIDER_CAMP_LOOT_MONEY,
  RAIDER_CAMP_LOOT_TOOLS,
  RAIDER_CAMP_MAX_COUNT,
  RAIDER_CAMP_MAX_HP,
  RAIDER_CAMP_MIN_COUNT,
  RAIDER_CAMP_SPAWN_DAY,
  RAID_MAX_HP_MULTIPLIER,
  RAID_MAX_INTERVAL_MS,
  RAID_MAX_INTERVAL_SQUEEZE,
  RAID_EARLIEST_ELAPSED_MS,
  RAID_MAX_UNITS_ESCALATED,
  RAID_MIN_INTERVAL_MS,
  RAID_MIN_UNITS,
  RAID_WARNING_LEAD_MS,
  RAID_WAVE_TIMEOUT_MS,
  RAIDER_UNIT_ATTACK_RANGE_TILES,
  TILE_SIZE,
  VEGETATION_CLEAR_COST,
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
  WATCHTOWER_DAMAGE,
  WATCHTOWER_RANGE_TILES,
  WORLD_EVENT_BANNER_DURATION_MS,
  WORLD_EVENT_MAX_INTERVAL_MS,
  WORLD_EVENT_MIN_INTERVAL_MS,
} from '../config/constants';
import { TILE_COLORS, TileType, getWorldTiles } from '../config/mapConfig';
import { getResourceChainBuildingTypes } from '../config/resourceGraph';
import {
  VEGETATION_ATLAS_KEY,
  VEGETATION_DEFINITIONS,
  vegetationTextureKey,
} from '../config/vegetationConfig';
import {
  VegetationEntity,
  countVegetationInRadius,
  getVegetation,
  getVegetationAtTile,
} from '../state/vegetation';
import { NightOverlay } from '../ui/NightOverlay';
import { ResourceHudPanel } from '../ui/ResourceHudPanel';
import { TILESET_KEY } from './BootScene';
import {
  ACCENTS_ATLAS_KEY,
  AccentKind,
  ANIMALS_ATLAS_KEY,
  ANIMAL_SPRITE_SIZE,
  BUILDING_ATLAS_KEY,
  BUILDING_DEFINITIONS,
  BuildingCategory,
  BuildingType,
  COWBOYS_ATLAS_KEY,
  COWBOY_SPRITE_SIZE,
  COWBOY_TEXTURE_KEY,
  MARKETABLE_RESOURCE_KEYS,
  MOUNTED_COWBOYS_ATLAS_KEY,
  MOUNTED_COWBOY_SPRITE_HEIGHT,
  MOUNTED_COWBOY_SPRITE_WIDTH,
  MOUNTED_COWBOY_TEXTURE_KEY,
  PlacedBuilding,
  RAIDERS_ATLAS_KEY,
  RAIDER_CAMPS_ATLAS_KEY,
  RAIDER_CAMP_SPRITE_SIZE,
  RAIDER_DEFINITIONS,
  RESOURCE_LABELS,
  RaiderDefinition,
  RaiderFaction,
  ResourceKey,
  VILLAGERS_ATLAS_KEY,
  VILLAGER_TEXTURE_KEY,
  accentTextureKey,
  animalTextureKey,
  buildingTextureKey,
  formatResourceMap,
  getWorkersRequired,
  isLinePlacementBuilding,
  raiderCampTextureKey,
  raiderTextureKey,
} from '../config/buildingConfig';
import {
  installAudioUnlock,
  playPlacementSound,
  playUiSound,
  playWorldSound,
  setAudioGameSpeed,
  setAudioListenerRect,
} from '../audio/sound';
import { BuildingRemovedPayload, HouseTierChangePayload, gameEvents } from '../state/gameEvents';
import { addNotification } from '../state/notifications';
import { startMerchantDeal } from '../state/market';
import { AUTOSAVE_SLOT, saveToSlot } from '../state/persistence';
import {
  RaiderCamp,
  damageRaiderCamp,
  getRaiderCampById,
  getRaiderCamps,
  removeRaiderCamp,
  spawnRaiderCamp,
} from '../state/raiderCamps';
import {
  DurationWorldEventType,
  WORLD_EVENT_LABELS,
  getActiveWorldEvent,
  pickRandomWorldEventType,
  startWorldEvent,
} from '../state/worldEvents';
import {
  DayPhase,
  DayPhaseChange,
  applyWanderingSettlersReward,
  clearVegetationAt,
  computeNetWorth,
  damageUnit,
  demolishBuilding,
  destroyBuilding,
  getBuildingAtTile,
  getBuildingById,
  getDayNumber,
  getDayPhase,
  getElapsedSeconds,
  getFenceLinks,
  getHarvestCenterTile,
  getPhaseAtElapsed,
  getPlacedBuildings,
  getPlacementRejection,
  getPlacementWarning,
  getThreatLevel,
  grantRaiderCampLoot,
  isGameOver,
  placeBuilding,
  runProductionTick,
  setRallyPoint,
  tickTimer,
} from '../state/gameState';
import { DustStormOverlay } from '../ui/DustStormOverlay';

const FENCE_LINE_COLOR = 0x8d6748;
/** Phase 48: chain-view map overlay outline color - gold, distinct from the green connection outline and the red/blue minimap combat dots. */
const CHAIN_VIEW_HIGHLIGHT_COLOR = 0xffd54f;

/**
 * Phase 31: Phase 29's bank-balance-only raid hook is generalized into
 * gameState.getThreatLevel() (elapsed time + net worth, which already
 * includes banked cash). Above this threat level raids lean Outlaw, exactly
 * as a full bank used to.
 */
const OUTLAW_BIAS_THREAT = 0.35;

/**
 * Phase 55: Random World Events. Per-type duration range (seconds) and
 * flavor text, kept in MainScene alongside the raid/merchant announcement
 * strings rather than in state/worldEvents.ts - that module's own doc comment
 * explains it deliberately stays free of scene-facing copy/UI concerns,
 * mirroring how RAIDER_DEFINITIONS' labels vs. showRaidNotice's phrasing are
 * split today.
 */
const WORLD_EVENT_DURATION_RANGE_SECONDS: Record<DurationWorldEventType, readonly [number, number]> = {
  drought: [DROUGHT_DURATION_MIN_SECONDS, DROUGHT_DURATION_MAX_SECONDS],
  goldRush: [GOLD_RUSH_DURATION_MIN_SECONDS, GOLD_RUSH_DURATION_MAX_SECONDS],
  cattleDisease: [CATTLE_DISEASE_DURATION_MIN_SECONDS, CATTLE_DISEASE_DURATION_MAX_SECONDS],
  dustStorm: [DUST_STORM_DURATION_MIN_SECONDS, DUST_STORM_DURATION_MAX_SECONDS],
};

const WORLD_EVENT_DESCRIPTIONS: Record<DurationWorldEventType, string> = {
  drought: 'Wells run low.',
  goldRush: 'Sell prices are spiking.',
  cattleDisease: 'Livestock output is down.',
  dustStorm: 'Production is dampened and visibility is poor.',
};

const WORLD_EVENT_NOTIFICATION_KIND: Record<DurationWorldEventType, 'warning' | 'info'> = {
  drought: 'warning',
  goldRush: 'info',
  cattleDisease: 'warning',
  dustStorm: 'warning',
};

/** Phase 30: trees/cacti render above the ground layer but below buildings (depth 10). */
const VEGETATION_DEPTH = 5;
const MINIMAP_VEGETATION_DOT_SIZE = 2;

/** Phase 31: destruction animation - shake, fade, and a burst of dust motes. */
const DESTRUCTION_SHAKE_PX = 4;
const DESTRUCTION_SHAKE_MS = 60;
const DESTRUCTION_SHAKE_REPEATS = 5;
const DESTRUCTION_FADE_MS = 450;
const DUST_PUFF_COUNT = 10;
const DUST_PUFF_RADIUS_MIN = 2;
const DUST_PUFF_RADIUS_MAX = 5;
const DUST_PUFF_COLOR = 0xbfa980;
const DUST_PUFF_SPREAD_PX = 26;
const DUST_PUFF_DURATION_MIN_MS = 400;
const DUST_PUFF_DURATION_MAX_MS = 800;
const DUST_DEPTH = 14;

/** Phase 33: placement rejection reason, shown just under the preview footprint. */
const PLACEMENT_HINT_DEPTH = 1000;

const VALID_TINT = 0x00ff00;
const INVALID_TINT = 0xff0000;
const CLICK_MOVE_THRESHOLD = 6;
const MINIMAP_BORDER_COLOR = 0xffffff;
const MINIMAP_VIEWPORT_COLOR = 0xffee58;
const MINIMAP_VIEWPORT_THROTTLE_MS = 50;
const MINIMAP_BUILDING_DOT_SIZE = 3;

/**
 * Phase 45: minimap combat awareness. Live unit/raider dots and building
 * damage-flash/off-screen pings are redrawn on their own Graphics object
 * (minimapCombatGraphics) at the exact same throttle interval the viewport
 * rectangle already uses (MINIMAP_VIEWPORT_THROTTLE_MS), but driven from
 * update() every frame rather than only on camera-move/pointer events -
 * units and raiders drift continuously even while the camera sits still.
 */
const MINIMAP_UNIT_DOT_SIZE = 3;
const MINIMAP_UNIT_COLOR = 0x2979ff;
const MINIMAP_RAIDER_DOT_SIZE = 3;
const MINIMAP_RAIDER_COLOR = 0xff1744;
/**
 * Phase 57: Raider Camps get their own distinct minimap marker color/size -
 * bigger than a unit dot and drawn on the always-on minimapGraphics (not the
 * throttled minimapCombatGraphics units/raiders share), since a camp is a
 * permanent map feature the player should be able to plan around at any
 * time, not just during an active wave.
 */
const MINIMAP_CAMP_DOT_SIZE = 5;
const MINIMAP_CAMP_COLOR = 0x9c27b0;
/** How long a hit building's minimap dot alternates size/color after taking damage. */
const MINIMAP_FLASH_DURATION_MS = 1600;
/** Blink half-period - the flash dot toggles size every this-many ms. */
const MINIMAP_FLASH_BLINK_MS = 200;
const MINIMAP_FLASH_COLOR = 0xffffff;
const MINIMAP_FLASH_DOT_SIZE = MINIMAP_BUILDING_DOT_SIZE + 3;
/** Off-screen attack ping: how long after the last hit it keeps fading before disappearing. */
const OFFSCREEN_PING_FADE_MS = 3000;
const OFFSCREEN_PING_PULSE_MS = 500;
const OFFSCREEN_PING_COLOR = 0xff6d00;
const OFFSCREEN_PING_RADIUS = 4;
/** Keeps the ping's edge-clamped point from ever touching the minimap's own border stroke. */
const OFFSCREEN_PING_EDGE_INSET = 5;
const ANIMAL_SPRITE_DEPTH = 11;
const ANIMAL_SLOT_GAP = 2;
const ANIMAL_SLOT_STEP = ANIMAL_SPRITE_SIZE + ANIMAL_SLOT_GAP;
const ANIMAL_WANDER_RADIUS_MIN = 10;
const ANIMAL_WANDER_RADIUS_MAX = 12;
const ANIMAL_WANDER_BOB_PX = 4;
const ANIMAL_WANDER_DURATION_MIN_MS = 900;
const ANIMAL_WANDER_DURATION_MAX_MS = 1600;
const ANIMAL_WANDER_DELAY_MAX_MS = 1000;

/** Garrisoned Cowboys (Phase 22) share the animal sprites' depth/layer - both are static ground props next to a building. */
const COWBOY_SPRITE_DEPTH = ANIMAL_SPRITE_DEPTH;
const COWBOY_SLOT_GAP = 2;
const COWBOY_SLOT_STEP = COWBOY_SPRITE_SIZE + COWBOY_SLOT_GAP;

/**
 * Phase 28: Cowboy-on-Horse shares the Cowboy's static-prop depth band but
 * needs its own slot-step pair (not COWBOY_SLOT_STEP) since its sprite frame
 * is wider/shorter than the square COWBOY_SPRITE_SIZE - separate X/Y steps
 * (rather than one square step) keep the spawn-slot grid from overlapping.
 */
const MOUNTED_COWBOY_SPRITE_DEPTH = COWBOY_SPRITE_DEPTH;
const MOUNTED_COWBOY_SLOT_GAP = 2;
const MOUNTED_COWBOY_SLOT_STEP_X = MOUNTED_COWBOY_SPRITE_WIDTH + MOUNTED_COWBOY_SLOT_GAP;
const MOUNTED_COWBOY_SLOT_STEP_Y = MOUNTED_COWBOY_SPRITE_HEIGHT + MOUNTED_COWBOY_SLOT_GAP;

/** Idle-animation accents (Phase 19): layered just above a building's own image (depth 10) and below animal sprites (depth 11). */
const ACCENT_DEPTH = 10.5;

const WELL_CRANK_ANGLE_DEG = 15;
const WELL_CRANK_TWEEN_MS = 1000;

const WAREHOUSE_DOOR_SWING_ANGLE_DEG = 8;
const WAREHOUSE_DOOR_TWEEN_MS = 1800;

const SUPERMARKET_AWNING_SCALE_X_MIN = 0.95;
const SUPERMARKET_AWNING_SCALE_X_MAX = 1.05;
const SUPERMARKET_AWNING_TWEEN_MS = 1800;

const CHICKEN_DOOR_SCALE_Y_CLOSED = 0.3;
const CHICKEN_DOOR_DURATION_MIN_MS = 600;
const CHICKEN_DOOR_DURATION_MAX_MS = 900;
const CHICKEN_DOOR_REPEAT_DELAY_MIN_MS = 200;
const CHICKEN_DOOR_REPEAT_DELAY_MAX_MS = 900;

const HOUSE_SMOKE_PUFF_COUNT = 3;
const HOUSE_SMOKE_PUFF_RADIUS = 3;
const HOUSE_SMOKE_COLOR = 0xf5f5f5;
const HOUSE_SMOKE_START_ALPHA = 0.6;
const HOUSE_SMOKE_RISE_PX = 14;
const HOUSE_SMOKE_DURATION_MIN_MS = 1200;
const HOUSE_SMOKE_DURATION_MAX_MS = 1800;
const HOUSE_SMOKE_STAGGER_MS = 500;

/** Above buildings (10), accents (10.5) and animals (11); below the HUD (1000). */
const VILLAGER_SPRITE_DEPTH = 12;
/** Above villagers (12); HP bars sit topmost of the per-building layers so damage is always visible. */
const HP_BAR_DEPTH = 13;
const HP_BAR_HEIGHT = 4;
const HP_BAR_MARGIN_ABOVE_BUILDING = 3;
const HP_BAR_BG_COLOR = 0x2b1d12;
const HP_BAR_FILL_COLOR = 0x4caf50;
const HP_BAR_EMPTY_COLOR = 0xd32f2f;
/**
 * Phase 40: unit HP bars (Cowboy/Cowboy-on-Horse/Raider) share the exact
 * fill/background palette and depth as building HP bars above, but get their
 * own smaller width/height and a separate shared Graphics object
 * (unitHpBarGraphics) - a 12-16px unit sprite can't fit a building-width bar,
 * and keeping the two loops (buildingVisuals vs cowboyUnits+raiders) apart is
 * simpler than branching one draw call on "what kind of thing is this".
 */
const UNIT_HP_BAR_WIDTH = 14;
const UNIT_HP_BAR_HEIGHT = 3;
const UNIT_HP_BAR_MARGIN_ABOVE_PX = 2;
/** Half-height of every small-unit sprite class (animals/villagers/Cowboys/mounted Cowboys/raiders all sit in the 12px-tall band, see ANIMAL_SPRITE_SIZE), used to lift the bar clear of the sprite regardless of unit kind. */
const UNIT_SPRITE_HALF_HEIGHT_PX = 6;
/** Display-only cap (Phase 20): rendered sprite count, unrelated to gameState's population/workforce numbers. */
const VILLAGER_CAP = 30;
const VILLAGER_WALK_SPEED_PX_PER_SEC = 50;
const VILLAGER_PAUSE_MIN_MS = 500;
const VILLAGER_PAUSE_MAX_MS = 2000;

/**
 * Phase 23 raiders share the villager/animal/cowboy small-unit depth band -
 * just above buildings and accents, below the HP bars that must always read
 * on top of everything they're reporting on.
 */
const RAIDER_SPRITE_DEPTH = 12;
/**
 * Phase 57: Raider Camps are static map structures, not roaming units, so
 * they render at the same depth band as buildings (10) rather than the
 * small-unit band (12) - the same z-order convention a real building would
 * use, just without ever entering buildingVisuals/gameState's PlacedBuilding
 * list.
 */
const RAIDER_CAMP_SPRITE_DEPTH = 10;
const RAIDER_CAMP_SPRITE_HALF_HEIGHT_PX = RAIDER_CAMP_SPRITE_SIZE / 2;
const COWBOY_SHOT_DEPTH = 13.5;
const COWBOY_SHOT_COLOR = 0xffee58;
const COWBOY_SHOT_FADE_MS = 200;

/** Phase 24: Cowboys are player-directed units, so their selection/movement constants live near the combat ones above. */
const COWBOY_WALK_SPEED_PX_PER_SEC = 60;
const COWBOY_SELECT_HIT_RADIUS_PX = 10;
/** Phase 40: same hit-test radius as unit selection, used to tell "right-clicked a raider" (attack order) from "right-clicked empty ground" (plain move order). */
const RAIDER_ATTACK_HIT_RADIUS_PX = 10;
const COWBOY_SELECTION_RING_RADIUS_PX = 10;
const COWBOY_SELECTION_RING_COLOR = 0x42a5f5;
const COWBOY_SELECTION_RING_DEPTH = 13.6;
/** Phase 25: per-unit random offset applied to a multi-unit move order's target point so units don't all walk to the exact same pixel and stack. */
const UNIT_MOVE_ORDER_JITTER_PX = 12;
/** Phase 25: drag-rectangle multi-select box; reuses the selection ring's blue so both read as "the same selection concept". */
const SELECTION_RECT_COLOR = 0x42a5f5;
const SELECTION_RECT_FILL_ALPHA = 0.15;
const SELECTION_RECT_DEPTH = 13.4;

/**
 * Phase 41: hotkeys, WASD camera & control groups.
 * - UNIT_DOUBLE_CLICK_MS: second click-select on the SAME unit within this
 *   window selects every living unit of that unit's kind, mirroring the
 *   dragDistance <= CLICK_MOVE_THRESHOLD click-vs-drag test already used to
 *   reach selectUnitAt in the first place.
 * - CONTROL_GROUP_DOUBLE_TAP_MS: second bare-number-key recall of the SAME
 *   group within this window recenters the camera on it instead of just
 *   re-selecting it again.
 */
const UNIT_DOUBLE_CLICK_MS = 300;
const CONTROL_GROUP_DOUBLE_TAP_MS = 400;

/**
 * Phase 34: the harvest radius ring. A Forestry/Cactus Milker's 5-tile reach
 * is 160px - a sixth of the viewport at zoom 1 - and was previously completely
 * invisible, so "will this building reach those trees" was pure guesswork.
 * Drawn under the buildings (depth 6, just above vegetation at 5) so it reads
 * as a footprint marking on the ground rather than an overlay.
 */
const HARVEST_RING_DEPTH = 6;
const HARVEST_RING_COLOR = 0x8bc34a;
const HARVEST_RING_EMPTY_COLOR = 0xef5350;
const HARVEST_RING_FILL_ALPHA = 0.08;

/**
 * Phase 53: Rally Points & Training Queue. A rally point is drawn as a tiny
 * flag-on-a-pole (a Graphics primitive, not a texture - same
 * minimal-footprint style as the harvest ring above) at depth just above the
 * ground/vegetation but below buildings, since it marks a point ON the map
 * rather than something units interact with directly.
 */
const RALLY_POINT_DEPTH = 6.5;
const RALLY_POINT_POLE_COLOR = 0x5d4037;
const RALLY_POINT_FLAG_COLOR = 0xff7043;
const RALLY_POINT_POLE_HEIGHT_PX = 16;
const RALLY_POINT_FLAG_WIDTH_PX = 10;
const RALLY_POINT_FLAG_HEIGHT_PX = 7;

/**
 * Phase 34: understaffed / upkeep-unpaid badges. These sit at the HP bar's
 * depth band (they answer the same question - "why isn't this building
 * working") but slightly above it so a damaged AND understaffed building shows
 * both without the badge hiding behind the bar.
 */
const STATUS_BADGE_DEPTH = 13.2;
const STATUS_BADGE_SIZE = 8;
const STATUS_BADGE_UNSTAFFED_COLOR = 0xffca28;
const STATUS_BADGE_UNPAID_COLOR = 0xef5350;
const STATUS_BADGE_OUTLINE_COLOR = 0x2b1d12;

/**
 * Phase 34 night polish. The window light and campfire are created once with
 * the rest of a building's accents and simply faded in/out with the cycle, so
 * nothing is created or destroyed at a phase boundary.
 */
const NIGHT_ACCENT_FADE_MS = 4000;
const NIGHT_ACCENT_MAX_ALPHA = 0.95;
const CAMPFIRE_FLICKER_MS = 420;
/** Cool blue-grey multiply tint applied to tree/cactus sprites at night; daytime is untinted. */
const VEGETATION_NIGHT_TINT = 0x6f86b8;

/**
 * Phase 34 combat audio. Above this many cowboys firing in one combat tick,
 * a single "volley" voice is played instead of N gunshots - see
 * playCombatVolley.
 */
const VOLLEY_SHOT_THRESHOLD = 4;
const GUNSHOT_MAX_STAGGER_MS = 150;
/** Footstep ticks are only emitted for selected units, and no more often than this globally. */
const FOOTSTEP_INTERVAL_MS = 320;
/** Per-animal ambient call scheduling; each animal picks a fresh delay in this range every time. */
const ANIMAL_SOUND_MIN_DELAY_MS = 6000;
const ANIMAL_SOUND_MAX_DELAY_MS = 16000;

interface BuildingVisual {
  building: PlacedBuilding;
  image: Phaser.GameObjects.Image;
  animalImages: Phaser.GameObjects.Image[];
  accentObjects: Phaser.GameObjects.GameObject[];
  /**
   * Phase 34: the subset of accentObjects that only show at night (House
   * window light, Barracks campfire). Tracked separately so the phase change
   * can fade exactly those without touching the always-on idle accents, while
   * cleanup still walks the single accentObjects list.
   */
  nightAccents: Phaser.GameObjects.Image[];
}

/**
 * Raiders are NOT tied to a BuildingVisual (unlike animals/cowboys, which are
 * always owned by exactly one building) - they're independent hostile units
 * that roam in from the map edge, so they get their own small scene-level
 * tracking array, mirroring Phase 20's villagers but with more per-unit state.
 * `targetBuildingId` is looked up through gameState.getBuildingById rather
 * than holding a PlacedBuilding reference directly, since a building's own hp
 * (the thing raiders actually damage) lives in gameState and must stay the
 * single source of truth.
 */
interface Raider {
  /** Phase 40: stable identity so a unit's attack order (CombatUnit.attackTarget) can survive this raider's hp changing/moving across ticks without holding a live object reference across the array's own churn. */
  id: string;
  image: Phaser.GameObjects.Image;
  faction: RaiderFaction;
  hp: number;
  /** Phase 40: RAIDER_DEFINITIONS.maxHp scaled by this wave's threat hpMultiplier at spawn time (see startRaid) - the HP bar needs the *scaled* cap, not the base table value, to read correctly on an escalated wave. */
  maxHp: number;
  targetBuildingId: string | null;
  /** True once this raider's walk-to-target tween has completed; only then does it attack instead of moving. */
  arrived: boolean;
}

/**
 * Phase 24: a Cowboy is now an independently-positioned, player-directed unit
 * rather than a position purely derived from its Barracks + slot index (Phase
 * 22). It still remembers which Barracks trained it and which cowboyHp slot
 * is "its" HP (gameState.ts stays the single source of truth for HP, same
 * pattern raiders use for building.hp), but its on-screen position is now its
 * own live image.x/y, which can drift away from that slot via a move order.
 * Tracked at scene level (mirroring Raider[] above) rather than inside
 * BuildingVisual, since a Cowboy is no longer owned by its Barracks' visual
 * once it can walk away from it.
 *
 * Named generically (Phase 25) rather than `CowboyUnit`: selection and
 * movement no longer assume a single unit kind, since Phase 28 adds a second
 * player-directed unit (Cowboy on Horse) that plugs into this same
 * selection/move system without needing its own parallel type.
 */
/**
 * Phase 28: the discriminant that lets a single CombatUnit type/tracking
 * array/selection system serve two unit kinds. Kept as a plain string union
 * plus one small lookup table (UNIT_KIND_CONFIG below) rather than a generic
 * "unit type registry" - only walk speed actually varies per kind in this
 * scene (combat range/damage are shared, per the phase spec), so that's all
 * the table carries.
 */
type UnitKind = 'cowboy' | 'cowboyOnHorse';

interface UnitKindConfig {
  walkSpeedPxPerSec: number;
}

const UNIT_KIND_CONFIG: Record<UnitKind, UnitKindConfig> = {
  cowboy: { walkSpeedPxPerSec: COWBOY_WALK_SPEED_PX_PER_SEC },
  cowboyOnHorse: { walkSpeedPxPerSec: MOUNTED_COWBOY_WALK_SPEED_PX_PER_SEC },
};

/** Phase 45: a snapshot of where/until a building's minimap dot should flash after taking raid damage, kept independent of the building still existing so a killing blow's flash can outlive removeDestroyedBuildings() deleting the record. */
interface MinimapBuildingFlash {
  tileX: number;
  tileY: number;
  until: number;
}

/** Phase 45: an off-screen building currently under attack, tracked so the minimap can point toward it until a few seconds pass without another hit. */
interface OffscreenThreat {
  worldX: number;
  worldY: number;
  lastHitAt: number;
}

/**
 * Phase 57: generalizes what used to be a bare `attackTargetRaiderId: string
 * | null` into a small discriminated ref so a standing attack order can name
 * either a Raider or a RaiderCamp by id - both are looked up fresh every tick
 * (through getAttackTargetPosition) rather than holding a live object
 * reference, exactly like the raider-only version did.
 */
interface AttackTargetRef {
  kind: 'raider' | 'camp';
  id: string;
}

interface CombatUnit {
  /** Phase 41: stable identity for control groups (Map<number, string[]>) and double-click-select-all, surviving this.cowboyUnits' own churn the same way Raider.id does. */
  id: string;
  image: Phaser.GameObjects.Image;
  barracksId: string;
  index: number;
  moveTween: Phaser.Tweens.Tween | null;
  kind: UnitKind;
  /**
   * Phase 40: an explicit attack order (issueUnitAttackOrder) on a specific
   * raider or (Phase 57) Raider Camp. While set, this unit's combat-tick
   * behavior (resolveUnitAttackOrders/resolveCowboyFire) locks onto that one
   * target - approaching into range and then focus-firing it every tick -
   * instead of the default "auto-fire at whichever raider is nearest" rule
   * (which never auto-targets a camp; only an explicit order does). Cleared
   * the moment the ordered target is no longer found alive (dead/destroyed,
   * or the wave ended) so the unit falls back to auto-targeting raiders on
   * its own, and also cleared by any new plain move order
   * (issueUnitMoveOrders), since that's an explicit new command superseding
   * the standing attack order.
   */
  attackTarget: AttackTargetRef | null;
}

export class MainScene extends Phaser.Scene {
  private infoText!: Phaser.GameObjects.Text;
  private resourceHud!: ResourceHudPanel;
  private timerText!: Phaser.GameObjects.Text;
  private placementHintText!: Phaser.GameObjects.Text;
  private vegetationImages = new Map<string, Phaser.GameObjects.Image>();
  private demolishMode = false;
  private gameSpeed = 1;
  private raidWarningTimer: Phaser.Time.TimerEvent | null = null;
  /** Tracked so a building that is destroyed/demolished while its info panel is open closes that panel. */
  private selectedBuildingId: string | null = null;
  private phaseRemainingDisplay = DAY_PHASE_SECONDS;
  private nightOverlay!: NightOverlay;
  private harvestRingGraphics!: Phaser.GameObjects.Graphics;
  /** Phase 53: shared Graphics redrawn from scratch over every building with a rallyPoint set, mirroring connectionGraphics'/fenceLineGraphics' one-Graphics-per-redraw discipline rather than a GameObject per flag. */
  private rallyPointGraphics!: Phaser.GameObjects.Graphics;
  /** Phase 53: non-null while a "Set Rally Point" button has armed the next qualifying right-click to set that building's rally point instead of issuing a unit move/attack order. */
  private rallyPointModeBuildingId: string | null = null;
  private rallyPointModeHintText!: Phaser.GameObjects.Text;
  private statusBadgeGraphics!: Phaser.GameObjects.Graphics;
  private lastFootstepAt = 0;
  private animalSoundTimer: Phaser.Time.TimerEvent | null = null;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private pointerDownX = 0;
  private pointerDownY = 0;
  private selectedType: BuildingType | null = null;
  private previewImage: Phaser.GameObjects.Image | null = null;
  /** Phase 43: pooled preview tiles for a drag-to-place line (Road/Fence), indexed by position along the line; grown on demand, never shrunk (extras past the current line length are just hidden). */
  private linePreviewImages: Phaser.GameObjects.Image[] = [];
  /** Phase 43: running cost tag ("6/8 Road - $60") shown near the drag's end tile while a line preview is active. */
  private lineCostText!: Phaser.GameObjects.Text;
  /** Phase 43: held to keep the placement tool active after a placement (single click or line) instead of exiting - see applyShiftRepeatPolicy. */
  private shiftKey: Phaser.Input.Keyboard.Key | null = null;
  /** Phase 43: previous pointermove's line-drag state, so hideLinePreview only runs on the drag-ended transition rather than every idle mousemove. */
  private lineDragWasActive = false;
  private buildingVisuals = new Map<string, BuildingVisual>();
  private villagers: Phaser.GameObjects.Image[] = [];
  private raiders: Raider[] = [];
  /** Phase 40: monotonically increasing so every Raider.id is unique for the life of the scene, even across waves/resets - a stray stale AttackTargetRef can then never accidentally match a later, unrelated raider. */
  private raiderIdCounter = 0;
  /** Phase 57: Raider Camps' sprites, keyed by RaiderCamp.id - the camps themselves (position/hp/faction) live in state/raiderCamps.ts, mirroring how building.hp lives in gameState while buildingVisuals only holds the Image. */
  private campVisuals = new Map<string, Phaser.GameObjects.Image>();
  /** Phase 57: true once this run has rolled its initial 1-3 Raider Camps (on the first dawn at/after RAIDER_CAMP_SPAWN_DAY, or restored from a loaded save) - guards spawnInitialRaiderCamps against firing more than once per run. */
  private initialCampsSpawned = false;
  private raidActive = false;
  private raidNoticeText!: Phaser.GameObjects.Text;
  private raidCheckTimer: Phaser.Time.TimerEvent | null = null;
  private raidWaveTimer: Phaser.Time.TimerEvent | null = null;
  /** Phase 51: Traveling Merchant - self-rescheduling timer mirroring raidCheckTimer, but with no wave/active-state to gate on. */
  private merchantCheckTimer: Phaser.Time.TimerEvent | null = null;
  /** Phase 55: Random World Events - self-rescheduling timer mirroring merchantCheckTimer. */
  private worldEventCheckTimer: Phaser.Time.TimerEvent | null = null;
  private worldEventNoticeText!: Phaser.GameObjects.Text;
  private worldEventNoticeHideTimer: Phaser.Time.TimerEvent | null = null;
  /**
   * Phase 52: which day number the autosave last fired for, so the
   * 'day-phase-changed' listener only saves once per genuine dawn rather than
   * on resetGame's own synthetic "Day 1, day" event (fired at elapsedSeconds
   * 0, which this is guarded against separately) or a repeat delivery of the
   * same boundary. Reset to -1 on 'game-reset' so a new run's real Day 1 dawn
   * isn't skipped for matching a previous run's already-saved day number.
   */
  private lastAutosaveDayNumber = -1;
  /** Phase 52: set by the 'game-loaded' handler, consumed by the very next 'day-phase-changed' (deserializeGameState re-emits one right after 'game-loaded' to refresh the HUD with the loaded phase) so a load never immediately re-triggers the autosave it may itself have just been restored from. */
  private suppressNextAutosaveCheck = false;
  private cowboyShotGraphics: Phaser.GameObjects.Graphics[] = [];
  private cowboyUnits: CombatUnit[] = [];
  /** Phase 41: monotonically increasing so every CombatUnit.id is unique for the life of the scene, mirroring raiderIdCounter. */
  private unitIdCounter = 0;
  private selectedUnits: CombatUnit[] = [];
  /** Phase 41: control groups (Ctrl+1..9 assign, bare 1..9 recall) keyed by group number, storing member CombatUnit.ids rather than live references so a dead-and-filtered-out unit is simply absent on the next recall's alive-check. */
  private controlGroups = new Map<number, string[]>();
  /** Phase 41: last this.time.now a bare-number-key recall of a given group fired, for the double-tap-to-recenter check. */
  private lastGroupRecallAt = new Map<number, number>();
  /** Phase 41: double-click-select-all-of-kind state - the id/time of the last unit click-select, independent of controlGroups. */
  private lastUnitClickId: string | null = null;
  private lastUnitClickAt = 0;
  private cameraKeys!: {
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private selectionRingGraphics!: Phaser.GameObjects.Graphics;
  private selectionRectGraphics!: Phaser.GameObjects.Graphics;
  private dragStartWorldX = 0;
  private dragStartWorldY = 0;
  private cowboySelectionHintText!: Phaser.GameObjects.Text;
  private connectionGraphics!: Phaser.GameObjects.Graphics;
  private fenceLineGraphics!: Phaser.GameObjects.Graphics;
  private hpBarGraphics!: Phaser.GameObjects.Graphics;
  /** Phase 40: separate shared Graphics object for Cowboy/Cowboy-on-Horse/Raider HP bars, mirroring hpBarGraphics' one-Graphics-per-tick-redraw discipline rather than a GameObject per unit. */
  private unitHpBarGraphics!: Phaser.GameObjects.Graphics;
  private lastInfoTileX: number | null = null;
  private lastInfoTileY: number | null = null;
  private tileData: TileType[][] = [];
  private minimapX = 0;
  private minimapY = 0;
  private minimapGraphics!: Phaser.GameObjects.Graphics;
  private minimapViewportGraphics!: Phaser.GameObjects.Graphics;
  private minimapPointerActive = false;
  private lastMinimapViewportRedraw = 0;
  /** Phase 45: live unit/raider dots + damage flashes/off-screen pings - separate from minimapGraphics since this one redraws continuously instead of only on placement events. */
  private minimapCombatGraphics!: Phaser.GameObjects.Graphics;
  private lastMinimapCombatRedraw = 0;
  private minimapBuildingFlashes = new Map<string, MinimapBuildingFlash>();
  private offscreenThreats = new Map<string, OffscreenThreat>();
  /** Phase 48: chain-view map overlay - which resource (if any) ResourceHudPanel currently has selected, and a single shared Graphics redrawn on selection/placement changes (same pattern as connectionGraphics). */
  private selectedResourceKey: ResourceKey | null = null;
  /** Phase 48: 'C' toggles the overlay's visibility without forgetting the selection, distinct from Escape/re-click which clears it outright. */
  private chainViewVisible = true;
  private chainViewGraphics!: Phaser.GameObjects.Graphics;

  constructor() {
    super('MainScene');
  }

  create(): void {
    this.buildTilemap();
    this.setupVegetationVisuals();
    this.setupCameraDrag();
    this.setupCameraZoom();
    this.setupKeyboardCamera();
    this.setupInfoText();
    this.setupResourceHud();
    this.setupTimerHud();
    this.setupSpeedControl();
    this.setupMinimap();
    this.setupBuildingPlacement();
    this.setupDemolishMode();
    this.setupBuildingRemoval();
    this.setupBuildingSelection();
    this.setupProductionTimer();
    this.setupConnectionVisuals();
    this.setupFenceVisuals();
    this.setupChainView();
    this.setupAnimalVisuals();
    this.setupHouseTierVisuals();
    this.setupCowboyVisuals();
    this.setupUnitControl();
    this.setupRallyPoints();
    this.setupHotkeys();
    this.setupHpBarVisuals();
    this.setupStatusBadges();
    this.setupHarvestRadiusRing();
    this.setupDayNightCycle();
    this.setupAudio();
    this.setupRaidSystem();
    this.setupRaiderCamps();
    this.setupMerchantSystem();
    this.setupWorldEventSystem();
    this.setupNotificationLog();
    this.setupGameOverHalt();
    this.setupGameReset();
    this.setupSaveLoad();
    this.pauseForPreGameSelection();
  }

  update(time: number, delta: number): void {
    this.redrawSelectionRing();
    this.updateKeyboardCameraPan(delta);
    // The audio engine culls/pans world sounds against the camera's current
    // view; pushing it here (rather than reading a scene reference from inside
    // the audio module) keeps that module free of any Phaser dependency.
    setAudioListenerRect(this.cameras.main.worldView);
    this.emitFootstepTicks();
    // Phase 45: unlike buildings (event-driven redraw) or the viewport rect
    // (redrawn on camera-move events), units/raiders drift every frame even
    // while the camera and buildings are untouched - so this is the one
    // minimap redraw driven straight from update(), throttled the same way.
    this.redrawMinimapCombatThrottled(time);
  }

  private buildTilemap(): void {
    const map = this.make.tilemap({
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
      width: MAP_WIDTH_TILES,
      height: MAP_HEIGHT_TILES,
    });

    const tileset = map.addTilesetImage('tiles', TILESET_KEY, TILE_SIZE, TILE_SIZE, 0, 0);
    if (!tileset) {
      throw new Error('Failed to load tileset image');
    }

    const layer = map.createBlankLayer('ground', tileset, 0, 0);
    if (!layer) {
      throw new Error('Failed to create ground layer');
    }

    // Phase 30: the terrain grid is owned by mapConfig (gameState consults it
    // on every placement check), so the scene reads it rather than generating
    // its own copy.
    const tileData = getWorldTiles();
    this.tileData = tileData.map((row) => [...row]);
    for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
      for (let x = 0; x < MAP_WIDTH_TILES; x++) {
        layer.putTileAt(tileData[y][x], x, y);
      }
    }

    this.cameras.main.setBounds(0, 0, MAP_WIDTH_TILES * TILE_SIZE, MAP_HEIGHT_TILES * TILE_SIZE);
  }

  /**
   * Phase 30: one sprite per live vegetation entity, keyed by entity id.
   * Driven purely by the vegetation module's add/remove events (harvesting
   * depleting a tree, a Forestry replanting one) rather than redrawn per
   * tick, mirroring how animal sprites are driven only by 'animal-bought'.
   */
  private setupVegetationVisuals(): void {
    this.redrawAllVegetation();

    gameEvents.on('vegetation-added', (entity: VegetationEntity) => {
      this.addVegetationSprite(entity);
      this.redrawMinimap();
    });

    gameEvents.on('vegetation-removed', (entity: VegetationEntity) => {
      const image = this.vegetationImages.get(entity.id);
      if (image) {
        this.tweens.killTweensOf(image);
        image.destroy();
        this.vegetationImages.delete(entity.id);
      }
      this.redrawMinimap();
    });
  }

  private addVegetationSprite(entity: VegetationEntity): void {
    const image = this.add
      .image(entity.tileX * TILE_SIZE, entity.tileY * TILE_SIZE, VEGETATION_ATLAS_KEY, vegetationTextureKey(entity.kind))
      .setOrigin(0, 0)
      .setDepth(VEGETATION_DEPTH);
    // Phase 34: a tree replanted at 2am must not be the only green thing on a
    // blue map, so new sprites adopt the current phase's tint immediately.
    if (getDayPhase() === 'night') {
      image.setTint(VEGETATION_NIGHT_TINT);
    }
    this.vegetationImages.set(entity.id, image);
  }

  private redrawAllVegetation(): void {
    for (const image of this.vegetationImages.values()) {
      this.tweens.killTweensOf(image);
      image.destroy();
    }
    this.vegetationImages.clear();

    for (const entity of getVegetation()) {
      this.addVegetationSprite(entity);
    }
  }

  /**
   * Phase 33: wheel zoom about the cursor. The world point under the pointer
   * is captured before the zoom change and the camera is then scrolled so
   * that same world point lands back under the cursor afterwards - which is
   * what makes it feel like zooming into what you're looking at rather than
   * into the screen centre. The minimap viewport rectangle needs no special
   * handling: it derives from camera.worldView, which is already zoom-aware.
   */
  /**
   * CAMERA_MIN_ZOOM is the *desired* floor, but zooming out far enough that
   * the viewport is larger than the whole map just frames the map in dead
   * space (and pushes the minimap's viewport rectangle outside the minimap).
   * The effective floor is therefore whichever is larger: the configured
   * minimum, or the zoom at which the map exactly fills the viewport.
   */
  private getMinZoom(): number {
    const fitZoom = Math.max(
      VIEWPORT_WIDTH / (MAP_WIDTH_TILES * TILE_SIZE),
      VIEWPORT_HEIGHT / (MAP_HEIGHT_TILES * TILE_SIZE),
    );
    return Math.max(CAMERA_MIN_ZOOM, fitZoom);
  }

  private setupCameraZoom(): void {
    this.input.on(
      'wheel',
      (pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => {
        const camera = this.cameras.main;
        const worldPointX = pointer.worldX;
        const worldPointY = pointer.worldY;

        const direction = dy > 0 ? -1 : 1;
        const nextZoom = Phaser.Math.Clamp(
          camera.zoom + direction * CAMERA_ZOOM_STEP * camera.zoom,
          this.getMinZoom(),
          CAMERA_MAX_ZOOM,
        );
        if (nextZoom === camera.zoom) {
          return;
        }
        camera.setZoom(nextZoom);

        // Re-anchor: after the zoom the same screen offset maps to a
        // different world offset, so shift scroll by the difference.
        const newWorldPoint = camera.getWorldPoint(pointer.x, pointer.y);
        camera.scrollX += worldPointX - newWorldPoint.x;
        camera.scrollY += worldPointY - newWorldPoint.y;

        this.redrawMinimapViewport();
      },
    );
  }

  private setupCameraDrag(): void {
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.minimapPointerActive) {
        if (pointer.isDown) {
          this.navigateMinimapTo(pointer);
        }
        this.lastPointerX = pointer.x;
        this.lastPointerY = pointer.y;
        return;
      }

      // Phase 25: camera-pan moved from left-drag to right-drag so left-drag is
      // free for the unit selection rectangle. `pointer.isDown` (used here
      // pre-Phase-25) is true for ANY held button - see Phaser's Pointer.isDown
      // doc ("is _any_ button... considered as being down"), so panning now
      // needs the same explicit rightButtonDown()/leftButtonDown() checks the
      // rest of this file already uses elsewhere (e.g. setupBuildingPlacement).
      //
      // Phase 43: left-drag is the SAME gesture Phase 25 uses for the unit
      // box-select, branched here on placement-mode state so the two never
      // fire together - box-select's own branch below already requires
      // `this.selectedType === null`, so a line-friendly building being
      // selected (Road/Fence) automatically routes left-drag into the line
      // preview instead, with no separate mode flag needed on the box-select
      // side.
      const dxFromDown = pointer.x - this.pointerDownX;
      const dyFromDown = pointer.y - this.pointerDownY;
      const dragDistance = Math.sqrt(dxFromDown * dxFromDown + dyFromDown * dyFromDown);
      const isLineDragging =
        this.selectedType !== null &&
        isLinePlacementBuilding(this.selectedType) &&
        pointer.leftButtonDown() &&
        dragDistance > CLICK_MOVE_THRESHOLD;

      if (pointer.rightButtonDown() && this.selectedType === null) {
        const dx = pointer.x - this.lastPointerX;
        const dy = pointer.y - this.lastPointerY;
        this.cameras.main.scrollX -= dx;
        this.cameras.main.scrollY -= dy;
        this.redrawMinimapViewportThrottled();
      } else if (isLineDragging) {
        this.updateLinePreview(pointer);
      } else if (pointer.leftButtonDown() && this.selectedType === null) {
        this.updateSelectionRectangle(pointer);
      }

      if (!isLineDragging && this.lineDragWasActive) {
        this.hideLinePreview();
      }
      this.lineDragWasActive = isLineDragging;

      this.lastPointerX = pointer.x;
      this.lastPointerY = pointer.y;
      this.updateInfoText(pointer);
      if (!isLineDragging) {
        this.updatePreview(pointer);
      }
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.lastPointerX = pointer.x;
      this.lastPointerY = pointer.y;
      this.pointerDownX = pointer.x;
      this.pointerDownY = pointer.y;
      this.dragStartWorldX = pointer.worldX;
      this.dragStartWorldY = pointer.worldY;

      this.minimapPointerActive = this.isPointerInMinimap(pointer);
      if (this.minimapPointerActive) {
        this.navigateMinimapTo(pointer);
      }
    });
  }

  /**
   * World-space rectangle (no setScrollFactor(0), same as
   * redrawConnectionOutlines/redrawFenceLines/redrawSelectionRing) drawn
   * between the drag-start point and the current pointer, both captured as
   * world coordinates - not screen coordinates - so the box stays correctly
   * anchored over the ground/units even if the camera scrolls mid-drag.
   */
  private updateSelectionRectangle(pointer: Phaser.Input.Pointer): void {
    this.selectionRectGraphics.clear();

    const dx = pointer.x - this.pointerDownX;
    const dy = pointer.y - this.pointerDownY;
    if (Math.sqrt(dx * dx + dy * dy) <= CLICK_MOVE_THRESHOLD) {
      return;
    }

    const minX = Math.min(this.dragStartWorldX, pointer.worldX);
    const minY = Math.min(this.dragStartWorldY, pointer.worldY);
    const width = Math.abs(pointer.worldX - this.dragStartWorldX);
    const height = Math.abs(pointer.worldY - this.dragStartWorldY);

    this.selectionRectGraphics.fillStyle(SELECTION_RECT_COLOR, SELECTION_RECT_FILL_ALPHA);
    this.selectionRectGraphics.fillRect(minX, minY, width, height);
    this.selectionRectGraphics.lineStyle(1, SELECTION_RECT_COLOR, 1);
    this.selectionRectGraphics.strokeRect(minX, minY, width, height);
  }

  /**
   * Phase 41: continuous WASD/arrow-key camera panning, checked every frame
   * in update() rather than on one-shot keydown events - addKey()'s .isDown
   * reflects the held state directly, the same "poll, don't event" approach
   * Phaser's own docs recommend for movement. Diagonal input is normalized so
   * holding two keys doesn't pan faster than one. No zoom adjustment, same
   * simplification setupCameraDrag's right-drag pan already uses (raw screen-
   * px delta straight onto scrollX/scrollY); camera.setBounds (buildTilemap)
   * clamps the result to the map exactly as it already clamps drag-pan.
   */
  private setupKeyboardCamera(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }
    const KeyCodes = Phaser.Input.Keyboard.KeyCodes;
    this.cameraKeys = {
      w: keyboard.addKey(KeyCodes.W),
      a: keyboard.addKey(KeyCodes.A),
      s: keyboard.addKey(KeyCodes.S),
      d: keyboard.addKey(KeyCodes.D),
      up: keyboard.addKey(KeyCodes.UP),
      down: keyboard.addKey(KeyCodes.DOWN),
      left: keyboard.addKey(KeyCodes.LEFT),
      right: keyboard.addKey(KeyCodes.RIGHT),
    };
  }

  private updateKeyboardCameraPan(deltaMs: number): void {
    if (!this.cameraKeys) {
      return;
    }

    let dx = 0;
    let dy = 0;
    if (this.cameraKeys.a.isDown || this.cameraKeys.left.isDown) {
      dx -= 1;
    }
    if (this.cameraKeys.d.isDown || this.cameraKeys.right.isDown) {
      dx += 1;
    }
    if (this.cameraKeys.w.isDown || this.cameraKeys.up.isDown) {
      dy -= 1;
    }
    if (this.cameraKeys.s.isDown || this.cameraKeys.down.isDown) {
      dy += 1;
    }

    if (dx === 0 && dy === 0) {
      return;
    }

    const length = Math.sqrt(dx * dx + dy * dy);
    const distance = (CAMERA_KEYBOARD_PAN_SPEED_PX_PER_SEC * deltaMs) / 1000;
    this.cameras.main.scrollX += (dx / length) * distance;
    this.cameras.main.scrollY += (dy / length) * distance;
    this.redrawMinimapViewportThrottled();
  }

  private setupInfoText(): void {
    this.infoText = this.add.text(8, VIEWPORT_HEIGHT - 8, 'tile: -, -', {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#2b1d12cc',
      padding: { x: 6, y: 4 },
    });
    this.infoText.setOrigin(0, 1);
    this.infoText.setScrollFactor(0);
    this.infoText.setDepth(1000);

    // World-space (no setScrollFactor(0)) so it stays pinned under the
    // preview footprint it is describing as the camera pans/zooms.
    this.placementHintText = this.add
      .text(0, 0, '', {
        fontSize: '12px',
        color: '#ffffff',
        backgroundColor: '#c62828dd',
        padding: { x: 4, y: 2 },
      })
      .setDepth(PLACEMENT_HINT_DEPTH)
      .setVisible(false);

    // Phase 43: world-space like placementHintText, above it while a line
    // drag is active (the two are never shown at once - see updateLinePreview).
    this.lineCostText = this.add
      .text(0, 0, '', {
        fontSize: '12px',
        color: '#ffffff',
        backgroundColor: '#2e7d32dd',
        padding: { x: 4, y: 2 },
      })
      .setDepth(PLACEMENT_HINT_DEPTH)
      .setVisible(false);
  }

  private updateInfoText(pointer: Phaser.Input.Pointer): void {
    const { tileX, tileY } = this.pointerToTile(pointer);
    if (tileX === this.lastInfoTileX && tileY === this.lastInfoTileY) {
      return;
    }
    this.lastInfoTileX = tileX;
    this.lastInfoTileY = tileY;
    this.infoText.setText(`tile: ${tileX}, ${tileY}`);
  }

  private setupResourceHud(): void {
    this.resourceHud = new ResourceHudPanel(this);

    gameEvents.on('money-changed', () => this.resourceHud.refresh());
    gameEvents.on('resources-changed', () => this.resourceHud.refresh());
    gameEvents.on('production-tick', () => this.resourceHud.refresh());
  }

  /**
   * Raid combat resolution rides the same 2s cadence as production instead of
   * its own timer: it's already the game's "slow tick" for anything that
   * shouldn't run per-frame, and running it right after production means a
   * building's HP regen (inside runProductionTick) and that tick's raider
   * damage are both settled before the HP bars redraw.
   */
  private setupProductionTimer(): void {
    this.time.addEvent({
      delay: PRODUCTION_TICK_MS,
      loop: true,
      callback: () => {
        // Phase 34: the explicit pause/game-over guard setupSpeedControl's
        // comment used to *claim* lived inside runProductionTick. It didn't -
        // runProductionTick only ever early-returned on gameOver, never on
        // pause. In practice time.timeScale = 0 stops this timer from firing
        // at all, so the bug was latent rather than visible, but a guard that
        // is documented to exist should exist.
        if (this.gameSpeed === 0 || isGameOver()) {
          return;
        }
        runProductionTick();
        this.runRaidCombatTick();
      },
    });
  }

  /**
   * Phase 33: pause and 1x/2x/4x fast-forward. Rather than rescaling every
   * individual timer and tween by hand, this drives Phaser's two global
   * time scales: this.time.timeScale (every TimerEvent - production ticks,
   * the countdown clock, raid scheduling) and this.tweens.timeScale (every
   * movement/animation tween - villagers, units, raiders, accents). A speed
   * of 0 freezes both, which is exactly what "paused" means here: production
   * ticks stop firing and raids neither spawn nor advance.
   *
   * Phase 34: the production timer's own callback additionally checks
   * gameSpeed/isGameOver, so a timer that fires mid-transition can't advance
   * the simulation (this comment previously described that guard as living
   * inside runProductionTick, where it did not in fact exist).
   */
  private setupSpeedControl(): void {
    gameEvents.on('speed-changed', (speed: number) => {
      this.gameSpeed = speed;
      this.time.timeScale = speed;
      this.tweens.timeScale = speed;
      // Paused means silent; faster speeds deliberately do NOT get a matching
      // increase in sound trigger rate beyond what the sped-up timers already
      // cause (see the audio module's header).
      setAudioGameSpeed(speed);
      this.timerText.setText(this.formatTimerText());
    });
  }

  private setupTimerHud(): void {
    this.timerText = this.add.text(VIEWPORT_WIDTH - 8, 8, this.formatTimerText(), {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#2b1d12cc',
      padding: { x: 6, y: 4 },
      align: 'right',
    });
    this.timerText.setOrigin(1, 0);
    this.timerText.setScrollFactor(0);
    this.timerText.setDepth(1000);

    gameEvents.on('timer-changed', (phaseRemainingSeconds: number) => {
      this.phaseRemainingDisplay = phaseRemainingSeconds;
      this.timerText.setText(this.formatTimerText());
    });
    gameEvents.on('production-tick', () => {
      this.timerText.setText(this.formatTimerText());
    });

    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => tickTimer(),
    });
  }

  /**
   * Phase 32: the headline number is net worth, not meat. Also shows the
   * current speed multiplier (or PAUSED) so the player always knows why the
   * clock is or isn't moving.
   *
   * Phase 34: the flat run countdown is replaced by the cycle position -
   * which day, which half of it, and how long that half has left. "How long
   * until the run ends" is no longer the number the player plans around;
   * "how long until nightfall (and therefore raids)" is.
   */
  private formatTimerText(): string {
    const minutes = Math.floor(this.phaseRemainingDisplay / 60);
    const seconds = this.phaseRemainingDisplay % 60;
    const time = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    // "Day 2 - Day 1:40" read as a typo in testing; the phase gets the longer
    // word so the day counter and the phase can't be mistaken for each other.
    const phaseLabel = getDayPhase() === 'night' ? 'Night' : 'Daytime';
    const speedLabel = this.gameSpeed === 0 ? 'PAUSED' : `${this.gameSpeed}x`;
    return `Day ${getDayNumber()} - ${phaseLabel} ${time} (${speedLabel}) | Net worth: $${computeNetWorth().total}`;
  }

  private setupMinimap(): void {
    this.minimapX = MINIMAP_MARGIN;
    this.minimapY = this.resourceHud.getBottomY() + MINIMAP_MARGIN;

    this.minimapGraphics = this.add.graphics();
    this.minimapGraphics.setScrollFactor(0);
    this.minimapGraphics.setDepth(1000);

    this.minimapViewportGraphics = this.add.graphics();
    this.minimapViewportGraphics.setScrollFactor(0);
    this.minimapViewportGraphics.setDepth(1001);

    // Phase 45: above the viewport rectangle so live combat dots/pings are
    // never hidden behind it.
    this.minimapCombatGraphics = this.add.graphics();
    this.minimapCombatGraphics.setScrollFactor(0);
    this.minimapCombatGraphics.setDepth(1002);

    this.redrawMinimap();

    gameEvents.on('building-placed', () => this.redrawMinimap());
    gameEvents.on('game-reset', () => this.redrawMinimap());
  }

  private redrawMinimap(): void {
    this.minimapGraphics.clear();

    const tileWidth = MINIMAP_WIDTH / MAP_WIDTH_TILES;
    const tileHeight = MINIMAP_HEIGHT / MAP_HEIGHT_TILES;

    for (let y = 0; y < MAP_HEIGHT_TILES; y++) {
      for (let x = 0; x < MAP_WIDTH_TILES; x++) {
        const tileType = this.tileData[y]?.[x] ?? TileType.Dirt;
        this.minimapGraphics.fillStyle(TILE_COLORS[tileType], 1);
        this.minimapGraphics.fillRect(
          this.minimapX + x * tileWidth,
          this.minimapY + y * tileHeight,
          tileWidth,
          tileHeight,
        );
      }
    }

    // Phase 30: vegetation is drawn under the building dots - it's terrain-
    // scale context (where the woods and cactus fields are, i.e. where a
    // Forestry or Cactus Milker would pay off), not a town landmark.
    for (const entity of getVegetation()) {
      this.minimapGraphics.fillStyle(VEGETATION_DEFINITIONS[entity.kind].color, 1);
      this.minimapGraphics.fillRect(
        this.minimapX + entity.tileX * tileWidth,
        this.minimapY + entity.tileY * tileHeight,
        MINIMAP_VEGETATION_DOT_SIZE,
        MINIMAP_VEGETATION_DOT_SIZE,
      );
    }

    for (const building of getPlacedBuildings()) {
      const { width, height } = BUILDING_DEFINITIONS[building.type].size;
      const centerTileX = building.tileX + width / 2;
      const centerTileY = building.tileY + height / 2;
      this.minimapGraphics.fillStyle(BUILDING_DEFINITIONS[building.type].color, 1);
      this.minimapGraphics.fillRect(
        this.minimapX + centerTileX * tileWidth - MINIMAP_BUILDING_DOT_SIZE / 2,
        this.minimapY + centerTileY * tileHeight - MINIMAP_BUILDING_DOT_SIZE / 2,
        MINIMAP_BUILDING_DOT_SIZE,
        MINIMAP_BUILDING_DOT_SIZE,
      );
    }

    // Phase 57: Raider Camps are drawn on this always-on layer (redrawn on
    // building-placed/game-reset/camp-spawned/camp-destroyed), not the
    // throttled per-frame minimapCombatGraphics units/raiders share - a camp
    // never moves and should be visible as a standing objective regardless of
    // whether a wave is currently active.
    this.minimapGraphics.fillStyle(MINIMAP_CAMP_COLOR, 1);
    for (const camp of getRaiderCamps()) {
      const tileX = camp.x / TILE_SIZE;
      const tileY = camp.y / TILE_SIZE;
      this.minimapGraphics.fillRect(
        this.minimapX + tileX * tileWidth - MINIMAP_CAMP_DOT_SIZE / 2,
        this.minimapY + tileY * tileHeight - MINIMAP_CAMP_DOT_SIZE / 2,
        MINIMAP_CAMP_DOT_SIZE,
        MINIMAP_CAMP_DOT_SIZE,
      );
    }

    this.minimapGraphics.lineStyle(1, MINIMAP_BORDER_COLOR, 0.8);
    this.minimapGraphics.strokeRect(this.minimapX, this.minimapY, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    this.redrawMinimapViewport();
  }

  private redrawMinimapViewportThrottled(): void {
    const now = this.time.now;
    if (now - this.lastMinimapViewportRedraw < MINIMAP_VIEWPORT_THROTTLE_MS) {
      return;
    }
    this.lastMinimapViewportRedraw = now;
    this.redrawMinimapViewport();
  }

  private redrawMinimapViewport(): void {
    this.minimapViewportGraphics.clear();

    const worldView = this.cameras.main.worldView;
    const mapPixelWidth = MAP_WIDTH_TILES * TILE_SIZE;
    const mapPixelHeight = MAP_HEIGHT_TILES * TILE_SIZE;

    // worldView is zoom-aware, so this follows the camera's zoom for free
    // (Phase 33). Clamped to the minimap's own rect so a viewport wider than
    // the map (possible at the minimum zoom on non-default viewport sizes)
    // can never draw its rectangle outside the minimap frame.
    const rectX = this.minimapX + Phaser.Math.Clamp(worldView.x / mapPixelWidth, 0, 1) * MINIMAP_WIDTH;
    const rectY = this.minimapY + Phaser.Math.Clamp(worldView.y / mapPixelHeight, 0, 1) * MINIMAP_HEIGHT;
    const rectW = Math.min(
      (worldView.width / mapPixelWidth) * MINIMAP_WIDTH,
      this.minimapX + MINIMAP_WIDTH - rectX,
    );
    const rectH = Math.min(
      (worldView.height / mapPixelHeight) * MINIMAP_HEIGHT,
      this.minimapY + MINIMAP_HEIGHT - rectY,
    );

    this.minimapViewportGraphics.lineStyle(2, MINIMAP_VIEWPORT_COLOR, 1);
    this.minimapViewportGraphics.strokeRect(rectX, rectY, rectW, rectH);
  }

  /**
   * Phase 45: same throttle-and-redraw pair as redrawMinimapViewportThrottled/
   * redrawMinimapViewport, but called every update() frame instead of only on
   * camera-move/pointer events, since units and raiders keep moving on their
   * own.
   */
  private redrawMinimapCombatThrottled(now: number): void {
    if (now - this.lastMinimapCombatRedraw < MINIMAP_VIEWPORT_THROTTLE_MS) {
      return;
    }
    this.lastMinimapCombatRedraw = now;
    this.redrawMinimapCombat(now);
  }

  private redrawMinimapCombat(now: number): void {
    this.minimapCombatGraphics.clear();

    const tileWidth = MINIMAP_WIDTH / MAP_WIDTH_TILES;
    const tileHeight = MINIMAP_HEIGHT / MAP_HEIGHT_TILES;

    this.redrawMinimapBuildingFlashes(now, tileWidth, tileHeight);

    this.minimapCombatGraphics.fillStyle(MINIMAP_UNIT_COLOR, 1);
    for (const unit of this.cowboyUnits) {
      if (!this.isCowboyUnitAlive(unit)) {
        continue;
      }
      const tileX = unit.image.x / TILE_SIZE;
      const tileY = unit.image.y / TILE_SIZE;
      this.minimapCombatGraphics.fillRect(
        this.minimapX + tileX * tileWidth - MINIMAP_UNIT_DOT_SIZE / 2,
        this.minimapY + tileY * tileHeight - MINIMAP_UNIT_DOT_SIZE / 2,
        MINIMAP_UNIT_DOT_SIZE,
        MINIMAP_UNIT_DOT_SIZE,
      );
    }

    this.minimapCombatGraphics.fillStyle(MINIMAP_RAIDER_COLOR, 1);
    for (const raider of this.raiders) {
      const tileX = raider.image.x / TILE_SIZE;
      const tileY = raider.image.y / TILE_SIZE;
      this.minimapCombatGraphics.fillRect(
        this.minimapX + tileX * tileWidth - MINIMAP_RAIDER_DOT_SIZE / 2,
        this.minimapY + tileY * tileHeight - MINIMAP_RAIDER_DOT_SIZE / 2,
        MINIMAP_RAIDER_DOT_SIZE,
        MINIMAP_RAIDER_DOT_SIZE,
      );
    }

    this.redrawOffscreenThreatPings(now);
  }

  /** Prunes expired flashes, then draws the surviving ones alternating size on MINIMAP_FLASH_BLINK_MS. */
  private redrawMinimapBuildingFlashes(now: number, tileWidth: number, tileHeight: number): void {
    for (const [buildingId, flash] of this.minimapBuildingFlashes) {
      if (now >= flash.until) {
        this.minimapBuildingFlashes.delete(buildingId);
        continue;
      }

      const blinkOn = Math.floor((flash.until - now) / MINIMAP_FLASH_BLINK_MS) % 2 === 0;
      const size = blinkOn ? MINIMAP_FLASH_DOT_SIZE : MINIMAP_BUILDING_DOT_SIZE;
      this.minimapCombatGraphics.fillStyle(MINIMAP_FLASH_COLOR, 1);
      this.minimapCombatGraphics.fillRect(
        this.minimapX + flash.tileX * tileWidth - size / 2,
        this.minimapY + flash.tileY * tileHeight - size / 2,
        size,
        size,
      );
    }
  }

  /**
   * Phase 45: for every building currently under off-screen attack, draws a
   * pulsing dot at the point where a line from the minimap's centre to that
   * building's minimap position crosses the minimap's own border - a compact
   * "the threat is that way" indicator that fades out once
   * OFFSCREEN_PING_FADE_MS has passed since the last hit. Re-checks current
   * on-screen-ness every call (rather than trusting the off-screen snapshot
   * taken at hit time) so panning onto the fight clears its ping immediately.
   */
  private redrawOffscreenThreatPings(now: number): void {
    for (const [buildingId, threat] of this.offscreenThreats) {
      if (now - threat.lastHitAt > OFFSCREEN_PING_FADE_MS) {
        this.offscreenThreats.delete(buildingId);
        continue;
      }
      if (this.isWorldPointInViewport(threat.worldX, threat.worldY)) {
        continue;
      }

      const mapPixelWidth = MAP_WIDTH_TILES * TILE_SIZE;
      const mapPixelHeight = MAP_HEIGHT_TILES * TILE_SIZE;
      const targetX = this.minimapX + Phaser.Math.Clamp(threat.worldX / mapPixelWidth, 0, 1) * MINIMAP_WIDTH;
      const targetY = this.minimapY + Phaser.Math.Clamp(threat.worldY / mapPixelHeight, 0, 1) * MINIMAP_HEIGHT;

      const centerX = this.minimapX + MINIMAP_WIDTH / 2;
      const centerY = this.minimapY + MINIMAP_HEIGHT / 2;
      const dx = targetX - centerX;
      const dy = targetY - centerY;
      const halfW = MINIMAP_WIDTH / 2 - OFFSCREEN_PING_EDGE_INSET;
      const halfH = MINIMAP_HEIGHT / 2 - OFFSCREEN_PING_EDGE_INSET;
      const scale = Math.min(
        dx !== 0 ? Math.abs(halfW / dx) : Infinity,
        dy !== 0 ? Math.abs(halfH / dy) : Infinity,
        1,
      );
      const edgeX = centerX + dx * scale;
      const edgeY = centerY + dy * scale;

      const fadeAlpha = Phaser.Math.Clamp(1 - (now - threat.lastHitAt) / OFFSCREEN_PING_FADE_MS, 0, 1);
      const pulse = 0.5 + 0.5 * Math.sin(now / OFFSCREEN_PING_PULSE_MS);
      this.minimapCombatGraphics.fillStyle(OFFSCREEN_PING_COLOR, fadeAlpha * (0.4 + 0.6 * pulse));
      this.minimapCombatGraphics.fillCircle(edgeX, edgeY, OFFSCREEN_PING_RADIUS);
    }
  }

  private isWorldPointInViewport(worldX: number, worldY: number): boolean {
    const view = this.cameras.main.worldView;
    return worldX >= view.x && worldX <= view.right && worldY >= view.y && worldY <= view.bottom;
  }

  /**
   * Phase 45: called right after a raider damages a building (resolveRaiderAttacks)
   * so a hit anywhere on the map shows up on the minimap even if the player
   * is looking elsewhere. Snapshots the building's own centre tile rather
   * than holding a PlacedBuilding reference, so the flash still renders for
   * its full duration even if this same hit destroyed the building and
   * removeDestroyedBuildings() drops it from gameState a moment later.
   */
  private registerMinimapBuildingDamage(building: PlacedBuilding): void {
    const { width, height } = BUILDING_DEFINITIONS[building.type].size;
    const centerTileX = building.tileX + width / 2;
    const centerTileY = building.tileY + height / 2;
    const now = this.time.now;

    this.minimapBuildingFlashes.set(building.id, {
      tileX: centerTileX,
      tileY: centerTileY,
      until: now + MINIMAP_FLASH_DURATION_MS,
    });

    const worldX = centerTileX * TILE_SIZE;
    const worldY = centerTileY * TILE_SIZE;
    if (this.isWorldPointInViewport(worldX, worldY)) {
      this.offscreenThreats.delete(building.id);
    } else {
      this.offscreenThreats.set(building.id, { worldX, worldY, lastHitAt: now });
    }
  }

  private isPointerInMinimap(pointer: Phaser.Input.Pointer): boolean {
    return (
      pointer.x >= this.minimapX &&
      pointer.x <= this.minimapX + MINIMAP_WIDTH &&
      pointer.y >= this.minimapY &&
      pointer.y <= this.minimapY + MINIMAP_HEIGHT
    );
  }

  private navigateMinimapTo(pointer: Phaser.Input.Pointer): void {
    const relX = Phaser.Math.Clamp(pointer.x - this.minimapX, 0, MINIMAP_WIDTH);
    const relY = Phaser.Math.Clamp(pointer.y - this.minimapY, 0, MINIMAP_HEIGHT);
    const worldX = (relX / MINIMAP_WIDTH) * MAP_WIDTH_TILES * TILE_SIZE;
    const worldY = (relY / MINIMAP_HEIGHT) * MAP_HEIGHT_TILES * TILE_SIZE;
    // Camera bounds set in buildTilemap() clamp the scroll automatically.
    this.cameras.main.centerOn(worldX, worldY);
    this.redrawMinimapViewportThrottled();
  }

  private setupBuildingPlacement(): void {
    this.input.mouse?.disableContextMenu();
    this.shiftKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT) ?? null;

    gameEvents.on('select-building', (type: BuildingType) => {
      this.selectedType = type;
      this.refreshPreviewTexture();
    });

    gameEvents.on('cancel-placement', () => {
      this.cancelPlacement();
    });

    this.input.keyboard?.on('keydown-ESC', () => {
      gameEvents.emit('cancel-placement');
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isPointerInMinimap(pointer)) {
        return;
      }
      if (pointer.rightButtonDown()) {
        gameEvents.emit('cancel-placement');
        return;
      }
      // Phase 43: line-friendly types (Road/Fence) place on pointerup instead
      // (see commitLinePlacement below) so a plain click and a drag-to-line
      // can share one code path - committing immediately here would place a
      // building before we even know whether this click is about to become a
      // drag.
      if (
        this.selectedType !== null &&
        pointer.leftButtonDown() &&
        !isLinePlacementBuilding(this.selectedType)
      ) {
        this.tryPlaceAt(pointer);
      }
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (
        this.selectedType === null ||
        !isLinePlacementBuilding(this.selectedType) ||
        !pointer.leftButtonReleased() ||
        this.isPointerInMinimap(pointer)
      ) {
        return;
      }
      this.commitLinePlacement(pointer);
    });
  }

  private setupBuildingSelection(): void {
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const wasMinimapClick = this.minimapPointerActive;
      this.minimapPointerActive = false;
      if (wasMinimapClick) {
        return;
      }

      if (this.selectedType !== null) {
        return;
      }

      const dx = pointer.x - this.pointerDownX;
      const dy = pointer.y - this.pointerDownY;
      if (Math.sqrt(dx * dx + dy * dy) > CLICK_MOVE_THRESHOLD) {
        return;
      }

      const { tileX, tileY } = this.pointerToTile(pointer);
      const building = getBuildingAtTile(tileX, tileY);

      this.selectedBuildingId = building?.id ?? null;
      gameEvents.emit('building-selected', building);
    });

    // Keeps the tracked id in step with panel closes issued elsewhere
    // (game-reset, a removal closing the panel) without those paths needing
    // to know about this field.
    gameEvents.on('building-selected', (building: PlacedBuilding | null) => {
      this.selectedBuildingId = building?.id ?? null;
    });
  }

  private refreshPreviewTexture(): void {
    if (this.selectedType === null) {
      return;
    }

    this.previewImage?.destroy();
    this.previewImage = this.add.image(0, 0, BUILDING_ATLAS_KEY, buildingTextureKey(this.selectedType));
    this.previewImage.setOrigin(0, 0);
    this.previewImage.setAlpha(0.6);
    this.previewImage.setDepth(500);
  }

  private cancelPlacement(): void {
    this.selectedType = null;
    this.previewImage?.destroy();
    this.previewImage = null;
    this.placementHintText?.setVisible(false);
    this.hideLinePreview();
    this.lineDragWasActive = false;
  }

  /** Phase 43: hides every pooled line-preview tile plus the running cost tag; the pooled Images themselves are never destroyed, just reused next drag. */
  private hideLinePreview(): void {
    for (const image of this.linePreviewImages) {
      image.setVisible(false);
    }
    this.lineCostText?.setVisible(false);
  }

  private isShiftHeld(): boolean {
    return this.shiftKey?.isDown ?? false;
  }

  /**
   * Phase 43: placement previously always stayed active until an explicit
   * Escape/right-click cancel (see cancelPlacement's call sites), so a single
   * House click already behaved like "repeat placement" with no way to place
   * just one without a manual cancel afterwards. This flips the default to
   * match the literal ask ("shift-click keeps the tool active for repeat
   * placement"): a plain placement now exits placement mode immediately,
   * and holding Shift is what keeps it selected for the next tile/line.
   *
   * Emits 'cancel-placement' rather than calling this.cancelPlacement()
   * directly - BuildingBar's active-button highlight is driven purely by
   * that event (see its 'select-building'/'cancel-placement' listeners), so
   * calling the local cleanup straight would silently desync the bar from
   * the scene's actual placement state.
   */
  private applyShiftRepeatPolicy(): void {
    if (!this.isShiftHeld()) {
      gameEvents.emit('cancel-placement');
    }
  }

  /**
   * Phase 43: dominant-axis-first straight line from start to end, bending
   * once into an L rather than a staircase - the common RTS wall-drag
   * convention. rangeInclusive collapses to a single value when start===end
   * on that axis, and slice(1) on the second leg drops its first tile (the
   * corner), which the first leg already added - this also means a
   * zero-length drag (start === end on both axes) degrades to exactly one
   * tile, so a plain click without any drag still places a single building.
   */
  private computeLineTiles(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ): { tileX: number; tileY: number }[] {
    const rangeInclusive = (from: number, to: number): number[] => {
      const step = from <= to ? 1 : -1;
      const values: number[] = [];
      for (let value = from; step > 0 ? value <= to : value >= to; value += step) {
        values.push(value);
      }
      return values;
    };

    const tiles: { tileX: number; tileY: number }[] = [];
    if (Math.abs(endX - startX) >= Math.abs(endY - startY)) {
      for (const x of rangeInclusive(startX, endX)) {
        tiles.push({ tileX: x, tileY: startY });
      }
      for (const y of rangeInclusive(startY, endY).slice(1)) {
        tiles.push({ tileX: endX, tileY: y });
      }
    } else {
      for (const y of rangeInclusive(startY, endY)) {
        tiles.push({ tileX: startX, tileY: y });
      }
      for (const x of rangeInclusive(startX, endX).slice(1)) {
        tiles.push({ tileX: x, tileY: endY });
      }
    }
    return tiles;
  }

  private worldToTile(worldX: number, worldY: number): { tileX: number; tileY: number } {
    return {
      tileX: Math.floor(worldX / TILE_SIZE),
      tileY: Math.floor(worldY / TILE_SIZE),
    };
  }

  private getOrCreateLinePreviewImage(index: number, type: BuildingType): Phaser.GameObjects.Image {
    const existing = this.linePreviewImages[index];
    if (existing) {
      existing.setTexture(BUILDING_ATLAS_KEY, buildingTextureKey(type));
      return existing;
    }
    const image = this.add.image(0, 0, BUILDING_ATLAS_KEY, buildingTextureKey(type));
    image.setOrigin(0, 0);
    image.setAlpha(0.6);
    image.setDepth(500);
    this.linePreviewImages[index] = image;
    return image;
  }

  /**
   * Phase 43: renders every tile of the in-progress line simultaneously
   * (green/red per tile via getPlacementRejection, same rule placeBuilding
   * itself gates on) plus a running "N/total Label - cost" tag near the
   * drag's current end. The single-tile hover preview (previewImage) is
   * hidden for the duration - see the pointermove branch in setupCameraDrag.
   */
  private updateLinePreview(pointer: Phaser.Input.Pointer): void {
    const type = this.selectedType;
    if (type === null) {
      return;
    }

    this.previewImage?.setVisible(false);

    const startTile = this.worldToTile(this.dragStartWorldX, this.dragStartWorldY);
    const endTile = this.pointerToTile(pointer);
    const tiles = this.computeLineTiles(startTile.tileX, startTile.tileY, endTile.tileX, endTile.tileY);
    const definition = BUILDING_DEFINITIONS[type];

    let validCount = 0;
    let totalMoney = 0;
    const totalMaterials: Partial<Record<ResourceKey, number>> = {};

    tiles.forEach((tile, index) => {
      const rejection = getPlacementRejection(tile.tileX, tile.tileY, type);
      const image = this.getOrCreateLinePreviewImage(index, type);
      image.setPosition(tile.tileX * TILE_SIZE, tile.tileY * TILE_SIZE);
      image.setVisible(true);
      image.setTint(rejection === null ? VALID_TINT : INVALID_TINT);

      if (rejection === null) {
        validCount++;
        totalMoney += definition.cost;
        if (definition.materials) {
          for (const [key, amount] of Object.entries(definition.materials) as [ResourceKey, number][]) {
            totalMaterials[key] = (totalMaterials[key] ?? 0) + amount;
          }
        }
      }
    });

    for (let index = tiles.length; index < this.linePreviewImages.length; index++) {
      this.linePreviewImages[index].setVisible(false);
    }

    const costLabel =
      Object.keys(totalMaterials).length > 0
        ? `$${totalMoney} + ${formatResourceMap(totalMaterials)}`
        : `$${totalMoney}`;
    const lastTile = tiles[tiles.length - 1];
    this.lineCostText.setText(`${validCount}/${tiles.length} ${definition.label} - ${costLabel}`);
    this.lineCostText.setPosition(
      lastTile.tileX * TILE_SIZE,
      (lastTile.tileY + definition.size.height) * TILE_SIZE + 4,
    );
    this.lineCostText.setVisible(true);
    this.placementHintText.setVisible(false);
    this.harvestRingGraphics.clear();
  }

  /**
   * Phase 43: places on every tile of the line that passes
   * getPlacementRejection AT THE TIME IT IS REACHED (not the preview's
   * earlier snapshot) - placeBuildingAt re-checks via placeBuilding/
   * canPlaceBuilding per tile, so money/materials spent on tile N are
   * already gone by the time tile N+1 is attempted. A drag that outruns the
   * player's money therefore just stops placing partway through rather than
   * aborting the whole line or overspending.
   */
  private commitLinePlacement(pointer: Phaser.Input.Pointer): void {
    const type = this.selectedType;
    if (type === null) {
      return;
    }

    const startTile = this.worldToTile(this.dragStartWorldX, this.dragStartWorldY);
    const endTile = this.pointerToTile(pointer);
    const tiles = this.computeLineTiles(startTile.tileX, startTile.tileY, endTile.tileX, endTile.tileY);

    let placedCount = 0;
    for (const tile of tiles) {
      if (this.placeBuildingAt(tile.tileX, tile.tileY)) {
        placedCount++;
      }
    }

    this.hideLinePreview();
    this.lineDragWasActive = false;

    if (placedCount > 0) {
      playPlacementSound();
    }

    this.applyShiftRepeatPolicy();
    if (this.selectedType !== null) {
      this.previewImage?.setVisible(true);
      this.updatePreview(pointer);
    }
  }

  /**
   * Phase 33: the preview no longer just goes red - it says why. The reason
   * string comes straight from gameState.getPlacementRejection, the same
   * function placeBuilding itself gates on, so the hint can never claim a
   * placement is legal (or illegal) when the rule disagrees.
   */
  private updatePreview(pointer: Phaser.Input.Pointer): void {
    if (this.selectedType === null || !this.previewImage) {
      return;
    }

    const { tileX, tileY } = this.pointerToTile(pointer);
    this.previewImage.setPosition(tileX * TILE_SIZE, tileY * TILE_SIZE);

    // Phase 34: a harvester's reach is drawn under the preview so "will this
    // actually reach anything" is answerable before paying for it.
    this.redrawHarvestRing(tileX, tileY);

    const rejection = getPlacementRejection(tileX, tileY, this.selectedType);
    this.previewImage.setTint(rejection === null ? VALID_TINT : INVALID_TINT);

    // Phase 34: a legal-but-unwise placement gets a warning rather than a
    // block. The tint stays green (it IS placeable) and only the hint text
    // changes colour, so the two signals can't be confused with each other.
    const warning = rejection === null ? getPlacementWarning(tileX, tileY, this.selectedType) : null;
    const message = rejection ?? warning;

    if (message === null) {
      this.placementHintText.setVisible(false);
      return;
    }

    const { height } = BUILDING_DEFINITIONS[this.selectedType].size;
    this.placementHintText.setText(message);
    this.placementHintText.setBackgroundColor(rejection === null ? '#8d6e00dd' : '#c62828dd');
    this.placementHintText.setPosition(
      tileX * TILE_SIZE,
      (tileY + height) * TILE_SIZE + 4,
    );
    this.placementHintText.setVisible(true);
  }

  /**
   * Phase 31: explicit bulldozer mode. Kept as a separate mode rather than a
   * button on the info panel so demolishing several buildings in a row
   * doesn't mean re-selecting each one first; selecting a building to place
   * cancels it (and vice versa) since the two modes both own the left click.
   */
  private setupDemolishMode(): void {
    gameEvents.on('demolish-mode-changed', (active: boolean) => {
      this.demolishMode = active;
      if (active) {
        this.cancelPlacement();
      }
    });

    gameEvents.on('select-building', () => {
      if (this.demolishMode) {
        this.demolishMode = false;
        gameEvents.emit('demolish-mode-changed', false);
      }
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.demolishMode || !pointer.leftButtonDown() || this.isPointerInMinimap(pointer)) {
        return;
      }
      const { tileX, tileY } = this.pointerToTile(pointer);
      const building = getBuildingAtTile(tileX, tileY);
      if (building) {
        demolishBuilding(building.id);
        return;
      }

      // Phase 34: the bulldozer now also clears a tree/cactus. Until now the
      // only thing that ever removed vegetation was a harvester draining it,
      // so a tile blocked by a species you had no harvester for could not be
      // built on at all - a genuine dead end, not a difficulty choice.
      // Buildings take priority on a shared tile (a building and vegetation
      // can't coexist today, but the ordering makes the intent explicit).
      const vegetation = getVegetationAtTile(tileX, tileY);
      if (vegetation && clearVegetationAt(tileX, tileY)) {
        playWorldSound('clear', tileX * TILE_SIZE + TILE_SIZE / 2, tileY * TILE_SIZE + TILE_SIZE / 2);
      } else if (vegetation) {
        this.showTransientHint(
          `Need $${VEGETATION_CLEAR_COST} to clear`,
          tileX * TILE_SIZE,
          (tileY + 1) * TILE_SIZE + 4,
        );
      }
    });
  }

  /** Reuses the placement hint text object for a brief, position-anchored message outside placement mode. */
  private showTransientHint(text: string, worldX: number, worldY: number): void {
    this.placementHintText.setText(text);
    this.placementHintText.setBackgroundColor('#c62828dd');
    this.placementHintText.setPosition(worldX, worldY);
    this.placementHintText.setVisible(true);
    this.time.delayedCall(1200, () => {
      if (this.selectedType === null) {
        this.placementHintText.setVisible(false);
      }
    });
  }

  /**
   * Phase 31: single cleanup path for a building leaving the world, whether
   * it was destroyed by raiders or bulldozed by the player. gameState has
   * already dropped it from its own records by the time this runs, so
   * everything here is purely visual/scene-local: its sprite (plus the
   * destruction animation for a raid kill), its animals, its idle accents,
   * and any units it trained - a garrison dies with its Barracks.
   */
  private setupBuildingRemoval(): void {
    gameEvents.on('building-removed', ({ building, reason }: BuildingRemovedPayload) => {
      const visual = this.buildingVisuals.get(building.id);
      if (visual) {
        this.buildingVisuals.delete(building.id);

        for (const animalImage of visual.animalImages) {
          this.tweens.killTweensOf(animalImage);
          animalImage.destroy();
        }
        for (const accentObject of visual.accentObjects) {
          this.tweens.killTweensOf(accentObject);
          accentObject.destroy();
        }

        if (reason === 'destroyed') {
          this.playDestructionAnimation(visual.image, building);
        } else {
          this.tweens.killTweensOf(visual.image);
          visual.image.destroy();
        }
      }

      this.removeUnitsOfBuilding(building.id);
      if (building.type === BuildingType.House) {
        this.removeVillagersForLostHouse();
      }

      if (this.selectedBuildingId === building.id) {
        gameEvents.emit('building-selected', null);
      }

      this.redrawConnectionOutlines();
      this.redrawFenceLines();
      this.redrawHpBars();
      this.redrawMinimap();
    });
  }

  /**
   * Shake, fade, and a puff of dust. The sprite is already detached from
   * buildingVisuals (and from gameState) when this runs, so it's a pure
   * orphan being animated to its own destruction - nothing else can look it
   * up mid-animation. Follows the same killTweensOf-then-destroy discipline
   * the animal/accent cleanup uses, so no tween ever outlives its target.
   */
  private playDestructionAnimation(image: Phaser.GameObjects.Image, building: PlacedBuilding): void {
    const originX = image.x;

    this.tweens.add({
      targets: image,
      x: originX + DESTRUCTION_SHAKE_PX,
      duration: DESTRUCTION_SHAKE_MS,
      yoyo: true,
      repeat: DESTRUCTION_SHAKE_REPEATS,
      ease: 'Sine.easeInOut',
    });

    this.tweens.add({
      targets: image,
      alpha: 0,
      duration: DESTRUCTION_FADE_MS,
      delay: DESTRUCTION_SHAKE_MS * (DESTRUCTION_SHAKE_REPEATS + 1),
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.tweens.killTweensOf(image);
        image.destroy();
      },
    });

    this.spawnDustBurst(building);
  }

  private spawnDustBurst(building: PlacedBuilding): void {
    const center = this.tileCenter(building);
    this.spawnDustBurstAt(center.x, center.y);
  }

  /** Extracted from spawnDustBurst (Phase 57) so Raider Camp destruction - which has no PlacedBuilding/tileCenter to read a footprint from - can reuse the same dust-motes burst at a plain world point. */
  private spawnDustBurstAt(centerX: number, centerY: number): void {
    const center = { x: centerX, y: centerY };

    for (let index = 0; index < DUST_PUFF_COUNT; index++) {
      const radius = Phaser.Math.Between(DUST_PUFF_RADIUS_MIN, DUST_PUFF_RADIUS_MAX);
      const puff = this.add
        .circle(center.x, center.y, radius, DUST_PUFF_COLOR, 0.7)
        .setDepth(DUST_DEPTH);

      this.tweens.add({
        targets: puff,
        x: center.x + Phaser.Math.Between(-DUST_PUFF_SPREAD_PX, DUST_PUFF_SPREAD_PX),
        y: center.y + Phaser.Math.Between(-DUST_PUFF_SPREAD_PX, DUST_PUFF_SPREAD_PX),
        alpha: 0,
        scale: 1.6,
        duration: Phaser.Math.Between(DUST_PUFF_DURATION_MIN_MS, DUST_PUFF_DURATION_MAX_MS),
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.tweens.killTweensOf(puff);
          puff.destroy();
        },
      });
    }
  }

  /**
   * A destroyed House takes its population with it (gameState recomputes
   * total population from the House count every tick), so the same number of
   * villager sprites has to go too or the town would keep visibly bustling
   * with people it no longer houses. Removed LIFO, mirroring the order
   * spawnVillagersForHouse added them under VILLAGER_CAP.
   */
  private removeVillagersForLostHouse(): void {
    const removeCount = Math.min(POPULATION_PER_HOUSE, this.villagers.length);
    for (let index = 0; index < removeCount; index++) {
      const villager = this.villagers.pop();
      if (!villager) {
        break;
      }
      this.tweens.killTweensOf(villager);
      villager.destroy();
    }
  }

  /** Units are owned by the building that trained them, so they go when it does. */
  private removeUnitsOfBuilding(buildingId: string): void {
    const survivors: CombatUnit[] = [];
    for (const unit of this.cowboyUnits) {
      if (unit.barracksId !== buildingId) {
        survivors.push(unit);
        continue;
      }
      unit.moveTween?.stop();
      this.tweens.killTweensOf(unit.image);
      unit.image.destroy();
    }
    this.cowboyUnits = survivors;
    this.selectedUnits = this.selectedUnits.filter((unit) => unit.barracksId !== buildingId);
    this.cowboySelectionHintText.setVisible(this.selectedUnits.length > 0);
  }

  /**
   * Phase 43: extracted from tryPlaceAt so commitLinePlacement can call it
   * once per tile of a drag-line - returns whether a building was actually
   * placed (a tile failing getPlacementRejection just returns false, letting
   * the line skip it silently) rather than void, and deliberately does NOT
   * play the placement sound itself, since a multi-tile line plays it once
   * for the whole line instead of once per tile (see tryPlaceAt/
   * commitLinePlacement, the two callers).
   */
  private placeBuildingAt(tileX: number, tileY: number): boolean {
    if (this.selectedType === null) {
      return false;
    }

    const building = placeBuilding(tileX, tileY, this.selectedType);
    if (!building) {
      return false;
    }

    // A freshly placed Barracks/Horsery always starts with zero trained units
    // (see gameState.ts), so there is nothing to spawn here - Cowboy/mounted-
    // Cowboy units only ever appear via the 'cowboy-trained'/'mounted-cowboy-
    // trained' events. A loaded save's restoreBuildingVisual, below, is the
    // one path that DOES need to spawn units up front (a restored Barracks
    // can already have a nonzero cowboyCount).
    this.createVisualForBuilding(building);
    return true;
  }

  /**
   * The visual-creation half of placeBuildingAt (image + animals + accents +
   * villagers), split out in Phase 52 so a loaded save's restoreBuildingVisual
   * can build the exact same visual for a building it didn't just place
   * through gameState.placeBuilding - avoiding a second, parallel
   * visual-creation path that could drift from this one.
   */
  private createVisualForBuilding(building: PlacedBuilding): BuildingVisual {
    const image = this.add
      .image(
        building.tileX * TILE_SIZE,
        building.tileY * TILE_SIZE,
        BUILDING_ATLAS_KEY,
        buildingTextureKey(building.type, building.houseTier),
      )
      .setOrigin(0, 0)
      .setDepth(10);

    const visual: BuildingVisual = {
      building,
      image,
      animalImages: [],
      accentObjects: [],
      nightAccents: [],
    };
    this.buildingVisuals.set(building.id, visual);
    if (building.type === BuildingType.Fence) {
      // connections-updated already fired before this building's visual existed; redraw now that it does.
      this.redrawFenceLines();
    }
    this.redrawAnimalSprites(visual);
    this.createBuildingAccents(visual);
    if (building.type === BuildingType.House) {
      this.spawnVillagersForHouse(building);
    }
    return visual;
  }

  /**
   * Phase 52: the load-time counterpart to placeBuildingAt. Builds the exact
   * same visual (createVisualForBuilding) but additionally re-spawns any
   * garrisoned Cowboy/Cowboy-on-Horse units the restored building's
   * cowboyHp/mountedCowboyHp arrays record - a freshly-placed building can
   * never have these (see placeBuildingAt's comment), but a loaded one can.
   * Spawned at the unit's static home slot (getCowboySlotPosition/
   * getMountedCowboySlotPosition), not wherever it was standing when the save
   * was made - see persistence.ts's doc comment for why live unit position is
   * out of scope for this phase.
   */
  private restoreBuildingVisual(building: PlacedBuilding): void {
    this.createVisualForBuilding(building);

    if (building.type === BuildingType.Barracks) {
      for (let index = 0; index < building.cowboyHp.length; index++) {
        if (building.cowboyHp[index] > 0) {
          this.spawnCowboyUnit(building, index);
        }
      }
    } else if (building.type === BuildingType.Horsery) {
      for (let index = 0; index < building.mountedCowboyHp.length; index++) {
        if (building.mountedCowboyHp[index] > 0) {
          this.spawnMountedCowboyUnit(building, index);
        }
      }
    }
  }

  private tryPlaceAt(pointer: Phaser.Input.Pointer): void {
    if (this.selectedType === null) {
      return;
    }

    const { tileX, tileY } = this.pointerToTile(pointer);
    if (!this.placeBuildingAt(tileX, tileY)) {
      return;
    }

    playPlacementSound();
    this.applyShiftRepeatPolicy();
  }

  /** Building-type-gated idle-animation accents (Phase 19); only these 5 types get one, everything else gets nothing. */
  private createBuildingAccents(visual: BuildingVisual): void {
    const { building } = visual;
    const originX = building.tileX * TILE_SIZE;
    const originY = building.tileY * TILE_SIZE;

    switch (building.type) {
      case BuildingType.Well:
        visual.accentObjects.push(this.createWellCrankAccent(originX, originY));
        break;
      case BuildingType.Warehouse:
        visual.accentObjects.push(this.createWarehouseDoorAccent(originX, originY));
        break;
      case BuildingType.Supermarket:
        visual.accentObjects.push(this.createSupermarketAwningAccent(originX, originY));
        break;
      case BuildingType.ChickenFarm:
        visual.accentObjects.push(this.createChickenDoorAccent(originX, originY));
        break;
      case BuildingType.House:
        visual.accentObjects.push(...this.createHouseSmokeAccents(originX, originY));
        break;
      default:
        break;
    }

    this.createNightAccents(visual, originX, originY);
  }

  /**
   * Phase 34: the night-only half of a building's accents. Created here with
   * everything else (never at a phase boundary) and simply held at alpha 0
   * through the day, so a phase change is a tween on existing objects rather
   * than a create/destroy churn across every House on the map.
   */
  private createNightAccents(visual: BuildingVisual, originX: number, originY: number): void {
    const { building } = visual;

    if (building.type === BuildingType.House) {
      // Sits over the House's front window, centred on its 1x1 footprint.
      const light = this.createAccentImage(originX + 12, originY + 16, 'HouseWindowLight').setOrigin(0, 0);
      visual.nightAccents.push(light);
      visual.accentObjects.push(light);
    }

    if (building.type === BuildingType.Barracks) {
      // Pitched just outside the Barracks' footprint, in its yard.
      const fire = this.createAccentImage(originX + 4, originY + 46, 'Campfire').setOrigin(0, 0);
      visual.nightAccents.push(fire);
      visual.accentObjects.push(fire);

      // Flicker runs permanently; it's only ever visible when the alpha tween
      // below has faded the fire in, so there's nothing to start/stop.
      this.tweens.add({
        targets: fire,
        scaleY: 1.15,
        duration: CAMPFIRE_FLICKER_MS,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // Read from the overlay's live alpha rather than a binary day/night check,
    // so a House placed halfway through dusk lights its window to match the
    // current darkness instead of popping to fully lit (or staying dark until
    // the next phase change).
    const nightFactor = this.nightOverlay.getNightFactor();
    for (const accent of visual.nightAccents) {
      accent.setAlpha(nightFactor * NIGHT_ACCENT_MAX_ALPHA);
    }
  }

  private createAccentImage(x: number, y: number, kind: AccentKind): Phaser.GameObjects.Image {
    return this.add.image(x, y, ACCENTS_ATLAS_KEY, accentTextureKey(kind)).setDepth(ACCENT_DEPTH);
  }

  /** Crank bar pivots from its own center, between the well's support posts; starts at -15deg so the yoyo tween sweeps it through 0 up to +15deg. */
  private createWellCrankAccent(originX: number, originY: number): Phaser.GameObjects.Image {
    const crank = this.createAccentImage(originX + 16, originY + 2, 'WellCrank').setOrigin(0.5, 0.5);
    crank.setAngle(-WELL_CRANK_ANGLE_DEG);

    this.tweens.add({
      targets: crank,
      angle: WELL_CRANK_ANGLE_DEG,
      duration: WELL_CRANK_TWEEN_MS,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    return crank;
  }

  /**
   * Pivots from its top edge (hinge) rather than a symmetric center swing:
   * a real hay-loft door only opens outward one way, and a top-hinged swing
   * reads more clearly at this scale than the doc's suggested -8/+8 center
   * rotation, which looked like the whole door wobbling in place.
   */
  private createWarehouseDoorAccent(originX: number, originY: number): Phaser.GameObjects.Image {
    const door = this.createAccentImage(originX + 28, originY + 24, 'WarehouseDoor').setOrigin(0.5, 0);

    this.tweens.add({
      targets: door,
      angle: WAREHOUSE_DOOR_SWING_ANGLE_DEG,
      duration: WAREHOUSE_DOOR_TWEEN_MS,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    return door;
  }

  private createSupermarketAwningAccent(originX: number, originY: number): Phaser.GameObjects.Image {
    const awning = this.createAccentImage(originX + 32, originY + 8, 'SupermarketAwning').setOrigin(0.5, 0.5);
    awning.setScale(SUPERMARKET_AWNING_SCALE_X_MIN, 1);

    this.tweens.add({
      targets: awning,
      scaleX: SUPERMARKET_AWNING_SCALE_X_MAX,
      duration: SUPERMARKET_AWNING_TWEEN_MS,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    return awning;
  }

  /**
   * Duration and repeatDelay are randomized once per building instance (not
   * per repeat cycle - Phaser tween repeatDelay is fixed once the tween is
   * created) so multiple chicken farms don't flap in lockstep; each single
   * building's own cycle stays regular.
   */
  private createChickenDoorAccent(originX: number, originY: number): Phaser.GameObjects.Image {
    const door = this.createAccentImage(originX + 16, originY + 28, 'ChickenDoor').setOrigin(0.5, 1);
    const duration = Phaser.Math.Between(CHICKEN_DOOR_DURATION_MIN_MS, CHICKEN_DOOR_DURATION_MAX_MS);
    const repeatDelay = Phaser.Math.Between(CHICKEN_DOOR_REPEAT_DELAY_MIN_MS, CHICKEN_DOOR_REPEAT_DELAY_MAX_MS);
    const delay = Phaser.Math.Between(0, CHICKEN_DOOR_REPEAT_DELAY_MAX_MS);

    this.tweens.add({
      targets: door,
      scaleY: CHICKEN_DOOR_SCALE_Y_CLOSED,
      duration,
      delay,
      repeatDelay,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    return door;
  }

  /**
   * Three plain circles rather than atlas sprites - a fading puff has no
   * silhouette detail worth pixel-art treatment. Each tween's `repeat: -1`
   * automatically snaps y/alpha back to their starting values before
   * re-running, so no manual reset is needed; the staggered `delay` per
   * puff is what keeps them from rising in sync.
   */
  private createHouseSmokeAccents(originX: number, originY: number): Phaser.GameObjects.Arc[] {
    const startX = originX + 16;
    const startY = originY + 2;
    const puffs: Phaser.GameObjects.Arc[] = [];

    for (let index = 0; index < HOUSE_SMOKE_PUFF_COUNT; index++) {
      const puff = this.add
        .circle(startX, startY, HOUSE_SMOKE_PUFF_RADIUS, HOUSE_SMOKE_COLOR, HOUSE_SMOKE_START_ALPHA)
        .setDepth(ACCENT_DEPTH);
      const duration = Phaser.Math.Between(HOUSE_SMOKE_DURATION_MIN_MS, HOUSE_SMOKE_DURATION_MAX_MS);

      this.tweens.add({
        targets: puff,
        y: startY - HOUSE_SMOKE_RISE_PX,
        alpha: 0,
        duration,
        delay: index * HOUSE_SMOKE_STAGGER_MS,
        repeat: -1,
        ease: 'Sine.easeOut',
      });

      puffs.push(puff);
    }

    return puffs;
  }

  private setupConnectionVisuals(): void {
    this.connectionGraphics = this.add.graphics();
    this.connectionGraphics.setDepth(20);

    gameEvents.on('connections-updated', () => this.redrawConnectionOutlines());
  }

  private redrawConnectionOutlines(): void {
    this.connectionGraphics.clear();
    this.connectionGraphics.lineStyle(3, 0x00ff00, 1);

    for (const { building } of this.buildingVisuals.values()) {
      if (!building.connected) {
        continue;
      }
      const { width, height } = BUILDING_DEFINITIONS[building.type].size;
      const px = building.tileX * TILE_SIZE;
      const py = building.tileY * TILE_SIZE;
      this.connectionGraphics.strokeRect(px + 1, py + 1, width * TILE_SIZE - 2, height * TILE_SIZE - 2);
    }
  }

  private setupFenceVisuals(): void {
    this.fenceLineGraphics = this.add.graphics();
    this.fenceLineGraphics.setDepth(15);

    gameEvents.on('connections-updated', () => this.redrawFenceLines());
  }

  private redrawFenceLines(): void {
    this.fenceLineGraphics.clear();
    this.fenceLineGraphics.lineStyle(4, FENCE_LINE_COLOR, 1);

    for (const { fromId, toId } of getFenceLinks()) {
      const from = this.buildingVisuals.get(fromId);
      const to = this.buildingVisuals.get(toId);
      if (!from || !to) {
        continue;
      }
      const fromCenter = this.tileCenter(from.building);
      const toCenter = this.tileCenter(to.building);
      this.fenceLineGraphics.lineBetween(fromCenter.x, fromCenter.y, toCenter.x, toCenter.y);
    }
  }

  /**
   * Phase 48: Chain Encyclopedia & Resource Tooltips' map-side half. Mirrors
   * redrawConnectionOutlines' one-shared-Graphics-object approach rather than
   * a GameObject per highlighted building - a rect stroke per currently-
   * placed building whose type produces or consumes the ResourceHudPanel-
   * selected resource (config/resourceGraph.ts's getResourceChainBuildingTypes,
   * itself derived from BUILDING_DEFINITIONS/HOUSE_TIER_CONFIG/the sell-rate
   * tables - no new PlacedBuilding state, purely informational). Redrawn on
   * selection change and on 'connections-updated' (fired on every placement/
   * removal, regardless of building type) so a newly-placed matching building
   * lights up without a dedicated 'building-placed' listener.
   */
  private setupChainView(): void {
    this.chainViewGraphics = this.add.graphics();
    this.chainViewGraphics.setDepth(21);

    gameEvents.on('resource-selected', (key: ResourceKey | null) => {
      this.selectedResourceKey = key;
      this.redrawChainViewHighlight();
    });
    gameEvents.on('connections-updated', () => this.redrawChainViewHighlight());

    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.selectedResourceKey !== null) {
        gameEvents.emit('resource-selected', null);
      }
    });
  }

  private redrawChainViewHighlight(): void {
    this.chainViewGraphics.clear();
    if (!this.selectedResourceKey || !this.chainViewVisible) {
      return;
    }

    const chainTypes = getResourceChainBuildingTypes(this.selectedResourceKey);
    this.chainViewGraphics.lineStyle(3, CHAIN_VIEW_HIGHLIGHT_COLOR, 1);

    for (const building of getPlacedBuildings()) {
      if (!chainTypes.has(building.type)) {
        continue;
      }
      const { width, height } = BUILDING_DEFINITIONS[building.type].size;
      const px = building.tileX * TILE_SIZE;
      const py = building.tileY * TILE_SIZE;
      this.chainViewGraphics.strokeRect(px + 1, py + 1, width * TILE_SIZE - 2, height * TILE_SIZE - 2);
    }
  }

  /** 'C' toggles the overlay's visibility without discarding the current selection - unlike Escape/re-click, which clear it outright. No-op if nothing is selected. */
  private toggleChainViewVisibility(): void {
    if (!this.selectedResourceKey) {
      return;
    }
    this.chainViewVisible = !this.chainViewVisible;
    this.redrawChainViewHighlight();
  }

  private setupHpBarVisuals(): void {
    this.hpBarGraphics = this.add.graphics();
    this.hpBarGraphics.setDepth(HP_BAR_DEPTH);
    this.unitHpBarGraphics = this.add.graphics();
    this.unitHpBarGraphics.setDepth(HP_BAR_DEPTH);

    // Redrawn every tick (cheap at this building count) rather than only on
    // damage events, since no damage source exists yet - this keeps the bars
    // correct automatically once one is added later.
    gameEvents.on('production-tick', () => this.redrawHpBars());
    // Phase 40: unit HP doesn't regenerate, so this only ever needs to react
    // to combat (runRaidCombatTick already calls it directly after damage is
    // applied) - but it's also hooked to the same production-tick cadence as
    // the building bars above so a unit trained/healed mid-tick still reads
    // correctly even outside an active raid.
    gameEvents.on('production-tick', () => this.redrawUnitHpBars());
  }

  private redrawHpBars(): void {
    this.hpBarGraphics.clear();

    for (const { building } of this.buildingVisuals.values()) {
      const { size, maxHp } = BUILDING_DEFINITIONS[building.type];
      if (building.hp >= maxHp) {
        continue;
      }

      const barWidth = size.width * TILE_SIZE - 4;
      const px = building.tileX * TILE_SIZE + 2;
      const py = building.tileY * TILE_SIZE - HP_BAR_HEIGHT - HP_BAR_MARGIN_ABOVE_BUILDING;
      const ratio = Math.max(0, building.hp / maxHp);

      this.hpBarGraphics.fillStyle(HP_BAR_BG_COLOR, 1);
      this.hpBarGraphics.fillRect(px, py, barWidth, HP_BAR_HEIGHT);
      this.hpBarGraphics.fillStyle(ratio > 0 ? HP_BAR_FILL_COLOR : HP_BAR_EMPTY_COLOR, 1);
      this.hpBarGraphics.fillRect(px, py, barWidth * ratio, HP_BAR_HEIGHT);
    }
  }

  /**
   * Phase 40: one shared Graphics object for every live Cowboy/Cowboy-on-Horse
   * and every live raider, redrawn wholesale each call - same discipline as
   * redrawHpBars, just iterating cowboyUnits/raiders instead of
   * buildingVisuals. Player units hide their bar at full HP (matching the
   * building convention); raiders always show theirs since they're
   * transient, combat-only entities where "how close is this one to dying"
   * is useful at a glance even at full health. Phase 57: every live Raider
   * Camp gets the same always-shown treatment as a raider - it's a standing
   * objective the player is actively expected to whittle down.
   */
  private redrawUnitHpBars(): void {
    this.unitHpBarGraphics.clear();

    for (const unit of this.cowboyUnits) {
      const hp = this.getUnitHp(unit);
      if (hp === null) {
        continue;
      }
      const maxHp = unit.kind === 'cowboy' ? COWBOY_MAX_HP : MOUNTED_COWBOY_MAX_HP;
      if (hp >= maxHp) {
        continue;
      }
      this.drawUnitHpBar(unit.image.x, unit.image.y, hp, maxHp);
    }

    for (const raider of this.raiders) {
      if (raider.hp <= 0) {
        continue;
      }
      this.drawUnitHpBar(raider.image.x, raider.image.y, raider.hp, raider.maxHp);
    }

    for (const camp of getRaiderCamps()) {
      this.drawUnitHpBar(camp.x, camp.y, camp.hp, camp.maxHp, RAIDER_CAMP_SPRITE_HALF_HEIGHT_PX);
    }
  }

  /** Reads a unit's live HP straight out of its owning building's parallel HP array - gameState stays the single source of truth for unit HP, same pattern isCowboyUnitAlive already uses. */
  private getUnitHp(unit: CombatUnit): number | null {
    const building = getBuildingById(unit.barracksId);
    if (!building) {
      return null;
    }
    const hpArray = unit.kind === 'cowboy' ? building.cowboyHp : building.mountedCowboyHp;
    return hpArray[unit.index] ?? null;
  }

  /**
   * Same two-fill-rect background/fill technique as redrawHpBars, just
   * centered on a unit's live x/y instead of anchored to a building's tile
   * footprint. `spriteHalfHeightPx` (Phase 57) defaults to a small unit's
   * half-height but lets a bigger sprite (a Raider Camp) push its bar up far
   * enough to clear its own footprint.
   */
  private drawUnitHpBar(
    centerX: number,
    centerY: number,
    hp: number,
    maxHp: number,
    spriteHalfHeightPx: number = UNIT_SPRITE_HALF_HEIGHT_PX,
  ): void {
    const px = centerX - UNIT_HP_BAR_WIDTH / 2;
    const py = centerY - spriteHalfHeightPx - UNIT_HP_BAR_MARGIN_ABOVE_PX - UNIT_HP_BAR_HEIGHT;
    const ratio = Math.max(0, hp / maxHp);

    this.unitHpBarGraphics.fillStyle(HP_BAR_BG_COLOR, 1);
    this.unitHpBarGraphics.fillRect(px, py, UNIT_HP_BAR_WIDTH, UNIT_HP_BAR_HEIGHT);
    this.unitHpBarGraphics.fillStyle(ratio > 0 ? HP_BAR_FILL_COLOR : HP_BAR_EMPTY_COLOR, 1);
    this.unitHpBarGraphics.fillRect(px, py, UNIT_HP_BAR_WIDTH * ratio, UNIT_HP_BAR_HEIGHT);
  }

  /**
   * Phase 34: understaffed / upkeep-unpaid badge over the building sprite.
   *
   * These two states are by far the most common reason a building silently
   * produces nothing, and until now the only way to find out was to click the
   * building and read the info panel - which is exactly why Bug 1's bogus "no
   * trees nearby" message went unchallenged for so long. Redrawn on the
   * production tick alongside the HP bars, since both staffing and upkeep are
   * recomputed from scratch every tick in gameState.
   */
  private setupStatusBadges(): void {
    this.statusBadgeGraphics = this.add.graphics().setDepth(STATUS_BADGE_DEPTH);
    gameEvents.on('production-tick', () => this.redrawStatusBadges());
  }

  private redrawStatusBadges(): void {
    this.statusBadgeGraphics.clear();

    for (const { building } of this.buildingVisuals.values()) {
      const workersRequired = getWorkersRequired(building.type);
      const understaffed = workersRequired > 0 && !building.staffed;
      if (!understaffed && !building.disabled) {
        continue;
      }

      // Unpaid outranks understaffed: an unpaid building has money as its
      // blocker, and the player fixing staffing first would achieve nothing.
      const color = building.disabled ? STATUS_BADGE_UNPAID_COLOR : STATUS_BADGE_UNSTAFFED_COLOR;
      const { width } = BUILDING_DEFINITIONS[building.type].size;
      const x = building.tileX * TILE_SIZE + width * TILE_SIZE - STATUS_BADGE_SIZE - 1;
      const y = building.tileY * TILE_SIZE + 1;

      this.statusBadgeGraphics.fillStyle(STATUS_BADGE_OUTLINE_COLOR, 0.9);
      this.statusBadgeGraphics.fillRect(x - 1, y - 1, STATUS_BADGE_SIZE + 2, STATUS_BADGE_SIZE + 2);
      this.statusBadgeGraphics.fillStyle(color, 1);
      this.statusBadgeGraphics.fillRect(x, y, STATUS_BADGE_SIZE, STATUS_BADGE_SIZE);
      // A dark notch punched out of the middle reads as an exclamation mark
      // at this size, which two solid colours alone would not.
      this.statusBadgeGraphics.fillStyle(STATUS_BADGE_OUTLINE_COLOR, 1);
      this.statusBadgeGraphics.fillRect(x + 3, y + 1, 2, 4);
      this.statusBadgeGraphics.fillRect(x + 3, y + 6, 2, 1);
    }
  }

  /**
   * Phase 34: the harvest radius, drawn both while previewing a harvester's
   * placement and while one is selected. Deliberately drawn as a square rather
   * than a circle: findNearestVegetation/countVegetationInRadius both use a
   * square (Chebyshev) radius test, so a circle would be a picture of a rule
   * the game does not implement - the corners would look out of range and
   * still be harvested.
   */
  private setupHarvestRadiusRing(): void {
    this.harvestRingGraphics = this.add.graphics().setDepth(HARVEST_RING_DEPTH);

    gameEvents.on('building-selected', () => this.redrawHarvestRing());
    gameEvents.on('cancel-placement', () => this.redrawHarvestRing());
    // Vegetation appearing/disappearing inside the ring flips its colour.
    gameEvents.on('vegetation-added', () => this.redrawHarvestRing());
    gameEvents.on('vegetation-removed', () => this.redrawHarvestRing());
    gameEvents.on('game-reset', () => this.harvestRingGraphics.clear());
  }

  /**
   * Drawn for whichever of the two contexts is live: the placement preview
   * takes priority (the player is actively deciding where to put one), and
   * otherwise the currently selected building's own radius is shown.
   */
  private redrawHarvestRing(previewTileX?: number, previewTileY?: number): void {
    this.harvestRingGraphics.clear();

    if (this.selectedType !== null) {
      const harvest = BUILDING_DEFINITIONS[this.selectedType].harvest;
      if (harvest && previewTileX !== undefined && previewTileY !== undefined) {
        const center = getHarvestCenterTile(previewTileX, previewTileY, this.selectedType);
        this.drawHarvestRing(center.tileX, center.tileY, harvest.radiusTiles, harvest.kind);
      }
      return;
    }

    const selected = this.selectedBuildingId ? getBuildingById(this.selectedBuildingId) : null;
    const harvest = selected ? BUILDING_DEFINITIONS[selected.type].harvest : null;
    if (!selected || !harvest) {
      return;
    }
    const center = getHarvestCenterTile(selected.tileX, selected.tileY, selected.type);
    this.drawHarvestRing(center.tileX, center.tileY, harvest.radiusTiles, harvest.kind);
  }

  private drawHarvestRing(
    centerTileX: number,
    centerTileY: number,
    radiusTiles: number,
    kind: VegetationEntity['kind'],
  ): void {
    const hasVegetation = countVegetationInRadius(kind, centerTileX, centerTileY, radiusTiles) > 0;
    const color = hasVegetation ? HARVEST_RING_COLOR : HARVEST_RING_EMPTY_COLOR;

    const px = (centerTileX - radiusTiles) * TILE_SIZE;
    const py = (centerTileY - radiusTiles) * TILE_SIZE;
    const size = (radiusTiles * 2 + 1) * TILE_SIZE;

    this.harvestRingGraphics.fillStyle(color, HARVEST_RING_FILL_ALPHA);
    this.harvestRingGraphics.fillRect(px, py, size, size);
    this.harvestRingGraphics.lineStyle(2, color, 0.9);
    this.harvestRingGraphics.strokeRect(px, py, size, size);
  }

  /**
   * Phase 53: Rally Points & Training Queue. The flag itself is drawn for
   * every Barracks/Horsery that currently has a rallyPoint set (not just the
   * selected one - unlike the harvest ring, a rally point is standing town
   * state a player wants to see at a glance, not a per-selection preview).
   * The "arm a pick" mode is a separate concern from drawing: it's a single
   * scalar (rallyPointModeBuildingId) consumed by setupUnitControl's
   * pointerup handler, with its own hint text mirroring
   * cowboySelectionHintText's bottom-anchored style.
   */
  private setupRallyPoints(): void {
    this.rallyPointGraphics = this.add.graphics().setDepth(RALLY_POINT_DEPTH);
    this.rallyPointModeHintText = this.add
      .text(VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT - 8, 'Right-click the ground to set the rally point', {
        fontSize: '14px',
        color: '#ffffff',
        backgroundColor: '#2b1d12cc',
        padding: { x: 6, y: 4 },
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);

    gameEvents.on('rally-point-mode-changed', (buildingId: string | null) => {
      this.rallyPointModeBuildingId = buildingId;
      this.rallyPointModeHintText.setVisible(buildingId !== null);
    });
    gameEvents.on('rally-point-changed', () => this.redrawRallyPoints());
    gameEvents.on('building-removed', () => this.redrawRallyPoints());
    gameEvents.on('game-loaded', () => this.redrawRallyPoints());
    gameEvents.on('game-reset', () => {
      this.rallyPointGraphics.clear();
      this.cancelRallyPointMode();
    });
    // A different building's info panel opening, entering placement mode, or
    // entering demolish mode all cancel an armed pick - the same
    // mode-exclusivity rule setupDemolishMode already applies to itself.
    gameEvents.on('building-selected', (building: PlacedBuilding | null) => {
      if (this.rallyPointModeBuildingId !== null && building?.id !== this.rallyPointModeBuildingId) {
        this.cancelRallyPointMode();
      }
    });
    gameEvents.on('select-building', () => this.cancelRallyPointMode());
    gameEvents.on('demolish-mode-changed', (active: boolean) => {
      if (active) {
        this.cancelRallyPointMode();
      }
    });
  }

  private cancelRallyPointMode(): void {
    if (this.rallyPointModeBuildingId === null) {
      return;
    }
    this.rallyPointModeBuildingId = null;
    this.rallyPointModeHintText.setVisible(false);
    gameEvents.emit('rally-point-mode-changed', null);
  }

  private redrawRallyPoints(): void {
    this.rallyPointGraphics.clear();
    for (const building of getPlacedBuildings()) {
      if (building.rallyPoint) {
        this.drawRallyFlag(building.rallyPoint.x, building.rallyPoint.y);
      }
    }
  }

  private drawRallyFlag(x: number, y: number): void {
    const topY = y - RALLY_POINT_POLE_HEIGHT_PX;
    this.rallyPointGraphics.lineStyle(2, RALLY_POINT_POLE_COLOR, 1);
    this.rallyPointGraphics.lineBetween(x, y, x, topY);
    this.rallyPointGraphics.fillStyle(RALLY_POINT_FLAG_COLOR, 1);
    this.rallyPointGraphics.fillTriangle(
      x,
      topY,
      x,
      topY + RALLY_POINT_FLAG_HEIGHT_PX,
      x + RALLY_POINT_FLAG_WIDTH_PX,
      topY + RALLY_POINT_FLAG_HEIGHT_PX / 2,
    );
  }

  /**
   * Phase 34: the day/night cycle's visual side. The cycle itself is state
   * (gameState owns dayNumber/phase/elapsed and emits 'day-phase-changed');
   * this only reacts to it - darken the screen, light the windows, cool the
   * vegetation, and announce the transition.
   */
  private setupDayNightCycle(): void {
    this.nightOverlay = new NightOverlay(this);
    this.applyVegetationTint(getDayPhase());

    gameEvents.on('day-phase-changed', ({ dayNumber, phase }: DayPhaseChange) => {
      this.applyVegetationTint(phase);
      this.fadeNightAccents(phase);
      this.timerText.setText(this.formatTimerText());
      this.showPhaseNotice(dayNumber, phase);
    });
  }

  /** Cool blue-grey multiply tint on every tree/cactus at night; cleared at dawn. */
  private applyVegetationTint(phase: DayPhase): void {
    for (const image of this.vegetationImages.values()) {
      if (phase === 'night') {
        image.setTint(VEGETATION_NIGHT_TINT);
      } else {
        image.clearTint();
      }
    }
  }

  private fadeNightAccents(phase: DayPhase): void {
    const target = phase === 'night' ? NIGHT_ACCENT_MAX_ALPHA : 0;
    for (const visual of this.buildingVisuals.values()) {
      for (const accent of visual.nightAccents) {
        this.tweens.add({
          targets: accent,
          alpha: target,
          duration: NIGHT_ACCENT_FADE_MS,
          ease: 'Sine.easeInOut',
        });
      }
    }
  }

  /**
   * Reuses the raid notice's slot/style rather than adding a third HUD text
   * object; suppressed while a raid is on screen, which is strictly the more
   * urgent message (and raids only happen at night, so this would otherwise
   * fight with them at exactly the wrong moment).
   */
  private showPhaseNotice(dayNumber: number, phase: DayPhase): void {
    if (this.raidActive) {
      return;
    }
    this.raidNoticeText.setText(
      phase === 'night' ? `Night falls - Day ${dayNumber}` : `Sunrise - Day ${dayNumber}`,
    );
    this.raidNoticeText.setVisible(true);
    this.time.delayedCall(4000, () => {
      if (!this.raidActive) {
        this.raidNoticeText.setVisible(false);
      }
    });
  }

  /**
   * Phase 34: audio wiring. The engine itself (src/audio/sound.ts) is
   * scene-agnostic; this is the only place that knows both where things are
   * in the world and what just happened to them.
   */
  private setupAudio(): void {
    installAudioUnlock();
    setAudioGameSpeed(this.gameSpeed);

    gameEvents.on('building-removed', ({ building, reason }: BuildingRemovedPayload) => {
      const center = this.tileCenter(building);
      playWorldSound(reason === 'destroyed' ? 'buildingCollapse' : 'clear', center.x, center.y);
    });

    this.scheduleAnimalSounds();
    gameEvents.on('game-reset', () => this.scheduleAnimalSounds());
  }

  /**
   * Phase 34 animal ambience. One shared self-rescheduling timer picks ONE
   * on-screen animal per firing rather than every animal owning its own timer:
   * a full town can hold 30+ critters, and 30 independent timers would both
   * cost more and (far worse) all try to play at once. The engine's own
   * per-sound minGapMs is the final backstop.
   */
  private scheduleAnimalSounds(): void {
    this.animalSoundTimer?.remove();
    const delay = Phaser.Math.Between(ANIMAL_SOUND_MIN_DELAY_MS, ANIMAL_SOUND_MAX_DELAY_MS);

    this.animalSoundTimer = this.time.delayedCall(delay, () => {
      this.playRandomAnimalSound();
      this.scheduleAnimalSounds();
    });
  }

  private playRandomAnimalSound(): void {
    const candidates: { x: number; y: number; sound: 'animalChicken' | 'animalPig' | 'animalCow' }[] = [];
    const worldView = this.cameras.main.worldView;

    for (const visual of this.buildingVisuals.values()) {
      const animalConfig = BUILDING_DEFINITIONS[visual.building.type].animal;
      if (!animalConfig || visual.animalImages.length === 0) {
        continue;
      }
      const sound =
        animalConfig.animalLabel === 'Chicken'
          ? 'animalChicken'
          : animalConfig.animalLabel === 'Pig'
            ? 'animalPig'
            : 'animalCow';

      for (const image of visual.animalImages) {
        // Cheap pre-cull so the random pick can't keep landing on off-screen
        // animals and producing silence (the engine would drop them anyway).
        if (worldView.contains(image.x, image.y)) {
          candidates.push({ x: image.x, y: image.y, sound });
        }
      }
    }

    if (candidates.length === 0) {
      return;
    }
    const pick = candidates[Phaser.Math.Between(0, candidates.length - 1)];
    playWorldSound(pick.sound, pick.x, pick.y);
  }

  /**
   * Phase 34: footsteps for *selected* units only, and globally throttled.
   * Per-step audio for all ~30 wandering villagers and animals was explicitly
   * ruled out - at that density it stops being footsteps and becomes rain.
   */
  private emitFootstepTicks(): void {
    if (this.selectedUnits.length === 0 || this.gameSpeed === 0) {
      return;
    }
    if (this.time.now - this.lastFootstepAt < FOOTSTEP_INTERVAL_MS) {
      return;
    }

    const moving = this.selectedUnits.find((unit) => unit.moveTween !== null);
    if (!moving) {
      return;
    }

    this.lastFootstepAt = this.time.now;
    playWorldSound('footstep', moving.image.x, moving.image.y);
  }

  /**
   * Phase 34: N cowboys firing in one combat tick is N shots, and a defended
   * town can field 10-15 shooters. Below VOLLEY_SHOT_THRESHOLD each shot is
   * its own voice with a small random stagger (a perfectly simultaneous
   * volley sounds like a single click); above it the whole exchange collapses
   * into one louder "volley" voice, which is both cheaper and closer to what a
   * line of gunfire actually sounds like.
   */
  private playCombatVolley(shots: { x: number; y: number }[]): void {
    if (shots.length === 0) {
      return;
    }

    if (shots.length >= VOLLEY_SHOT_THRESHOLD) {
      const centerX = shots.reduce((sum, shot) => sum + shot.x, 0) / shots.length;
      const centerY = shots.reduce((sum, shot) => sum + shot.y, 0) / shots.length;
      playWorldSound('volley', centerX, centerY);
      return;
    }

    for (const shot of shots) {
      this.time.delayedCall(Phaser.Math.Between(0, GUNSHOT_MAX_STAGGER_MS), () => {
        playWorldSound('gunshot', shot.x, shot.y);
      });
    }
  }

  /**
   * Phase 34: the world used to keep running behind the game-over screen -
   * raiders went on chewing through buildings, tweens went on tweening, and
   * the final net-worth number on screen could be describing a town that no
   * longer existed. Nothing here touches gameState (which has already frozen
   * itself via its own gameOver flag); this is purely stopping the scene.
   */
  private setupGameOverHalt(): void {
    gameEvents.on('game-over', () => {
      this.endRaidWave();
      this.raidCheckTimer?.remove();
      this.raidCheckTimer = null;
      this.raidWarningTimer?.remove();
      this.raidWarningTimer = null;
      this.raidWaveTimer?.remove();
      this.raidWaveTimer = null;
      this.merchantCheckTimer?.remove();
      this.merchantCheckTimer = null;
      this.worldEventCheckTimer?.remove();
      this.worldEventCheckTimer = null;
      this.worldEventNoticeHideTimer?.remove();
      this.worldEventNoticeHideTimer = null;
      this.worldEventNoticeText.setVisible(false);
      this.animalSoundTimer?.remove();
      this.animalSoundTimer = null;
      this.hideRaidNotice();

      this.cancelPlacement();
      this.selectedUnits = [];
      this.selectionRingGraphics.clear();
      this.cowboySelectionHintText.setVisible(false);

      // Freezes every remaining timer and tween (villager/animal wander, unit
      // moves, idle accents) in place behind the overlay. resetGame's
      // 'game-reset' handler restores both to the player's chosen speed.
      this.time.timeScale = 0;
      this.tweens.timeScale = 0;
      setAudioGameSpeed(0);
    });
  }

  /**
   * Phase 39: the difficulty/mode picker sits in front of the world before a
   * run starts, and again between a game-over and the next Start click.
   * Reuses setupGameOverHalt's exact pause primitive (time/tween timeScale 0)
   * so nothing - production, the clock, raid scheduling, wander tweens -
   * advances behind it. setupGameReset's existing 'game-reset' handler is
   * what un-pauses this back to this.gameSpeed; DifficultySelectOverlay's
   * Start button calls resetGame(), which fires that same event, so no
   * separate un-pause path is needed for either the first run or a restart.
   */
  private pauseForPreGameSelection(): void {
    this.time.timeScale = 0;
    this.tweens.timeScale = 0;
    setAudioGameSpeed(0);
  }

  private tileCenter(building: PlacedBuilding): { x: number; y: number } {
    const { width, height } = BUILDING_DEFINITIONS[building.type].size;
    return {
      x: building.tileX * TILE_SIZE + (width * TILE_SIZE) / 2,
      y: building.tileY * TILE_SIZE + (height * TILE_SIZE) / 2,
    };
  }

  private setupAnimalVisuals(): void {
    gameEvents.on('animal-bought', (building: PlacedBuilding) => {
      const visual = this.buildingVisuals.get(building.id);
      if (visual) {
        this.redrawAnimalSprites(visual);
      }
    });
  }

  /**
   * Phase 46: swaps a House's sprite frame the moment gameState.runHouseNeeds
   * actually flips its tier, plus a small non-audio feedback cue (a scale
   * pulse on upgrade, a brief red tint flash on downgrade) so the change
   * reads as an event rather than a silent texture swap - the same
   * lightweight-tween-only treatment Phase 19's idle accents use, no new
   * sound asset needed for a rare, non-combat event.
   */
  private setupHouseTierVisuals(): void {
    gameEvents.on('house-tier-changed', ({ building, direction }: HouseTierChangePayload) => {
      const visual = this.buildingVisuals.get(building.id);
      if (!visual) {
        return;
      }

      visual.image.setTexture(BUILDING_ATLAS_KEY, buildingTextureKey(building.type, building.houseTier));

      this.tweens.killTweensOf(visual.image);
      if (direction === 'upgrade') {
        visual.image.setScale(1.25);
        this.tweens.add({ targets: visual.image, scale: 1, duration: 300, ease: 'Back.easeOut' });
      } else {
        visual.image.setTint(0xff8a80);
        this.time.delayedCall(300, () => visual.image.clearTint());
      }
    });
  }

  /** Only called on placement and 'animal-bought' (i.e. when animalCount actually changes), never per production tick. */
  private redrawAnimalSprites(visual: BuildingVisual): void {
    for (const animalImage of visual.animalImages) {
      this.tweens.killTweensOf(animalImage);
      animalImage.destroy();
    }
    visual.animalImages = [];

    const animalConfig = BUILDING_DEFINITIONS[visual.building.type].animal;
    if (!animalConfig) {
      return;
    }

    for (let index = 0; index < visual.building.animalCount; index++) {
      const slot = this.getAnimalSlotPosition(visual.building, index);
      const animalImage = this.add
        .image(slot.x, slot.y, ANIMALS_ATLAS_KEY, animalTextureKey(animalConfig.animalLabel))
        .setDepth(ANIMAL_SPRITE_DEPTH);
      visual.animalImages.push(animalImage);
      this.startAnimalWander(animalImage, slot);
    }
  }

  /**
   * Confined wander: a single yoyo-ing tween drifts the sprite between its
   * slot anchor and a randomized offset point (+ a subtle vertical bob),
   * looping forever. `direction` records which way the sprite faces during
   * the outbound half of the cycle; `onYoyo` (outbound leg finished, tween
   * reverses back toward the anchor) and `onRepeat` (return leg finished,
   * tween restarts outbound) fire exactly at the two points the movement
   * direction flips, so flipping the sprite there is enough to always face
   * the way it's currently moving without tracking position every frame.
   */
  private startAnimalWander(animalImage: Phaser.GameObjects.Image, slot: { x: number; y: number }): void {
    const radiusX = Phaser.Math.Between(ANIMAL_WANDER_RADIUS_MIN, ANIMAL_WANDER_RADIUS_MAX);
    const direction = Math.random() < 0.5 ? -1 : 1;
    const targetX = slot.x + radiusX * direction;
    const targetY = slot.y + Phaser.Math.Between(-ANIMAL_WANDER_BOB_PX, ANIMAL_WANDER_BOB_PX);
    const duration = Phaser.Math.Between(ANIMAL_WANDER_DURATION_MIN_MS, ANIMAL_WANDER_DURATION_MAX_MS);
    const delay = Phaser.Math.Between(0, ANIMAL_WANDER_DELAY_MAX_MS);

    animalImage.setFlipX(direction < 0);

    this.tweens.add({
      targets: animalImage,
      x: targetX,
      y: targetY,
      duration,
      delay,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onYoyo: () => animalImage.setFlipX(direction >= 0),
      onRepeat: () => animalImage.setFlipX(direction < 0),
    });
  }

  /**
   * Deterministic per-index slot: a row of critters just beneath the
   * building's footprint (its yard), wrapping into further rows once a row
   * fills up, so slot N always lands in the same spot and never overlaps
   * the building sprite itself.
   */
  private getAnimalSlotPosition(building: PlacedBuilding, index: number): { x: number; y: number } {
    const { width, height } = BUILDING_DEFINITIONS[building.type].size;
    const footprintPxWidth = width * TILE_SIZE;
    const columns = Math.max(1, Math.floor(footprintPxWidth / ANIMAL_SLOT_STEP));
    const col = index % columns;
    const row = Math.floor(index / columns);

    const rowPxWidth = columns * ANIMAL_SLOT_STEP - ANIMAL_SLOT_GAP;
    const startX =
      building.tileX * TILE_SIZE + (footprintPxWidth - rowPxWidth) / 2 + ANIMAL_SLOT_STEP / 2;
    const startY = building.tileY * TILE_SIZE + height * TILE_SIZE + ANIMAL_SLOT_STEP / 2;

    return {
      x: startX + col * ANIMAL_SLOT_STEP,
      y: startY + row * ANIMAL_SLOT_STEP,
    };
  }

  private setupCowboyVisuals(): void {
    gameEvents.on('cowboy-trained', (building: PlacedBuilding) => {
      // Phase 24: training used to destroy-and-recreate the Barracks' whole cowboy
      // sprite set (redrawCowboySprites), which was harmless while position was
      // purely derived from index. Now that a Cowboy can carry a live position and
      // an in-flight move order, destroying siblings on every train would wipe
      // that out - so this only ever ADDS the one newly trained unit (its slot is
      // always cowboyHp.length - 1, the index gameState.trainCowboy just pushed).
      const unit = this.spawnCowboyUnit(building, building.cowboyHp.length - 1);
      this.sendUnitToRallyPointIfSet(building, unit);
    });

    // Same "only add the newly trained one" rule as 'cowboy-trained' above (Phase 24).
    gameEvents.on('mounted-cowboy-trained', (building: PlacedBuilding) => {
      const unit = this.spawnMountedCowboyUnit(building, building.mountedCowboyHp.length - 1);
      this.sendUnitToRallyPointIfSet(building, unit);
    });
  }

  /**
   * Phase 53: only wired to the 'cowboy-trained'/'mounted-cowboy-trained'
   * spawn path above, deliberately NOT to restoreBuildingVisual's load-time
   * respawn - a loaded save's already-garrisoned units should reappear
   * standing at their slot, not immediately re-march to a rally point on
   * every single load.
   */
  private sendUnitToRallyPointIfSet(building: PlacedBuilding, unit: CombatUnit): void {
    if (building.rallyPoint) {
      this.issueUnitMoveOrder(unit, building.rallyPoint.x, building.rallyPoint.y);
    }
  }

  private spawnCowboyUnit(building: PlacedBuilding, index: number): CombatUnit {
    const slot = this.getCowboySlotPosition(building, index);
    const image = this.add
      .image(slot.x, slot.y, COWBOYS_ATLAS_KEY, COWBOY_TEXTURE_KEY)
      .setDepth(COWBOY_SPRITE_DEPTH);
    const unit: CombatUnit = {
      id: `unit-${this.unitIdCounter++}`,
      image,
      barracksId: building.id,
      index,
      moveTween: null,
      kind: 'cowboy',
      attackTarget: null,
    };
    this.cowboyUnits.push(unit);
    return unit;
  }

  /** Mirrors spawnCowboyUnit exactly, spawning at a Horsery's mounted-slot layout and tagging the unit 'cowboyOnHorse'. */
  private spawnMountedCowboyUnit(building: PlacedBuilding, index: number): CombatUnit {
    const slot = this.getMountedCowboySlotPosition(building, index);
    const image = this.add
      .image(slot.x, slot.y, MOUNTED_COWBOYS_ATLAS_KEY, MOUNTED_COWBOY_TEXTURE_KEY)
      .setDepth(MOUNTED_COWBOY_SPRITE_DEPTH);
    const unit: CombatUnit = {
      id: `unit-${this.unitIdCounter++}`,
      image,
      barracksId: building.id,
      index,
      moveTween: null,
      kind: 'cowboyOnHorse',
      attackTarget: null,
    };
    this.cowboyUnits.push(unit);
    return unit;
  }

  /** Same deterministic row/column slot layout as getAnimalSlotPosition; still used as a Cowboy's spawn point, just no longer as its "current position" for combat. */
  private getCowboySlotPosition(building: PlacedBuilding, index: number): { x: number; y: number } {
    const { width, height } = BUILDING_DEFINITIONS[building.type].size;
    const footprintPxWidth = width * TILE_SIZE;
    const columns = Math.max(1, Math.floor(footprintPxWidth / COWBOY_SLOT_STEP));
    const col = index % columns;
    const row = Math.floor(index / columns);

    const rowPxWidth = columns * COWBOY_SLOT_STEP - COWBOY_SLOT_GAP;
    const startX =
      building.tileX * TILE_SIZE + (footprintPxWidth - rowPxWidth) / 2 + COWBOY_SLOT_STEP / 2;
    const startY = building.tileY * TILE_SIZE + height * TILE_SIZE + COWBOY_SLOT_STEP / 2;

    return {
      x: startX + col * COWBOY_SLOT_STEP,
      y: startY + row * COWBOY_SLOT_STEP,
    };
  }

  /** Same deterministic row/column slot layout as getCowboySlotPosition, but stepped by MOUNTED_COWBOY_SLOT_STEP_X/Y since its sprite frame isn't square. */
  private getMountedCowboySlotPosition(building: PlacedBuilding, index: number): { x: number; y: number } {
    const { width, height } = BUILDING_DEFINITIONS[building.type].size;
    const footprintPxWidth = width * TILE_SIZE;
    const columns = Math.max(1, Math.floor(footprintPxWidth / MOUNTED_COWBOY_SLOT_STEP_X));
    const col = index % columns;
    const row = Math.floor(index / columns);

    const rowPxWidth = columns * MOUNTED_COWBOY_SLOT_STEP_X - MOUNTED_COWBOY_SLOT_GAP;
    const startX =
      building.tileX * TILE_SIZE + (footprintPxWidth - rowPxWidth) / 2 + MOUNTED_COWBOY_SLOT_STEP_X / 2;
    const startY = building.tileY * TILE_SIZE + height * TILE_SIZE + MOUNTED_COWBOY_SLOT_STEP_Y / 2;

    return {
      x: startX + col * MOUNTED_COWBOY_SLOT_STEP_X,
      y: startY + row * MOUNTED_COWBOY_SLOT_STEP_Y,
    };
  }

  /**
   * A unit is combat-eligible/selectable only while both its training
   * building and its own HP slot are alive - dead/destroyed either way, it no
   * longer defends. Branches on `kind` to read the correct parallel HP array
   * (Barracks' cowboyHp vs Horsery's mountedCowboyHp) since the two never
   * share an index space.
   */
  private isCowboyUnitAlive(unit: CombatUnit): boolean {
    const building = getBuildingById(unit.barracksId);
    if (!building || building.hp <= 0) {
      return false;
    }
    const hp = unit.kind === 'cowboy' ? building.cowboyHp[unit.index] : building.mountedCowboyHp[unit.index];
    return (hp ?? 0) > 0;
  }

  /**
   * Registers unit selection and move orders (both on pointerup - Phase 25
   * moved move orders off pointerdown, see below) as their own listener
   * rather than folding them into setupBuildingPlacement/setupBuildingSelection.
   * Phaser fires every listener registered for the same event, in
   * registration order, so this coexists safely with the existing handlers:
   * emitting 'cancel-placement' on right pointerdown while selectedType is
   * already null (setupBuildingPlacement's rightButtonDown branch) is a
   * verified no-op (see cancelPlacement), and the minimap guard here is
   * re-checked directly via isPointerInMinimap(pointer) rather than trusting
   * this.minimapPointerActive, since setupBuildingSelection's own pointerup
   * handler (registered earlier) already resets that flag to false by the
   * time this one runs.
   *
   * Phase 24 issued the move order on pointerdown (right button), which
   * worked for single-click-to-move but can't distinguish a right-click from
   * the start of a right-drag-to-pan (Phase 25). Both selection and move
   * orders now resolve on pointerup, gated on which button was just released
   * (leftButtonReleased()/rightButtonReleased()) and on the same
   * click-vs-drag distance threshold used everywhere else in this file - a
   * right release past the threshold was a pan, not a command.
   *
   * Left-click selection intentionally does NOT suppress the existing
   * building-info-panel click handling - both fire on the same click. Picking
   * a unit is a separate, additive concern from building selection; a player
   * clicking a unit standing on/near a building plausibly wants to see both,
   * and suppressing one would just be a surprising special case.
   */
  private setupUnitControl(): void {
    this.selectionRingGraphics = this.add.graphics().setDepth(COWBOY_SELECTION_RING_DEPTH);
    this.selectionRectGraphics = this.add.graphics().setDepth(SELECTION_RECT_DEPTH);

    this.cowboySelectionHintText = this.add
      .text(VIEWPORT_WIDTH / 2, VIEWPORT_HEIGHT - 8, 'Unit(s) selected - right-click to move', {
        fontSize: '14px',
        color: '#ffffff',
        backgroundColor: '#2b1d12cc',
        padding: { x: 6, y: 4 },
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      // The drag rectangle (if any) always ends here, regardless of which
      // guard below fires next, so no stray box can ever outlive its drag.
      this.selectionRectGraphics.clear();

      if (this.selectedType !== null || this.isPointerInMinimap(pointer)) {
        return;
      }

      const dx = pointer.x - this.pointerDownX;
      const dy = pointer.y - this.pointerDownY;
      const dragDistance = Math.sqrt(dx * dx + dy * dy);

      if (pointer.rightButtonReleased()) {
        // Phase 53: an armed rally-point pick takes over this right-click
        // entirely, ahead of the unit move/attack-order logic below - a
        // qualifying click (not a right-drag pan past the threshold) sets the
        // rally point and disarms; anything else (a pan) leaves the mode
        // armed for a later attempt.
        if (this.rallyPointModeBuildingId !== null) {
          if (dragDistance <= CLICK_MOVE_THRESHOLD) {
            setRallyPoint(this.rallyPointModeBuildingId, pointer.worldX, pointer.worldY);
            gameEvents.emit('rally-point-mode-changed', null);
          }
          return;
        }

        if (dragDistance > CLICK_MOVE_THRESHOLD || this.selectedUnits.length === 0) {
          return;
        }
        // Phase 40: right-clicking directly on a live raider issues a focus-fire
        // attack order on that specific raider instead of a plain move order;
        // Phase 57 extends the same hit-test to a live Raider Camp (checked
        // second - a raider standing in front of its own camp still wins);
        // right-clicking anything else (empty ground, a building, etc.) keeps
        // the original move-order behavior unchanged.
        const raider = this.findRaiderAt(pointer.worldX, pointer.worldY);
        if (raider) {
          this.issueUnitAttackOrder({ kind: 'raider', id: raider.id }, { x: raider.image.x, y: raider.image.y });
          return;
        }
        const camp = this.findCampAt(pointer.worldX, pointer.worldY);
        if (camp) {
          this.issueUnitAttackOrder({ kind: 'camp', id: camp.id }, { x: camp.x, y: camp.y });
        } else {
          this.issueUnitMoveOrders(pointer);
        }
        return;
      }

      if (!pointer.leftButtonReleased()) {
        return;
      }

      if (dragDistance <= CLICK_MOVE_THRESHOLD) {
        this.selectUnitAt(pointer);
      } else {
        this.selectUnitsInRect(this.dragStartWorldX, this.dragStartWorldY, pointer.worldX, pointer.worldY);
      }
    });
  }

  /**
   * Phase 41: a second click-select on the SAME unit within
   * UNIT_DOUBLE_CLICK_MS selects every currently-alive unit of that unit's
   * kind (cowboy vs cowboyOnHorse) rather than just the one clicked -
   * "every alive" rather than "every on-screen" since it's simpler and reads
   * correctly (a player double-clicking one Cowboy almost always wants every
   * Cowboy, on-screen or not).
   */
  private selectUnitAt(pointer: Phaser.Input.Pointer): void {
    let hit: CombatUnit | null = null;
    let bestDistance = COWBOY_SELECT_HIT_RADIUS_PX;

    for (const unit of this.cowboyUnits) {
      if (!this.isCowboyUnitAlive(unit)) {
        continue;
      }
      const distance = Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, unit.image.x, unit.image.y);
      if (distance <= bestDistance) {
        bestDistance = distance;
        hit = unit;
      }
    }

    if (!hit) {
      this.selectedUnits = [];
      this.lastUnitClickId = null;
      this.cowboySelectionHintText.setVisible(false);
      return;
    }

    const now = this.time.now;
    const isDoubleClick = hit.id === this.lastUnitClickId && now - this.lastUnitClickAt <= UNIT_DOUBLE_CLICK_MS;
    this.lastUnitClickId = hit.id;
    this.lastUnitClickAt = now;

    this.selectedUnits = isDoubleClick
      ? this.cowboyUnits.filter((unit) => unit.kind === hit.kind && this.isCowboyUnitAlive(unit))
      : [hit];
    this.cowboySelectionHintText.setVisible(true);
  }

  /** Every living unit whose position falls within the released drag rectangle (world-space corners, order-independent). */
  private selectUnitsInRect(x1: number, y1: number, x2: number, y2: number): void {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    this.selectedUnits = this.cowboyUnits.filter(
      (unit) =>
        this.isCowboyUnitAlive(unit) &&
        unit.image.x >= minX &&
        unit.image.x <= maxX &&
        unit.image.y >= minY &&
        unit.image.y <= maxY,
    );
    this.cowboySelectionHintText.setVisible(this.selectedUnits.length > 0);
  }

  /**
   * One move order per selected unit, each aimed at the click point plus a
   * small random offset so a multi-unit order doesn't stack every unit on one
   * pixel. Note this is Phase 40's "attack-move" too, not just a plain move:
   * resolveCowboyFire reads each unit's live image.x/y (kept current by
   * Phaser's own tween stepping, independent of the 2s combat-tick timer)
   * rather than only checking position once a tween completes, so a unit
   * already auto-fires at whatever's nearest-in-range while mid-walk to this
   * order's destination. A separate attack-move keybind would just be this
   * same behavior under a second name, so none was added.
   */
  private issueUnitMoveOrders(pointer: Phaser.Input.Pointer): void {
    // One confirmation per order, not per unit - a 5-unit order is still a
    // single player action.
    playUiSound('moveConfirm');
    for (const unit of this.selectedUnits) {
      // An explicit new move order supersedes any standing attack order -
      // otherwise resolveUnitAttackOrders would immediately start steering
      // the unit back toward its old target on the next combat tick.
      unit.attackTarget = null;
      const jitterX = Phaser.Math.Between(-UNIT_MOVE_ORDER_JITTER_PX, UNIT_MOVE_ORDER_JITTER_PX);
      const jitterY = Phaser.Math.Between(-UNIT_MOVE_ORDER_JITTER_PX, UNIT_MOVE_ORDER_JITTER_PX);
      this.issueUnitMoveOrder(unit, pointer.worldX + jitterX, pointer.worldY + jitterY);
    }
  }

  /** Nearest live raider to a world point within RAIDER_ATTACK_HIT_RADIUS_PX, or null - the hit-test that tells a right-click-on-a-raider (attack order) apart from a right-click-on-ground (move order). */
  private findRaiderAt(worldX: number, worldY: number): Raider | null {
    let best: Raider | null = null;
    let bestDistance = RAIDER_ATTACK_HIT_RADIUS_PX;

    for (const raider of this.raiders) {
      if (raider.hp <= 0) {
        continue;
      }
      const distance = Phaser.Math.Distance.Between(worldX, worldY, raider.image.x, raider.image.y);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = raider;
      }
    }

    return best;
  }

  /** Nearest live Raider Camp to a world point within RAIDER_CAMP_ATTACK_HIT_RADIUS_PX, or null - mirrors findRaiderAt exactly, checked second in the pointerup handler so an overlapping raider always wins the hit-test. */
  private findCampAt(worldX: number, worldY: number): RaiderCamp | null {
    let best: RaiderCamp | null = null;
    let bestDistance = RAIDER_CAMP_ATTACK_HIT_RADIUS_PX;

    for (const camp of getRaiderCamps()) {
      const distance = Phaser.Math.Distance.Between(worldX, worldY, camp.x, camp.y);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = camp;
      }
    }

    return best;
  }

  /**
   * Phase 40: locks every selected unit onto one specific raider (or, Phase
   * 57, Raider Camp) by AttackTargetRef. Unlike a plain move order, this
   * survives across combat ticks (resolveUnitAttackOrders re-issues the
   * approach each tick and resolveCowboyFire focus-fires this target
   * specifically once in range) until the target dies/is destroyed or
   * otherwise stops being found alive, at which point the unit falls back to
   * auto-targeting raiders on its own. `position` is the target's current
   * world position at order time, used only for the immediate approach-or-
   * engage feedback below - every later tick re-resolves it fresh via
   * getAttackTargetPosition instead of trusting this snapshot.
   */
  private issueUnitAttackOrder(target: AttackTargetRef, position: { x: number; y: number }): void {
    // Same one-confirmation-per-order rule as issueUnitMoveOrders.
    playUiSound('moveConfirm');
    for (const unit of this.selectedUnits) {
      unit.attackTarget = target;
      this.approachOrEngageTarget(unit, position);
    }
  }

  /**
   * Live world position of a unit's standing attack order, re-resolved fresh
   * every call (never cached) since a raider walks and a camp's hp can hit
   * zero between ticks. Returns null once the ordered target is no longer
   * found alive/existing, which is exactly the signal resolveUnitAttackOrders
   * uses to clear the order and hand the unit back to auto-targeting.
   */
  private getAttackTargetPosition(target: AttackTargetRef): { x: number; y: number } | null {
    if (target.kind === 'raider') {
      const raider = this.raiders.find((candidate) => candidate.id === target.id && candidate.hp > 0);
      return raider ? { x: raider.image.x, y: raider.image.y } : null;
    }
    const camp = getRaiderCampById(target.id);
    return camp && camp.hp > 0 ? { x: camp.x, y: camp.y } : null;
  }

  /**
   * Shared by issueUnitAttackOrder (immediate feedback the moment the order is
   * given) and resolveUnitAttackOrders (the per-combat-tick refresh): if the
   * unit is already within COWBOY_RANGE_TILES of the target position, stop
   * closing the distance and hold position so resolveCowboyFire can start
   * focus-firing it; otherwise (re)issue a move order toward it. Generalized
   * (Phase 57) from a Raider-only version to a plain {x,y} since neither a
   * raider's live position nor a camp's static one need any other field here.
   */
  private approachOrEngageTarget(unit: CombatUnit, position: { x: number; y: number }): void {
    const rangePx = COWBOY_RANGE_TILES * TILE_SIZE;
    const distance = Phaser.Math.Distance.Between(unit.image.x, unit.image.y, position.x, position.y);
    if (distance <= rangePx) {
      unit.moveTween?.stop();
      unit.moveTween = null;
      return;
    }
    this.issueUnitMoveOrder(unit, position.x, position.y);
  }

  /** Same point-to-point tween technique as villagers/raiders (distance/speed -> duration, setFlipX for facing), clamped to map bounds. */
  private issueUnitMoveOrder(unit: CombatUnit, targetWorldX: number, targetWorldY: number): void {
    const targetX = Phaser.Math.Clamp(targetWorldX, 0, MAP_WIDTH_TILES * TILE_SIZE);
    const targetY = Phaser.Math.Clamp(targetWorldY, 0, MAP_HEIGHT_TILES * TILE_SIZE);

    unit.moveTween?.stop();
    unit.image.setFlipX(targetX < unit.image.x);

    const distance = Phaser.Math.Distance.Between(unit.image.x, unit.image.y, targetX, targetY);
    const duration = (distance / UNIT_KIND_CONFIG[unit.kind].walkSpeedPxPerSec) * 1000;

    unit.moveTween = this.tweens.add({
      targets: unit.image,
      x: targetX,
      y: targetY,
      duration: Math.max(duration, 1),
      ease: 'Linear',
      onComplete: () => {
        unit.moveTween = null;
      },
    });
  }

  /** Redrawn every frame (update()) rather than on an event, since it must visually track units mid-move-tween; cheap at this unit count. One ring per selected unit (Phase 25). */
  private redrawSelectionRing(): void {
    this.selectionRingGraphics.clear();
    if (this.selectedUnits.length === 0) {
      return;
    }
    this.selectionRingGraphics.lineStyle(2, COWBOY_SELECTION_RING_COLOR, 1);
    for (const unit of this.selectedUnits) {
      this.selectionRingGraphics.strokeCircle(unit.image.x, unit.image.y, COWBOY_SELECTION_RING_RADIUS_PX);
    }
  }

  /**
   * Phase 41: everything that isn't continuous camera panning (that's
   * setupKeyboardCamera/updateKeyboardCameraPan above) - control groups,
   * idle-unit cycling, demolishing the selected building, and the
   * bare-number-key building-category switch. One raw 'keydown' listener
   * (rather than addKey() per key) because several of these need modifier
   * state (event.ctrlKey) and a native KeyCode, not just "is this key down".
   *
   * Conflict resolution for bare digit keys 1-9 (documented once, here,
   * since handleNumberKey is the single place that arbitrates it): a digit
   * key ALWAYS tries a control-group recall first. Only if that group has no
   * living members (including a never-assigned group) does the key fall
   * through to the building-category tab switch, and only then if no units
   * are currently selected and neither placement nor demolish mode is
   * active. This means an assigned, still-living control group takes
   * permanent priority over that same digit's category tab - a deliberate
   * choice, since a group the player bothered to assign is presumably more
   * important than a tab shortcut sharing its digit.
   */
  private setupHotkeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }

    keyboard.on('keydown', (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      const digitMatch = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
      if (digitMatch) {
        this.handleNumberKey(Number(digitMatch[1]), event.ctrlKey || event.metaKey);
        event.preventDefault();
        return;
      }

      if (event.code === 'Space') {
        this.cycleIdleUnitSelection();
        event.preventDefault();
        return;
      }

      if (event.code === 'Delete' || event.code === 'Backspace') {
        this.demolishSelectedBuilding();
        event.preventDefault();
      }

      if (event.code === 'KeyC') {
        this.toggleChainViewVisibility();
        event.preventDefault();
      }

      // Phase 49: 'V' ("view stats") toggles the Statistics & Efficiency
      // panel. MainScene owns no state for it - the panel itself is the only
      // listener - so this is a bare emit, same shape as the 'C' hotkey above.
      if (event.code === 'KeyV') {
        gameEvents.emit('toggle-statistics-panel');
        event.preventDefault();
      }
    });
  }

  private handleNumberKey(groupNumber: number, ctrlHeld: boolean): void {
    if (ctrlHeld) {
      if (this.selectedUnits.length === 0) {
        return;
      }
      this.controlGroups.set(groupNumber, this.selectedUnits.map((unit) => unit.id));
      return;
    }

    const memberIds = this.controlGroups.get(groupNumber);
    const livingMembers = memberIds
      ? this.cowboyUnits.filter((unit) => memberIds.includes(unit.id) && this.isCowboyUnitAlive(unit))
      : [];

    if (livingMembers.length > 0) {
      const now = this.time.now;
      const lastRecallAt = this.lastGroupRecallAt.get(groupNumber) ?? -Infinity;
      this.lastGroupRecallAt.set(groupNumber, now);

      this.selectedUnits = livingMembers;
      this.cowboySelectionHintText.setVisible(true);

      if (now - lastRecallAt <= CONTROL_GROUP_DOUBLE_TAP_MS) {
        this.centerCameraOnUnits(livingMembers);
      }
      return;
    }

    if (this.selectedUnits.length === 0 && this.selectedType === null && !this.demolishMode) {
      this.trySwitchBuildingCategory(groupNumber);
    }
  }

  private centerCameraOnUnits(units: CombatUnit[]): void {
    const avgX = units.reduce((sum, unit) => sum + unit.image.x, 0) / units.length;
    const avgY = units.reduce((sum, unit) => sum + unit.image.y, 0) / units.length;
    this.centerCameraOnWorldPoint(avgX, avgY);
  }

  /**
   * Phase 44: generalized single-point version of centerCameraOnUnits' own
   * centerOn-then-redraw-minimap-viewport pair, so the notification log's
   * click-to-focus (which has one world point, not a unit list to average)
   * doesn't need its own copy of the same two lines.
   */
  private centerCameraOnWorldPoint(worldX: number, worldY: number): void {
    this.cameras.main.centerOn(worldX, worldY);
    this.redrawMinimapViewportThrottled();
  }

  /** Phase 44: NotificationLogPanel (a DOM overlay with no camera access) asks to pan here via gameEvents rather than duplicating tile->world math. */
  private setupNotificationLog(): void {
    gameEvents.on('camera-focus-requested', (worldX: number, worldY: number) => {
      this.centerCameraOnWorldPoint(worldX, worldY);
    });
  }

  /** 1-indexed against BuildingCategory's declaration order (BuildingBar builds its tabs off the same Object.values(...) order); out-of-range numbers (7-9, with today's 6 categories) are simply a no-op. */
  private trySwitchBuildingCategory(oneIndexedCategoryNumber: number): void {
    const categories = Object.values(BuildingCategory);
    const category = categories[oneIndexedCategoryNumber - 1];
    if (!category) {
      return;
    }
    gameEvents.emit('select-category', category);
  }

  /**
   * Cycles selection through units with no standing order (not mid-move-tween
   * and no attackTarget), centering the camera on each in turn and
   * wrapping around. If exactly one idle unit is already selected, this
   * advances from its position in the idle list; any other selection state
   * (none, multiple, or a non-idle unit) restarts from the first idle unit.
   */
  private cycleIdleUnitSelection(): void {
    const idleUnits = this.cowboyUnits.filter(
      (unit) => this.isCowboyUnitAlive(unit) && unit.moveTween === null && unit.attackTarget === null,
    );
    if (idleUnits.length === 0) {
      return;
    }

    const currentIndex = this.selectedUnits.length === 1 ? idleUnits.indexOf(this.selectedUnits[0]) : -1;
    const nextUnit = idleUnits[(currentIndex + 1) % idleUnits.length];

    this.selectedUnits = [nextUnit];
    this.cowboySelectionHintText.setVisible(true);
    this.cameras.main.centerOn(nextUnit.image.x, nextUnit.image.y);
    this.redrawMinimapViewportThrottled();
  }

  /** Mirrors BuildingInfoPanel's own Demolish button (demolishBuilding + clearing the selection), just bound to Delete/Backspace on whichever building is currently selected. No-op if nothing is selected. */
  private demolishSelectedBuilding(): void {
    if (!this.selectedBuildingId) {
      return;
    }
    demolishBuilding(this.selectedBuildingId);
    gameEvents.emit('building-selected', null);
  }

  /**
   * Spawns POPULATION_PER_HOUSE sprites per House placement (population
   * capacity, not employment - employment is recomputed every tick and
   * shouldn't churn sprites in/out). Capped at VILLAGER_CAP total for
   * performance, so a later House may spawn fewer (or none).
   *
   * Phase 46: deliberately NOT scaled by houseTier - this is a fixed
   * decorative flourish at placement time, whereas the workforce-relevant
   * population figure (gameState's totalPopulation, HUD's Pop X/Y) is
   * computed fresh from HOUSE_TIER_CONFIG every tick. Re-syncing rendered
   * sprite counts to a live tier would add churn/pooling complexity for a
   * purely cosmetic number already capped and decoupled from gameplay.
   */
  private spawnVillagersForHouse(building: PlacedBuilding): void {
    const spawnCount = Math.min(POPULATION_PER_HOUSE, VILLAGER_CAP - this.villagers.length);
    const origin = this.tileCenter(building);

    for (let index = 0; index < spawnCount; index++) {
      const villager = this.add
        .image(origin.x, origin.y, VILLAGERS_ATLAS_KEY, VILLAGER_TEXTURE_KEY)
        .setDepth(VILLAGER_SPRITE_DEPTH);
      this.villagers.push(villager);
      this.startVillagerWander(villager);
    }
  }

  /**
   * Point-to-point wander, one leg at a time: each leg is its own tween,
   * chained via onComplete rather than a single repeating/yoyo tween, since
   * every leg goes to a fresh random target instead of bouncing between two
   * fixed points. `villager.active` is checked on every (re-)entry so a
   * pending post-reset callback (scheduled before game-reset destroyed this
   * sprite) quietly stops the loop instead of animating a dead image.
   */
  private startVillagerWander(villager: Phaser.GameObjects.Image): void {
    if (!villager.active) {
      return;
    }

    const target = this.pickVillagerTarget();
    const distance = Phaser.Math.Distance.Between(villager.x, villager.y, target.x, target.y);
    const duration = (distance / VILLAGER_WALK_SPEED_PX_PER_SEC) * 1000;

    villager.setFlipX(target.x < villager.x);

    this.tweens.add({
      targets: villager,
      x: target.x,
      y: target.y,
      duration: Math.max(duration, 1),
      ease: 'Linear',
      onComplete: () => {
        const pause = Phaser.Math.Between(VILLAGER_PAUSE_MIN_MS, VILLAGER_PAUSE_MAX_MS);
        this.time.delayedCall(pause, () => this.startVillagerWander(villager));
      },
    });
  }

  /**
   * Random placed building's tile center, clamped to map bounds.
   *
   * Phase 31 made the empty-list case reachable for the first time: before
   * buildings could be destroyed or demolished, a villager's own House was
   * guaranteed to still be standing whenever this ran, so
   * `buildings[Between(0, -1)]` was unreachable. Now a town can lose every
   * last building while its villagers are still walking, so an empty list
   * falls back to a random point on the map rather than dereferencing
   * undefined.
   */
  private pickVillagerTarget(): { x: number; y: number } {
    const buildings = getPlacedBuildings();
    const mapWidthPx = MAP_WIDTH_TILES * TILE_SIZE;
    const mapHeightPx = MAP_HEIGHT_TILES * TILE_SIZE;

    if (buildings.length === 0) {
      return {
        x: Phaser.Math.Between(0, mapWidthPx),
        y: Phaser.Math.Between(0, mapHeightPx),
      };
    }

    const building = buildings[Phaser.Math.Between(0, buildings.length - 1)];
    const center = this.tileCenter(building);

    return {
      x: Phaser.Math.Clamp(center.x, 0, mapWidthPx),
      y: Phaser.Math.Clamp(center.y, 0, mapHeightPx),
    };
  }

  private setupGameReset(): void {
    gameEvents.on('game-reset', () => {
      this.cancelPlacement();
      gameEvents.emit('building-selected', null);

      for (const { image, animalImages, accentObjects } of this.buildingVisuals.values()) {
        image.destroy();
        for (const animalImage of animalImages) {
          this.tweens.killTweensOf(animalImage);
          animalImage.destroy();
        }
        for (const accentObject of accentObjects) {
          this.tweens.killTweensOf(accentObject);
          accentObject.destroy();
        }
      }
      this.buildingVisuals.clear();
      this.connectionGraphics.clear();
      this.fenceLineGraphics.clear();
      this.selectedResourceKey = null;
      this.chainViewVisible = true;
      this.chainViewGraphics.clear();
      gameEvents.emit('resource-selected', null);
      this.hpBarGraphics.clear();
      this.unitHpBarGraphics.clear();
      this.statusBadgeGraphics.clear();
      this.harvestRingGraphics.clear();

      // Phase 34: setupGameOverHalt froze the scene's clocks behind the
      // game-over screen; Play Again is the one path back, so it restores
      // them to the speed the player had selected.
      this.time.timeScale = this.gameSpeed;
      this.tweens.timeScale = this.gameSpeed;
      setAudioGameSpeed(this.gameSpeed);

      for (const villager of this.villagers) {
        this.tweens.killTweensOf(villager);
        villager.destroy();
      }
      this.villagers = [];

      for (const unit of this.cowboyUnits) {
        unit.moveTween?.stop();
        unit.image.destroy();
      }
      this.cowboyUnits = [];
      this.selectedUnits = [];
      this.controlGroups.clear();
      this.lastGroupRecallAt.clear();
      this.lastUnitClickId = null;
      this.selectionRingGraphics.clear();
      this.selectionRectGraphics.clear();
      this.cowboySelectionHintText.setVisible(false);
      this.placementHintText.setVisible(false);

      // gameState.resetGame reseeds vegetation before emitting 'game-reset',
      // so rebuilding every sprite from the current entity list here picks up
      // the new layout.
      this.redrawAllVegetation();
      this.resetRaiderCampVisuals();
      this.redrawMinimap();

      this.resetRaidState();
      this.resetMerchantState();
      this.resetWorldEventState();
      this.lastAutosaveDayNumber = -1;
    });
  }

  /**
   * Phase 52: Save/Load + Autosave's scene-side half. state/persistence.ts
   * owns the actual (de)serialization and localStorage plumbing; this only
   * reacts to its 'game-loaded' event (rebuilding every building/villager/
   * garrisoned-unit visual from the now-populated gameState, mirroring how
   * setupGameReset tears them down) and drives the once-per-dawn autosave off
   * the existing day/night clock.
   */
  private setupSaveLoad(): void {
    gameEvents.on('game-loaded', () => {
      this.redrawAllVegetation();
      for (const building of getPlacedBuildings()) {
        this.restoreBuildingVisual(building);
      }
      // Phase 57: a loaded save's Raider Camps are real persisted state (see
      // persistence.ts) - restore their sprites the same way. Whether the
      // day-2 initial spawn should still be considered "pending" depends on
      // the loaded day number, not merely on whether any camp currently
      // exists: a save from before RAIDER_CAMP_SPAWN_DAY should still spawn
      // camps once that day naturally arrives during continued play, while a
      // later save with 0 camps (every one already destroyed) must not have
      // them respawn just because it was reloaded.
      this.restoreCampVisuals();
      this.initialCampsSpawned = getDayNumber() >= RAIDER_CAMP_SPAWN_DAY;
      this.redrawMinimap();
      this.suppressNextAutosaveCheck = true;
    });

    gameEvents.on('day-phase-changed', ({ dayNumber, phase }: DayPhaseChange) => {
      if (this.suppressNextAutosaveCheck) {
        this.suppressNextAutosaveCheck = false;
        return;
      }
      // getElapsedSeconds() > 0 excludes resetGame's own synthetic "Day 1,
      // day" event, always fired at elapsedSeconds 0 for a brand new run -
      // not a real dawn worth autosaving.
      if (phase === 'day' && dayNumber !== this.lastAutosaveDayNumber && getElapsedSeconds() > 0) {
        this.lastAutosaveDayNumber = dayNumber;
        saveToSlot(AUTOSAVE_SLOT);
        addNotification('Autosaved.', 'info', getElapsedSeconds());
      }
    });
  }

  /**
   * Phase 23: raid events & combat. Raiders and all their state (hp, target,
   * tween) live entirely in this scene rather than gameState.ts - unlike
   * animals/cowboys they aren't owned by a single building, and unlike core
   * resources/hp they're ephemeral, wave-scoped, and Phaser-tween-heavy, so
   * splitting them into gameState.ts would only add cross-file plumbing for
   * state nothing outside this scene needs. The one place they DO reach into
   * gameState is building.hp: that's core game state (already mutated
   * in-place elsewhere, e.g. runHpRegen), so raiders read it via
   * getBuildingById/getPlacedBuildings and write it directly rather than
   * duplicating it locally.
   */
  private setupRaidSystem(): void {
    this.raidNoticeText = this.add.text(VIEWPORT_WIDTH / 2, 40, '', {
      fontSize: '20px',
      color: '#ffeb3b',
      backgroundColor: '#2b1d12cc',
      padding: { x: 10, y: 6 },
    });
    this.raidNoticeText.setOrigin(0.5, 0);
    this.raidNoticeText.setScrollFactor(0);
    this.raidNoticeText.setDepth(1000);
    this.raidNoticeText.setVisible(false);

    this.scheduleNextRaidCheck();
  }

  /**
   * Rechecks on a freshly-randomized 45-90s delay every time (rather than
   * only after a raid ends) so raid frequency stays independent of how long
   * any given wave lasts; the "only trigger if none active" rule is enforced
   * inside by simply skipping the spawn when one already is.
   */
  /**
   * Phase 31: the interval is squeezed continuously by threat level (elapsed
   * time + net worth) instead of Phase 29's single bank-balance step. At
   * threat 0 this is the original 45-90s roll; at threat 1 both bounds are
   * halved (RAID_MAX_INTERVAL_SQUEEZE), which is exactly what a full bank
   * used to do on its own - so the old behaviour is a point on the new curve
   * rather than a special case.
   *
   * A countdown warning is scheduled RAID_WARNING_LEAD_MS before the wave so
   * the player gets a chance to reposition defenders rather than discovering
   * the raid by finding a crater.
   */
  /**
   * Phase 34 adds the grace period. Raids previously could - and routinely
   * did - land 41-83 seconds into a run, because getThreatLevel already reads
   * ~0.15 from the starting purse alone at t=0 and nothing else gated the
   * spawn. That is well before a player can afford a Barracks and a cowboy to
   * put in it, so the first raid was decided by the map, not by play.
   *
   * Two combined gates now apply, both checked at fire time (not just at
   * schedule time, since the timer's delay can span a phase boundary):
   *  - hard elapsed-time floor of RAID_EARLIEST_ELAPSED_MS,
   *  - night only.
   * A check that fires while ineligible simply reschedules; it does not
   * "bank" a raid to fire the instant the gate opens, which would just move
   * the ambush to a predictable moment.
   */
  private scheduleNextRaidCheck(): void {
    const threat = getThreatLevel();
    const squeeze = 1 - RAID_MAX_INTERVAL_SQUEEZE * threat;
    const delay = Phaser.Math.Between(RAID_MIN_INTERVAL_MS * squeeze, RAID_MAX_INTERVAL_MS * squeeze);

    // Only warn about a raid that will actually be allowed to happen. The
    // phase at fire time is predicted from elapsed seconds (a pure derivation
    // in gameState) rather than assumed to equal the current phase.
    if (this.willRaidBeEligibleIn(delay)) {
      this.scheduleRaidWarning(delay);
    }

    this.raidCheckTimer = this.time.delayedCall(delay, () => {
      if (!this.raidActive && this.canRaidSpawnNow()) {
        this.startRaid();
      }
      this.scheduleNextRaidCheck();
    });
  }

  private canRaidSpawnNow(): boolean {
    return getElapsedSeconds() * 1000 >= RAID_EARLIEST_ELAPSED_MS && getDayPhase() === 'night';
  }

  private willRaidBeEligibleIn(delayMs: number): boolean {
    // No timeScale conversion needed: this timer and the 1s clock that drives
    // getElapsedSeconds both run on this.time, so they are scaled identically
    // and `delayMs` is already denominated in game time.
    const elapsedAtFire = getElapsedSeconds() + delayMs / 1000;
    return (
      elapsedAtFire * 1000 >= RAID_EARLIEST_ELAPSED_MS &&
      getPhaseAtElapsed(Math.floor(elapsedAtFire)) === 'night'
    );
  }

  /**
   * Ticks a "Raid in Ns" notice down over the final RAID_WARNING_LEAD_MS.
   * Runs on this.time (not setInterval) so it obeys the pause/speed control
   * along with everything else, and is suppressed while a wave is already on
   * screen - the active-raid notice is the more urgent message.
   */
  private scheduleRaidWarning(raidDelayMs: number): void {
    this.raidWarningTimer?.remove();
    this.raidWarningTimer = null;

    const lead = Math.min(RAID_WARNING_LEAD_MS, raidDelayMs);
    const warningDelay = raidDelayMs - lead;

    this.time.delayedCall(warningDelay, () => {
      if (this.raidActive) {
        return;
      }
      let remaining = Math.ceil(lead / 1000);
      this.raidNoticeText.setText(`Raid in ${remaining}s - ready your cowboys!`);
      this.raidNoticeText.setVisible(true);

      this.raidWarningTimer = this.time.addEvent({
        delay: 1000,
        repeat: remaining - 1,
        callback: () => {
          remaining -= 1;
          if (this.raidActive || remaining <= 0) {
            return;
          }
          this.raidNoticeText.setText(`Raid in ${remaining}s - ready your cowboys!`);
        },
      });
    });
  }

  /**
   * Phase 51: Traveling Merchant. Follows scheduleNextRaidCheck's exact
   * self-rescheduling shape (roll a random delay, fire, immediately roll the
   * next one) but with none of the raid system's active-wave/eligibility
   * gating - a merchant deal has no "wave" to avoid overlapping and no grace
   * period, so the timer body is just "fire, then reschedule".
   */
  private setupMerchantSystem(): void {
    this.scheduleNextMerchantCheck();
  }

  private scheduleNextMerchantCheck(): void {
    const delay = Phaser.Math.Between(MERCHANT_MIN_INTERVAL_MS, MERCHANT_MAX_INTERVAL_MS);
    this.merchantCheckTimer = this.time.delayedCall(delay, () => {
      this.triggerMerchantDeal();
      this.scheduleNextMerchantCheck();
    });
  }

  /**
   * Picks one marketable resource and a random price-spike multiplier/
   * duration, hands it to state/market.ts (the single source of truth for
   * currentMarketPrice) and announces it through Phase 44's notification log
   * - no bespoke UI chrome, the HUD tooltip's price/arrow already reflects it
   * live once startMerchantDeal takes effect on the next production tick.
   */
  private triggerMerchantDeal(): void {
    const key = MARKETABLE_RESOURCE_KEYS[Phaser.Math.Between(0, MARKETABLE_RESOURCE_KEYS.length - 1)];
    const multiplier = Phaser.Math.FloatBetween(MERCHANT_MULTIPLIER_MIN, MERCHANT_MULTIPLIER_MAX);
    const durationSeconds = Phaser.Math.Between(MERCHANT_DEAL_MIN_SECONDS, MERCHANT_DEAL_MAX_SECONDS);

    startMerchantDeal(key, multiplier, durationSeconds, getElapsedSeconds());

    const percentUp = Math.round((multiplier - 1) * 100);
    addNotification(
      `Traveling merchant wants ${RESOURCE_LABELS[key]}! Price up ${percentUp}% for the next ${durationSeconds}s.`,
      'info',
      getElapsedSeconds(),
    );
  }

  /** Mirrors resetRaidState: cancel the pending check and start a fresh one so a new run doesn't inherit the previous run's countdown. */
  private resetMerchantState(): void {
    this.merchantCheckTimer?.remove();
    this.merchantCheckTimer = null;
    this.scheduleNextMerchantCheck();
  }

  /**
   * Phase 55: Random World Events. Follows scheduleNextRaidCheck/
   * scheduleNextMerchantCheck's exact self-rescheduling shape (roll a random
   * delay, fire, immediately roll the next one), widened past the merchant
   * timer's 90-180s window (WORLD_EVENT_MIN/MAX_INTERVAL_MS = 120-200s) so the
   * two timers don't habitually land on top of each other.
   *
   * The banner text is a separate GameObject from raidNoticeText - a raid
   * warning and a world-event announcement can legitimately be visible at the
   * same time, and sharing one Text would make one silently clobber the
   * other.
   */
  private setupWorldEventSystem(): void {
    // Self-contained widget (owns its own gameEvents subscriptions/lifecycle,
    // same as NightOverlay) - no method on it is ever called again from here,
    // so it isn't kept as a field.
    new DustStormOverlay(this);

    this.worldEventNoticeText = this.add.text(VIEWPORT_WIDTH / 2, 68, '', {
      fontSize: '18px',
      color: '#ffd699',
      backgroundColor: '#2b1d12cc',
      padding: { x: 10, y: 6 },
    });
    this.worldEventNoticeText.setOrigin(0.5, 0);
    this.worldEventNoticeText.setScrollFactor(0);
    this.worldEventNoticeText.setDepth(1000);
    this.worldEventNoticeText.setVisible(false);

    this.scheduleNextWorldEventCheck();
  }

  private scheduleNextWorldEventCheck(): void {
    const delay = Phaser.Math.Between(WORLD_EVENT_MIN_INTERVAL_MS, WORLD_EVENT_MAX_INTERVAL_MS);
    this.worldEventCheckTimer = this.time.delayedCall(delay, () => {
      this.triggerWorldEvent();
      this.scheduleNextWorldEventCheck();
    });
  }

  /**
   * state/worldEvents.ts only ever tracks one active duration-based event at
   * a time (see its own doc comment) - a roll that lands while one is still
   * running is simply skipped rather than queued, exactly like a raid check
   * that fires while a wave is already active. wanderingSettlers is the
   * exception: it's an instant reward with no ongoing state, so it always
   * fires regardless of whether another event is currently active.
   */
  private triggerWorldEvent(): void {
    const type = pickRandomWorldEventType();

    if (type === 'wanderingSettlers') {
      const amount = applyWanderingSettlersReward();
      const message = `Wandering settlers pass through and leave $${amount} in thanks for your hospitality!`;
      this.showWorldEventNotice(message);
      addNotification(message, 'info', getElapsedSeconds());
      return;
    }

    if (getActiveWorldEvent()) {
      return;
    }

    const [durationMin, durationMax] = WORLD_EVENT_DURATION_RANGE_SECONDS[type];
    const durationSeconds = Phaser.Math.Between(durationMin, durationMax);
    startWorldEvent(type, durationSeconds, getElapsedSeconds());

    const message = `${WORLD_EVENT_LABELS[type]}! ${WORLD_EVENT_DESCRIPTIONS[type]} (${durationSeconds}s)`;
    this.showWorldEventNotice(message);
    addNotification(message, WORLD_EVENT_NOTIFICATION_KIND[type], getElapsedSeconds());
  }

  /** Mirrors showRaidNotice's on-screen-then-auto-hide behavior, but on its own timer/text object. */
  private showWorldEventNotice(message: string): void {
    this.worldEventNoticeHideTimer?.remove();
    this.worldEventNoticeText.setText(message);
    this.worldEventNoticeText.setVisible(true);
    this.worldEventNoticeHideTimer = this.time.delayedCall(WORLD_EVENT_BANNER_DURATION_MS, () => {
      this.worldEventNoticeText.setVisible(false);
    });
  }

  /** Mirrors resetRaidState/resetMerchantState: cancel the pending check, hide any lingering banner, and start a fresh countdown. */
  private resetWorldEventState(): void {
    this.worldEventCheckTimer?.remove();
    this.worldEventCheckTimer = null;
    this.worldEventNoticeHideTimer?.remove();
    this.worldEventNoticeHideTimer = null;
    this.worldEventNoticeText.setVisible(false);
    this.scheduleNextWorldEventCheck();
  }

  /**
   * Below OUTLAW_BIAS_THREAT: the original even pick across
   * Object.values(RaiderFaction). Above it a wealthy/late-game town draws
   * outsized Outlaw attention (60/20/20), generalizing Phase 29's
   * bank-balance trigger to overall net worth.
   */
  private pickRaidFaction(): RaiderFaction {
    const factions = Object.values(RaiderFaction);
    if (getThreatLevel() < OUTLAW_BIAS_THREAT) {
      return factions[Phaser.Math.Between(0, factions.length - 1)];
    }
    const roll = Math.random();
    if (roll < 0.6) {
      return RaiderFaction.Outlaws;
    }
    return roll < 0.8 ? RaiderFaction.Rustlers : RaiderFaction.Coyotes;
  }

  /**
   * Phase 31: wave size and raider toughness both scale with threat. The HP
   * multiplier is carried on each Raider rather than mutating
   * RAIDER_DEFINITIONS, which must stay the immutable base stat table.
   *
   * Phase 57: piggybacks Raider Camps onto this same wave timer rather than
   * forking a second one per camp (per the phase brief) - if any camp exists,
   * this wave sources its spawn point and faction from one random live camp
   * instead of pickRaidSpawnPoint()'s random edge point/pickRaidFaction()'s
   * random faction; with no camps on the map yet (or all destroyed), a raid
   * still spawns exactly as it always did, out of nowhere at a random edge.
   */
  private startRaid(): void {
    const camps = getRaiderCamps();
    const sourceCamp = camps.length > 0 ? camps[Phaser.Math.Between(0, camps.length - 1)] : null;
    const faction = sourceCamp ? sourceCamp.faction : this.pickRaidFaction();
    const threat = getThreatLevel();
    const maxUnits = Math.round(
      RAID_MIN_UNITS + (RAID_MAX_UNITS_ESCALATED - RAID_MIN_UNITS) * threat,
    );
    const count = Phaser.Math.Between(RAID_MIN_UNITS, Math.max(RAID_MIN_UNITS, maxUnits));
    const hpMultiplier = 1 + (RAID_MAX_HP_MULTIPLIER - 1) * threat;

    this.raidActive = true;
    this.raidWarningTimer?.remove();
    this.raidWarningTimer = null;
    this.showRaidNotice(faction, count, threat, sourceCamp !== null);
    const origin = sourceCamp ? { x: sourceCamp.x, y: sourceCamp.y } : undefined;
    for (let i = 0; i < count; i++) {
      this.spawnRaider(faction, hpMultiplier, origin);
    }

    this.raidWaveTimer = this.time.delayedCall(RAID_WAVE_TIMEOUT_MS, () => this.endRaidWave());
  }

  /**
   * Phase 44: the temporary on-screen banner (raidNoticeText) stays exactly
   * as it was - this only additionally appends the same message to the
   * persistent notification log, so a raid a player didn't catch live is
   * still visible afterward. No buildingId: a raid targets whichever building
   * each raider individually picks, not one fixed location.
   */
  private showRaidNotice(faction: RaiderFaction, count: number, threat: number, fromCamp = false): void {
    const tier = threat >= 0.66 ? 'Large ' : threat >= 0.33 ? 'Organized ' : '';
    const originText = fromCamp ? ' from their camp' : '';
    const message = `${tier}${RAIDER_DEFINITIONS[faction].label} raid${originText} - ${count} incoming!`;
    this.raidNoticeText.setText(message);
    this.raidNoticeText.setVisible(true);
    addNotification(message, 'danger', getElapsedSeconds());
  }

  private hideRaidNotice(): void {
    this.raidNoticeText.setVisible(false);
  }

  /** origin (Phase 57): when a wave is sourced from a Raider Camp, every raider spawns at that camp's position instead of a random pickRaidSpawnPoint() edge point. */
  private spawnRaider(faction: RaiderFaction, hpMultiplier = 1, origin?: { x: number; y: number }): void {
    const spawn = origin ?? this.pickRaidSpawnPoint();
    const definition = RAIDER_DEFINITIONS[faction];

    const image = this.add
      .image(spawn.x, spawn.y, RAIDERS_ATLAS_KEY, raiderTextureKey(faction))
      .setDepth(RAIDER_SPRITE_DEPTH);

    const scaledMaxHp = Math.round(definition.maxHp * hpMultiplier);
    const raider: Raider = {
      id: `raider-${this.raiderIdCounter++}`,
      image,
      faction,
      hp: scaledMaxHp,
      maxHp: scaledMaxHp,
      targetBuildingId: null,
      arrived: false,
    };
    this.raiders.push(raider);
    this.updateRaiderTargeting(raider);
  }

  /** Random point along one of the 4 map edges, in world pixels; already within bounds by construction since each axis is drawn from [0, map-dimension-px]. */
  private pickRaidSpawnPoint(): { x: number; y: number } {
    const mapWidthPx = MAP_WIDTH_TILES * TILE_SIZE;
    const mapHeightPx = MAP_HEIGHT_TILES * TILE_SIZE;
    const edge = Phaser.Math.Between(0, 3);

    switch (edge) {
      case 0:
        return { x: Phaser.Math.Between(0, mapWidthPx), y: 0 };
      case 1:
        return { x: mapWidthPx, y: Phaser.Math.Between(0, mapHeightPx) };
      case 2:
        return { x: Phaser.Math.Between(0, mapWidthPx), y: mapHeightPx };
      default:
        return { x: 0, y: Phaser.Math.Between(0, mapHeightPx) };
    }
  }

  /**
   * Only reassigns a target when the current one is missing/dead - a raider
   * commits to its target once and walks there a single time (per the phase
   * spec), it does not re-evaluate "nearest" on every leg like villagers do.
   * Called once at spawn (target starts null) and again each combat tick so
   * a raider whose target died (or that spawned with none, e.g. an empty
   * map) can pick up a newly-valid building without needing its own timer.
   */
  private updateRaiderTargeting(raider: Raider): void {
    const currentTarget = raider.targetBuildingId ? getBuildingById(raider.targetBuildingId) : null;
    if (currentTarget && currentTarget.hp > 0) {
      return;
    }

    const definition = RAIDER_DEFINITIONS[raider.faction];
    const next = this.pickRaiderTarget(definition, raider.image.x, raider.image.y);
    if (!next) {
      raider.targetBuildingId = null;
      raider.arrived = false;
      this.tweens.killTweensOf(raider.image);
      return;
    }

    raider.targetBuildingId = next.id;
    raider.arrived = false;
    this.sendRaiderToTarget(raider, next);
  }

  /**
   * Phase 38: Palisade blocking. A raider's real target is still picked by
   * "nearest (preferred-type) building", unchanged - but if the straight
   * line from the raider to that target crosses a live Fence tile, the
   * blocking Fence is returned instead. Once that Fence dies,
   * updateRaiderTargeting's normal "current target invalid -> re-pick" path
   * calls this again from the raider's now-closer position, which either
   * finds the next Fence layer or the original target with nothing left in
   * the way - no separate "resume original target" bookkeeping needed.
   */
  private pickRaiderTarget(definition: RaiderDefinition, x: number, y: number): PlacedBuilding | null {
    let target: PlacedBuilding | null = null;
    if (definition.targeting === 'farm-preferred') {
      target = this.findNearestBuilding(x, y, (building) => !!BUILDING_DEFINITIONS[building.type].animal);
    }
    if (!target) {
      target = this.findNearestBuilding(x, y, () => true);
    }
    if (!target || target.type === BuildingType.Fence) {
      return target;
    }
    return this.findBlockingFence(x, y, target) ?? target;
  }

  private findNearestBuilding(
    x: number,
    y: number,
    predicate: (building: PlacedBuilding) => boolean,
  ): PlacedBuilding | null {
    let best: PlacedBuilding | null = null;
    let bestDistance = Infinity;

    for (const building of getPlacedBuildings()) {
      if (building.hp <= 0 || !predicate(building)) {
        continue;
      }
      const center = this.tileCenter(building);
      const distance = Phaser.Math.Distance.Between(x, y, center.x, center.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = building;
      }
    }

    return best;
  }

  /**
   * Phase 38: no grid pathfinding - just a straight-line sample from the
   * raider's current position to its target's tile-center, in half-tile
   * steps, returning the first live Fence tile crossed (i.e. the segment
   * nearest the raider, since sampling walks outward from it). A rough
   * "the wall in your way" check is enough to make Fences a real obstacle
   * without simulating movement around them.
   */
  private findBlockingFence(x: number, y: number, target: PlacedBuilding): PlacedBuilding | null {
    const center = this.tileCenter(target);
    const distance = Phaser.Math.Distance.Between(x, y, center.x, center.y);
    const steps = Math.max(1, Math.ceil(distance / (TILE_SIZE / 2)));
    const seen = new Set<string>();

    for (let step = 1; step < steps; step++) {
      const t = step / steps;
      const sampleTileX = Math.floor((x + (center.x - x) * t) / TILE_SIZE);
      const sampleTileY = Math.floor((y + (center.y - y) * t) / TILE_SIZE);
      const key = `${sampleTileX},${sampleTileY}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const building = getBuildingAtTile(sampleTileX, sampleTileY);
      if (building && building.id !== target.id && building.type === BuildingType.Fence && building.hp > 0) {
        return building;
      }
    }

    return null;
  }

  /** Single point-to-point tween, same walk-speed/duration technique as Phase 20's villagers - but with no onComplete chain back into another leg, since this raider's target never moves. */
  private sendRaiderToTarget(raider: Raider, target: PlacedBuilding): void {
    const definition = RAIDER_DEFINITIONS[raider.faction];
    const center = this.tileCenter(target);
    const distance = Phaser.Math.Distance.Between(raider.image.x, raider.image.y, center.x, center.y);
    const duration = (distance / definition.speedPxPerSec) * 1000;

    raider.image.setFlipX(center.x < raider.image.x);

    this.tweens.add({
      targets: raider.image,
      x: center.x,
      y: center.y,
      duration: Math.max(duration, 1),
      ease: 'Linear',
      onComplete: () => {
        raider.arrived = true;
      },
    });
  }

  /**
   * Runs on the same 2s cadence as production (see setupProductionTimer);
   * no-op when nothing is on the map so an idle game costs nothing extra.
   *
   * Phase 57: the "nothing on the map" bail-out used to be just
   * `this.raiders.length === 0`, which would silently skip
   * resolveUnitAttackOrders/resolveCowboyFire (and therefore never apply any
   * damage) for a unit sent to proactively assault a Raider Camp while no
   * wave happens to be active - exactly the primary offense-phase use case.
   * The guard now also stays open while any unit has a live camp attack
   * order; every other branch below already no-ops cheaply against an empty
   * raiders array.
   */
  private runRaidCombatTick(): void {
    const hasCampAttackOrder = this.cowboyUnits.some((unit) => unit.attackTarget?.kind === 'camp');
    if (this.raiders.length === 0 && !hasCampAttackOrder) {
      return;
    }

    for (const raider of this.raiders) {
      this.updateRaiderTargeting(raider);
    }
    this.resolveUnitAttackOrders();
    this.resolveRaiderAttacks();
    this.resolveCowboyFire();
    this.resolveWatchtowerFire();
    this.removeDeadRaiders();
    this.removeDestroyedBuildings();
    this.redrawHpBars();
    this.redrawUnitHpBars();
  }

  /**
   * Phase 40: advances every unit under a live attack order (see
   * issueUnitAttackOrder) one step ahead of resolveRaiderAttacks/
   * resolveCowboyFire - closing the distance if the ordered target is still
   * out of range, or holding position once it's in range. A target that died/
   * was destroyed or otherwise vanished since the order was given clears
   * attackTarget, which is what lets resolveCowboyFire's default
   * nearest-in-range rule take back over for that unit starting this same
   * tick. Phase 57: the target may now be a Raider Camp as well as a raider;
   * getAttackTargetPosition resolves either kind uniformly.
   */
  private resolveUnitAttackOrders(): void {
    for (const unit of this.cowboyUnits) {
      if (!unit.attackTarget || !this.isCowboyUnitAlive(unit)) {
        continue;
      }
      const position = this.getAttackTargetPosition(unit.attackTarget);
      if (!position) {
        unit.attackTarget = null;
        continue;
      }
      this.approachOrEngageTarget(unit, position);
    }
  }

  /**
   * Phase 31: raiders shoot back at the defenders. A raider prefers any
   * living unit within RAIDER_UNIT_ATTACK_RANGE_TILES over its building
   * target - defending cowboys used to be invulnerable, which made combat a
   * one-sided damage race the player could never lose - and only falls back
   * to chewing on the building when no defender is close enough.
   *
   * Note it can fight a unit before `arrived` is true: a raider walking past
   * a cowboy will engage it, whereas hitting a building still requires having
   * actually reached it.
   */
  private resolveRaiderAttacks(): void {
    const unitRangePx = RAIDER_UNIT_ATTACK_RANGE_TILES * TILE_SIZE;

    for (const raider of this.raiders) {
      const definition = RAIDER_DEFINITIONS[raider.faction];

      const defender = this.findNearestUnit(raider.image.x, raider.image.y, unitRangePx);
      if (defender) {
        const remaining = damageUnit(defender.barracksId, defender.kind, defender.index, definition.damage);
        if (remaining <= 0) {
          this.killUnit(defender);
        }
        continue;
      }

      if (!raider.arrived || !raider.targetBuildingId) {
        continue;
      }
      const target = getBuildingById(raider.targetBuildingId);
      if (!target || target.hp <= 0) {
        continue;
      }
      target.hp = Math.max(0, target.hp - definition.damage);
      this.registerMinimapBuildingDamage(target);
    }
  }

  private findNearestUnit(x: number, y: number, maxDistance: number): CombatUnit | null {
    let best: CombatUnit | null = null;
    let bestDistance = maxDistance;

    for (const unit of this.cowboyUnits) {
      if (!this.isCowboyUnitAlive(unit)) {
        continue;
      }
      const distance = Phaser.Math.Distance.Between(x, y, unit.image.x, unit.image.y);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = unit;
      }
    }

    return best;
  }

  /**
   * Phase 31: a unit that hits 0 HP is gone - sprite destroyed, dropped from
   * the tracking and selection arrays. Its HP slot in gameState stays at 0
   * (see damageUnit) precisely so the surviving units' indices don't shift
   * underneath them.
   */
  private killUnit(unit: CombatUnit): void {
    unit.moveTween?.stop();
    this.tweens.killTweensOf(unit.image);
    this.spawnDeathPuff(unit.image.x, unit.image.y);
    playWorldSound('unitDeath', unit.image.x, unit.image.y);
    unit.image.destroy();

    this.cowboyUnits = this.cowboyUnits.filter((candidate) => candidate !== unit);
    this.selectedUnits = this.selectedUnits.filter((candidate) => candidate !== unit);
    this.cowboySelectionHintText.setVisible(this.selectedUnits.length > 0);
  }

  /** A single small dust puff, reusing the destruction burst's look at unit scale. */
  private spawnDeathPuff(x: number, y: number): void {
    const puff = this.add.circle(x, y, DUST_PUFF_RADIUS_MAX, DUST_PUFF_COLOR, 0.7).setDepth(DUST_DEPTH);
    this.tweens.add({
      targets: puff,
      alpha: 0,
      scale: 1.8,
      duration: DUST_PUFF_DURATION_MAX_MS,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.tweens.killTweensOf(puff);
        puff.destroy();
      },
    });
  }

  /**
   * Phase 31: 0 HP now means destroyed, not "disabled forever". Checked after
   * damage is resolved so a building killed this tick is removed in the same
   * tick that killed it; gameState.destroyBuilding frees its tiles and emits
   * 'building-removed', which drives all the visual cleanup.
   */
  private removeDestroyedBuildings(): void {
    const destroyed = getPlacedBuildings().filter((building) => building.hp <= 0);
    for (const building of destroyed) {
      destroyBuilding(building.id);
    }
  }

  /**
   * Every living unit (Cowboy or Cowboy-on-Horse - this.cowboyUnits holds
   * both kinds, Phase 28) fires once per combat tick at its own nearest
   * in-range raider - not shared/coordinated targeting. Phase 24: reads each
   * unit's live image position instead of re-deriving a Barracks slot, so a
   * unit moved away from its training building still defends from where it
   * stands. Range/damage are shared across both kinds (only speed/HP differ,
   * per the phase spec), so no kind-branching is needed here.
   */
  private resolveCowboyFire(): void {
    const rangePx = COWBOY_RANGE_TILES * TILE_SIZE;
    // Phase 34: shots are collected first and sounded once, so the audio layer
    // can decide between N staggered gunshots and a single volley voice
    // (playCombatVolley) with the full shot count in hand.
    const shots: { x: number; y: number }[] = [];
    let anyHit = false;

    for (const unit of this.cowboyUnits) {
      if (!this.isCowboyUnitAlive(unit)) {
        continue;
      }
      const position = { x: unit.image.x, y: unit.image.y };
      const target = this.resolveUnitFireTarget(unit, position, rangePx);
      if (!target) {
        continue;
      }
      // Phase 57: same damage-application pattern for either kind - a plain
      // subtract-then-check-for-death, just against a Raider's local .hp or a
      // RaiderCamp's module-owned hp (via damageCamp/state/raiderCamps.ts).
      if (target.kind === 'raider') {
        target.raider.hp -= COWBOY_DAMAGE;
        this.spawnCowboyShotVisual(position, target.raider.image);
      } else {
        this.damageCamp(target.camp, COWBOY_DAMAGE, position);
      }
      shots.push(position);
      anyHit = true;
    }

    this.playCombatVolley(shots);
    if (anyHit) {
      // One hit acknowledgement per tick, not per shot: the engine would
      // throttle the rest anyway and they'd only muddy the volley.
      const first = shots[0];
      playWorldSound('raiderHit', first.x, first.y);
    }
  }

  /**
   * Phase 40: a unit under a live, in-range attack order focus-fires that
   * specific target - ignoring whatever raider is nearest - so it doesn't get
   * pulled off its ordered target mid-fight. resolveUnitAttackOrders already
   * ran earlier this same tick and either closed the distance or is holding
   * position, so "still out of range" here just means "keep approaching,
   * don't fire yet" rather than falling back to auto-targeting.
   *
   * Phase 57: generalized to a small tagged union so this can resolve either
   * a Raider or (only ever via an explicit order - never the default
   * nearest-in-range fallback below, since a camp is a static objective, not
   * a threat a defender should reflexively engage) a RaiderCamp.
   */
  private resolveUnitFireTarget(
    unit: CombatUnit,
    position: { x: number; y: number },
    rangePx: number,
  ): { kind: 'raider'; raider: Raider } | { kind: 'camp'; camp: RaiderCamp } | null {
    if (unit.attackTarget) {
      if (unit.attackTarget.kind === 'raider') {
        const raider = this.raiders.find(
          (candidate) => candidate.id === unit.attackTarget!.id && candidate.hp > 0,
        );
        if (raider) {
          const distance = Phaser.Math.Distance.Between(position.x, position.y, raider.image.x, raider.image.y);
          return distance <= rangePx ? { kind: 'raider', raider } : null;
        }
      } else {
        const camp = getRaiderCampById(unit.attackTarget.id);
        if (camp && camp.hp > 0) {
          const distance = Phaser.Math.Distance.Between(position.x, position.y, camp.x, camp.y);
          return distance <= rangePx ? { kind: 'camp', camp } : null;
        }
      }
    }
    const raider = this.findNearestRaider(position.x, position.y, rangePx);
    return raider ? { kind: 'raider', raider } : null;
  }

  /**
   * Phase 38: Watchtowers fire automatically - no selection/move-order, no
   * player unit to command - so this mirrors resolveCowboyFire's shape
   * (gather shots, apply damage, one shared volley/hit sound) but iterates
   * staffed Watchtower buildings instead of CombatUnits, reusing
   * findNearestRaider/spawnCowboyShotVisual/playCombatVolley as-is rather
   * than duplicating any of that logic for a second shooter type.
   */
  private resolveWatchtowerFire(): void {
    const rangePx = WATCHTOWER_RANGE_TILES * TILE_SIZE;
    const shots: { x: number; y: number }[] = [];
    let anyHit = false;

    for (const building of getPlacedBuildings()) {
      if (building.type !== BuildingType.Watchtower) {
        continue;
      }
      if (building.hp <= 0 || building.disabled || !building.staffed) {
        continue;
      }
      const position = this.tileCenter(building);
      const target = this.findNearestRaider(position.x, position.y, rangePx);
      if (!target) {
        continue;
      }
      target.hp -= WATCHTOWER_DAMAGE;
      this.spawnCowboyShotVisual(position, target.image);
      shots.push(position);
      anyHit = true;
    }

    this.playCombatVolley(shots);
    if (anyHit) {
      const first = shots[0];
      playWorldSound('raiderHit', first.x, first.y);
    }
  }

  private findNearestRaider(x: number, y: number, maxDistance: number): Raider | null {
    let best: Raider | null = null;
    let bestDistance = maxDistance;

    for (const raider of this.raiders) {
      if (raider.hp <= 0) {
        continue;
      }
      const distance = Phaser.Math.Distance.Between(x, y, raider.image.x, raider.image.y);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = raider;
      }
    }

    return best;
  }

  /** Cheap fire-and-forget visual: a plain line, faded and destroyed shortly after - no projectile-physics/travel-time simulation. */
  private spawnCowboyShotVisual(from: { x: number; y: number }, to: Phaser.GameObjects.Image): void {
    const line = this.add.graphics().setDepth(COWBOY_SHOT_DEPTH);
    line.lineStyle(2, COWBOY_SHOT_COLOR, 1);
    line.lineBetween(from.x, from.y, to.x, to.y);
    this.cowboyShotGraphics.push(line);

    this.tweens.add({
      targets: line,
      alpha: 0,
      duration: COWBOY_SHOT_FADE_MS,
      onComplete: () => {
        line.destroy();
        const index = this.cowboyShotGraphics.indexOf(line);
        if (index >= 0) {
          this.cowboyShotGraphics.splice(index, 1);
        }
      },
    });
  }

  private removeDeadRaiders(): void {
    const survivors: Raider[] = [];
    for (const raider of this.raiders) {
      if (raider.hp > 0) {
        survivors.push(raider);
        continue;
      }
      this.tweens.killTweensOf(raider.image);
      playWorldSound('unitDeath', raider.image.x, raider.image.y);
      raider.image.destroy();
    }
    this.raiders = survivors;

    if (this.raidActive && this.raiders.length === 0) {
      this.endRaidWave();
    }
  }

  /** Reached either when every raider in the wave is dead (removeDeadRaiders) or the wave timeout fires - whichever comes first. */
  private endRaidWave(): void {
    if (!this.raidActive) {
      return;
    }
    this.raidActive = false;
    this.raidWaveTimer?.remove();
    this.raidWaveTimer = null;
    this.hideRaidNotice();

    for (const raider of this.raiders) {
      this.tweens.killTweensOf(raider.image);
      raider.image.destroy();
    }
    this.raiders = [];
  }

  /**
   * Cancels the pending raid-check timer entirely (rather than letting it
   * fire on stale timing) and starts a fresh one with a new random delay, so
   * a just-reset game doesn't inherit a countdown from the previous run.
   */
  private resetRaidState(): void {
    this.raidWaveTimer?.remove();
    this.raidWaveTimer = null;
    this.raidCheckTimer?.remove();
    this.raidCheckTimer = null;
    this.raidWarningTimer?.remove();
    this.raidWarningTimer = null;

    for (const raider of this.raiders) {
      this.tweens.killTweensOf(raider.image);
      raider.image.destroy();
    }
    this.raiders = [];

    for (const shot of this.cowboyShotGraphics) {
      this.tweens.killTweensOf(shot);
      shot.destroy();
    }
    this.cowboyShotGraphics = [];

    this.raidActive = false;
    this.hideRaidNotice();

    // Phase 45: a wave's damage flashes/off-screen pings are wave-scoped like
    // everything else reset here - a flash left over from the previous run
    // would otherwise render at a stale tile until it happened to expire.
    this.minimapBuildingFlashes.clear();
    this.offscreenThreats.clear();

    this.scheduleNextRaidCheck();
  }

  /**
   * Phase 57: Raider Camps (Offense Phase). Camps are persistent hostile
   * structures rather than another wave-scoped combat entity, so their
   * existence/hp live in state/raiderCamps.ts (Phase 52-style persistence,
   * see that module's doc comment) instead of alongside the ephemeral
   * Raider[]/raidActive state above. This scene still owns every camp's
   * sprite (campVisuals) and decides *when* the initial batch appears -
   * once, on the first dawn at/after RAIDER_CAMP_SPAWN_DAY, mirroring the
   * once-per-dawn guard setupSaveLoad's autosave already uses.
   */
  private setupRaiderCamps(): void {
    gameEvents.on('day-phase-changed', ({ dayNumber, phase }: DayPhaseChange) => {
      if (this.initialCampsSpawned || phase !== 'day' || dayNumber < RAIDER_CAMP_SPAWN_DAY) {
        return;
      }
      this.initialCampsSpawned = true;
      this.spawnInitialRaiderCamps();
    });
  }

  private spawnInitialRaiderCamps(): void {
    const count = Phaser.Math.Between(RAIDER_CAMP_MIN_COUNT, RAIDER_CAMP_MAX_COUNT);
    for (let i = 0; i < count; i++) {
      const spawn = this.pickRaidSpawnPoint();
      const faction = this.pickRaidFaction();
      const camp = spawnRaiderCamp(spawn.x, spawn.y, faction, RAIDER_CAMP_MAX_HP);
      this.createCampVisual(camp);
    }
    this.redrawMinimap();
  }

  private createCampVisual(camp: RaiderCamp): void {
    const image = this.add
      .image(camp.x, camp.y, RAIDER_CAMPS_ATLAS_KEY, raiderCampTextureKey(camp.faction))
      .setDepth(RAIDER_CAMP_SPRITE_DEPTH);
    this.campVisuals.set(camp.id, image);
  }

  /** Called from setupSaveLoad's 'game-loaded' handler - rebuilds every persisted camp's sprite from state/raiderCamps.ts, mirroring restoreBuildingVisual's role for PlacedBuildings. */
  private restoreCampVisuals(): void {
    for (const camp of getRaiderCamps()) {
      this.createCampVisual(camp);
    }
  }

  /**
   * Applies a unit's shot to a camp: the shot-line visual (same
   * spawnCowboyShotVisual helper a raider hit uses) plus the actual hp
   * mutation, routed through state/raiderCamps.ts's damageRaiderCamp so gameState's
   * sibling module stays the single source of truth for camp hp exactly like
   * building.hp is for buildings.
   */
  private damageCamp(camp: RaiderCamp, amount: number, shooterPosition: { x: number; y: number }): void {
    const image = this.campVisuals.get(camp.id);
    if (image) {
      this.spawnCowboyShotVisual(shooterPosition, image);
    }
    const remaining = damageRaiderCamp(camp.id, amount);
    if (remaining !== null && remaining <= 0) {
      this.destroyRaiderCamp(camp);
    }
  }

  /**
   * A camp reaching 0 hp is removed outright (no repair/rebuild path, unlike
   * a PlacedBuilding) and drops a flat loot reward - the whole point of the
   * offense phase is that raiding a camp is worth the trip. Any unit still
   * holding an attack order on this camp has it cleared the same way
   * resolveUnitAttackOrders already clears one pointed at a dead raider.
   */
  private destroyRaiderCamp(camp: RaiderCamp): void {
    const image = this.campVisuals.get(camp.id);
    if (image) {
      this.tweens.killTweensOf(image);
      image.destroy();
      this.campVisuals.delete(camp.id);
    }
    removeRaiderCamp(camp.id);

    for (const unit of this.cowboyUnits) {
      if (unit.attackTarget?.kind === 'camp' && unit.attackTarget.id === camp.id) {
        unit.attackTarget = null;
      }
    }

    this.spawnDustBurstAt(camp.x, camp.y);
    playWorldSound('buildingCollapse', camp.x, camp.y);

    grantRaiderCampLoot(RAIDER_CAMP_LOOT_MONEY, { tools: RAIDER_CAMP_LOOT_TOOLS });
    const message = `${RAIDER_DEFINITIONS[camp.faction].label} camp destroyed! +$${RAIDER_CAMP_LOOT_MONEY}, +${RAIDER_CAMP_LOOT_TOOLS} Tools`;
    addNotification(message, 'info', getElapsedSeconds());

    this.redrawMinimap();
  }

  /**
   * Mirrors the villager/unit cleanup setupGameReset already does for its own
   * kind: gameState.resetGame() already cleared the underlying camp list
   * (its own resetRaiderCamps() call), so this only tears down the now-
   * orphaned scene-side sprites and re-arms the once-per-run initial spawn.
   */
  private resetRaiderCampVisuals(): void {
    for (const image of this.campVisuals.values()) {
      this.tweens.killTweensOf(image);
      image.destroy();
    }
    this.campVisuals.clear();
    this.initialCampsSpawned = false;
  }

  private pointerToTile(pointer: Phaser.Input.Pointer): { tileX: number; tileY: number } {
    return {
      tileX: Math.floor(pointer.worldX / TILE_SIZE),
      tileY: Math.floor(pointer.worldY / TILE_SIZE),
    };
  }
}
