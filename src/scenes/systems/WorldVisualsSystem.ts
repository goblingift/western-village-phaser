import Phaser from 'phaser';
import { CHURCH_BASE_RADIUS_TILES, TILE_SIZE } from '../../config/constants';
import { getResourceChainBuildingTypes } from '../../config/resourceGraph';
import {
  VEGETATION_ATLAS_KEY,
  vegetationTextureKey,
} from '../../config/vegetationConfig';
import { VegetationEntity, countVegetationInRadius, getVegetation } from '../../state/vegetation';
import {
  ACCENTS_ATLAS_KEY,
  AccentKind,
  ANIMALS_ATLAS_KEY,
  ANIMAL_SPRITE_SIZE,
  BUILDING_ATLAS_KEY,
  BUILDING_DEFINITIONS,
  BuildingType,
  HOUSE_TIER_CONFIG,
  HouseTier,
  PlacedBuilding,
  ResourceKey,
  UnitKind,
  accentTextureKey,
  animalTextureKey,
  buildingTextureKey,
  getWorkersRequired,
} from '../../config/buildingConfig';
import { gameEvents } from '../../state/gameEvents';
import {
  DayPhase,
  getBuildingById,
  getChurchRadius,
  getDayPhase,
  getEnclosureFor,
  getFenceLinks,
  getHarvestCenterTile,
  getPlacedBuildings,
  isServedByChurch,
} from '../../state/gameState';
import type { MainScene } from '../MainScene';

/** Phase 30: trees/cacti render above the ground layer but below buildings (depth 10). */
const VEGETATION_DEPTH = 5;

const ANIMAL_SPRITE_DEPTH = 11;
const ANIMAL_SLOT_GAP = 2;
const ANIMAL_SLOT_STEP = ANIMAL_SPRITE_SIZE + ANIMAL_SLOT_GAP;
const ANIMAL_WANDER_RADIUS_MIN = 10;
const ANIMAL_WANDER_RADIUS_MAX = 12;
const ANIMAL_WANDER_BOB_PX = 4;
const ANIMAL_WANDER_DURATION_MIN_MS = 900;
const ANIMAL_WANDER_DURATION_MAX_MS = 1600;
const ANIMAL_WANDER_DELAY_MAX_MS = 1000;

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

/** Above villagers (12); HP bars sit topmost of the per-building layers so damage is always visible. */
const HP_BAR_DEPTH = 13;
const HP_BAR_HEIGHT = 4;
const HP_BAR_MARGIN_ABOVE_BUILDING = 3;
const HP_BAR_BG_COLOR = 0x2b1d12;
const HP_BAR_FILL_COLOR = 0x4caf50;
const HP_BAR_EMPTY_COLOR = 0xd32f2f;

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
 * Real Fence Enclosures debug overlay. Off by default, toggled with the 'E'
 * hotkey (MainScene.setupHotkeys) - the same bare-toggle-emit convention
 * 'C'/'V' already use. Reuses the harvest ring's exact style (a tinted fill
 * per tile plus a stroked outline, drawn under buildings) rather than
 * inventing a second visual language: green means a valid (closed) enclosure,
 * red means open/not enclosed at all. Drawn on demand only - redrawn on
 * 'building-placed'/'building-removed'/'game-loaded'/'game-reset' (whichever
 * might have changed a farm's cached enclosure), never per-tick or per-frame.
 */
const ENCLOSURE_DEBUG_DEPTH = 6.2;
const ENCLOSURE_DEBUG_FILL_ALPHA = 0.16;
const ENCLOSURE_VALID_COLOR = 0x4caf50;
const ENCLOSURE_OPEN_COLOR = 0xef5350;

/**
 * Enclosure Detection Fix & Exit Indicator: a placement AID, not a rule -
 * drawn one tile outside a deterministic edge of the farm's footprint
 * (bottom-center, projected south) so the same farm always suggests the same
 * spot across redraws.
 */
const ENCLOSURE_EXIT_HINT_DEPTH = 6.3;
const ENCLOSURE_EXIT_HINT_COLOR = 0xffca28;
const ENCLOSURE_EXIT_HINT_ARROW_LENGTH_PX = 14;
const ENCLOSURE_EXIT_HINT_ARROW_WIDTH_PX = 10;

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
const NIGHT_ACCENT_MAX_ALPHA = 0.95;
const CAMPFIRE_FLICKER_MS = 420;
/** Cool blue-grey multiply tint applied to tree/cactus sprites at night; daytime is untinted. */
const VEGETATION_NIGHT_TINT = 0x6f86b8;

const FENCE_LINE_COLOR = 0x8d6748;
/** Phase 48: chain-view map overlay outline color - gold, distinct from the green connection outline and the red/blue minimap combat dots. */
const CHAIN_VIEW_HIGHLIGHT_COLOR = 0xffd54f;

/**
 * Phase 86: MainScene Decomposition Part 2 - World Visuals.
 *
 * A pure code-move out of MainScene.ts: building/animal/accent visual
 * creation, fence/connection-line/chain-view drawing, building HP bars,
 * understaffed/upkeep-unpaid status badges, harvest-radius/Church-service
 * rings, the enclosure debug overlay and exit-hint arrow, and vegetation
 * sprite management. Follows RaidSystem.ts's exact plain-class pattern -
 * constructed once in MainScene.create() as `new WorldVisualsSystem(this)`,
 * holding a reference to the owning scene for every Phaser facility and
 * MainScene helper this code still needs.
 *
 * What deliberately did NOT move: unit/raider/camp HP bars
 * (redrawUnitHpBars/drawUnitHpBar/getUnitHp) stay on MainScene - they are
 * fused with combat/unit state (cowboyUnits, RaidSystem.raiders, Raider
 * Camps), not building visuals, and are a genuinely distinct function from
 * redrawHpBars (verified: no shared implementation). Villager/goods-cart/
 * wildlife visuals moved to the sibling AmbientLifeSystem instead. Minimap
 * drawing, input/camera, and unit control all stay on MainScene (Phase 87
 * scope).
 */
export class WorldVisualsSystem {
  private scene: MainScene;

  buildingVisuals = new Map<string, BuildingVisual>();
  vegetationImages = new Map<string, Phaser.GameObjects.Image>();

  private connectionGraphics!: Phaser.GameObjects.Graphics;
  private fenceLineGraphics!: Phaser.GameObjects.Graphics;
  private hpBarGraphics!: Phaser.GameObjects.Graphics;
  private harvestRingGraphics!: Phaser.GameObjects.Graphics;
  private statusBadgeGraphics!: Phaser.GameObjects.Graphics;
  /** Real Fence Enclosures debug overlay - off by default, toggled by the 'E' hotkey. */
  private enclosureDebugGraphics!: Phaser.GameObjects.Graphics;
  private enclosureDebugVisible = false;
  /** Always-on (not gated by the 'E' debug toggle) suggested-wall-spot arrow, one shared Graphics object. */
  private enclosureExitHintGraphics!: Phaser.GameObjects.Graphics;
  /** Phase 48: chain-view map overlay - which resource (if any) ResourceHudPanel currently has selected, and a single shared Graphics redrawn on selection/placement changes. */
  private selectedResourceKey: ResourceKey | null = null;
  /** Phase 48: 'C' toggles the overlay's visibility without forgetting the selection, distinct from Escape/re-click which clears it outright. */
  private chainViewVisible = true;
  private chainViewGraphics!: Phaser.GameObjects.Graphics;

  constructor(scene: MainScene) {
    this.scene = scene;
  }

  // ---------------------------------------------------------------------
  // Vegetation
  // ---------------------------------------------------------------------

  setupVegetationVisuals(): void {
    this.redrawAllVegetation();

    gameEvents.on('vegetation-added', (entity: VegetationEntity) => {
      this.addVegetationSprite(entity);
      this.scene.minimapSystem.redrawMinimap();
    });

    gameEvents.on('vegetation-removed', (entity: VegetationEntity) => {
      const image = this.vegetationImages.get(entity.id);
      if (image) {
        this.scene.tweens.killTweensOf(image);
        image.destroy();
        this.vegetationImages.delete(entity.id);
      }
      this.scene.minimapSystem.redrawMinimap();
    });
  }

  private addVegetationSprite(entity: VegetationEntity): void {
    const image = this.scene.add
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

  /** Called from MainScene's create()/game-reset/game-loaded handlers. */
  redrawAllVegetation(): void {
    for (const image of this.vegetationImages.values()) {
      this.scene.tweens.killTweensOf(image);
      image.destroy();
    }
    this.vegetationImages.clear();

    for (const entity of getVegetation()) {
      this.addVegetationSprite(entity);
    }
  }

  /** Cool blue-grey multiply tint on every tree/cactus at night; cleared at dawn. Called from MainScene's day/night cycle handler. */
  applyVegetationTint(phase: DayPhase): void {
    for (const image of this.vegetationImages.values()) {
      if (phase === 'night') {
        image.setTint(VEGETATION_NIGHT_TINT);
      } else {
        image.clearTint();
      }
    }
  }

  // ---------------------------------------------------------------------
  // Building visual creation
  // ---------------------------------------------------------------------

  /**
   * The visual-creation half of placeBuildingAt (image + animals + accents +
   * villagers), split out in Phase 52 so a loaded save's restoreBuildingVisual
   * can build the exact same visual for a building it didn't just place
   * through gameState.placeBuilding - avoiding a second, parallel
   * visual-creation path that could drift from this one.
   */
  createVisualForBuilding(building: PlacedBuilding): BuildingVisual {
    const image = this.scene.add
      .image(
        building.tileX * TILE_SIZE,
        building.tileY * TILE_SIZE,
        BUILDING_ATLAS_KEY,
        buildingTextureKey(building.type, building.houseTier, building.gateOpen),
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
    if (
      building.type === BuildingType.Fence ||
      building.type === BuildingType.Gate ||
      building.type === BuildingType.WoodenWall ||
      building.type === BuildingType.WoodenGate
    ) {
      // connections-updated already fired before this building's visual existed; redraw now that it does.
      this.redrawFenceLines();
    }
    this.redrawAnimalSprites(visual);
    this.createBuildingAccents(visual);
    if (building.type === BuildingType.House) {
      this.scene.ambientLifeSystem.spawnVillagersForHouse(building);
    }
    return visual;
  }

  /**
   * Phase 52: the load-time counterpart to placeBuildingAt. Builds the exact
   * same visual (createVisualForBuilding) but additionally re-spawns any
   * garrisoned units the restored building's per-kind HP arrays record - a
   * freshly-placed building can never have these (see placeBuildingAt's
   * comment), but a loaded one can. Spawned at the unit's static home slot
   * (spawnUnitOfKind), not wherever it was standing when the save was made -
   * see persistence.ts's doc comment for why live unit position is out of
   * scope for this phase. Phase 58: a Barracks now has three garrisoned kinds
   * to restore instead of one.
   */
  restoreBuildingVisual(building: PlacedBuilding): void {
    this.createVisualForBuilding(building);

    const restoreKind = (kind: UnitKind, hpArray: number[]) => {
      for (let index = 0; index < hpArray.length; index++) {
        if (hpArray[index] > 0) {
          this.scene.spawnUnitOfKind(building, kind, index);
        }
      }
    };

    if (building.type === BuildingType.Barracks) {
      restoreKind('cowboy', building.cowboyHp);
      restoreKind('brawler', building.brawlerHp);
      restoreKind('dynamiter', building.dynamiterHp);
    } else if (building.type === BuildingType.Horsery) {
      restoreKind('cowboyOnHorse', building.mountedCowboyHp);
    }
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
      this.scene.tweens.add({
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
    const nightFactor = this.scene.nightOverlay.getNightFactor();
    for (const accent of visual.nightAccents) {
      accent.setAlpha(nightFactor * NIGHT_ACCENT_MAX_ALPHA);
    }
  }

  private createAccentImage(x: number, y: number, kind: AccentKind): Phaser.GameObjects.Image {
    return this.scene.add.image(x, y, ACCENTS_ATLAS_KEY, accentTextureKey(kind)).setDepth(ACCENT_DEPTH);
  }

  /** Crank bar pivots from its own center, between the well's support posts; starts at -15deg so the yoyo tween sweeps it through 0 up to +15deg. */
  private createWellCrankAccent(originX: number, originY: number): Phaser.GameObjects.Image {
    const crank = this.createAccentImage(originX + 16, originY + 2, 'WellCrank').setOrigin(0.5, 0.5);
    crank.setAngle(-WELL_CRANK_ANGLE_DEG);

    this.scene.tweens.add({
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

    this.scene.tweens.add({
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

    this.scene.tweens.add({
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

    this.scene.tweens.add({
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
      const puff = this.scene.add
        .circle(startX, startY, HOUSE_SMOKE_PUFF_RADIUS, HOUSE_SMOKE_COLOR, HOUSE_SMOKE_START_ALPHA)
        .setDepth(ACCENT_DEPTH);
      const duration = Phaser.Math.Between(HOUSE_SMOKE_DURATION_MIN_MS, HOUSE_SMOKE_DURATION_MAX_MS);

      this.scene.tweens.add({
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

  /** Fades every building's night-only accents in/out on a day/night transition. Called from MainScene's day/night cycle handler. */
  fadeNightAccents(phase: DayPhase, durationMs: number): void {
    const target = phase === 'night' ? NIGHT_ACCENT_MAX_ALPHA : 0;
    for (const visual of this.buildingVisuals.values()) {
      for (const accent of visual.nightAccents) {
        this.scene.tweens.add({
          targets: accent,
          alpha: target,
          duration: durationMs,
          ease: 'Sine.easeInOut',
        });
      }
    }
  }

  // ---------------------------------------------------------------------
  // Animal sprites
  // ---------------------------------------------------------------------

  /** Only called on placement and 'animal-bought' (i.e. when animalCount actually changes), never per production tick. */
  redrawAnimalSprites(visual: BuildingVisual): void {
    for (const animalImage of visual.animalImages) {
      this.scene.tweens.killTweensOf(animalImage);
      animalImage.destroy();
    }
    visual.animalImages = [];

    const animalConfig = BUILDING_DEFINITIONS[visual.building.type].animal;
    if (!animalConfig) {
      return;
    }

    for (let index = 0; index < visual.building.animalCount; index++) {
      const slot = this.getAnimalSlotPosition(visual.building, index);
      const animalImage = this.scene.add
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

    this.scene.tweens.add({
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

  // ---------------------------------------------------------------------
  // Connection / fence / chain-view lines
  // ---------------------------------------------------------------------

  setupConnectionVisuals(): void {
    this.connectionGraphics = this.scene.add.graphics();
    this.connectionGraphics.setDepth(20);

    gameEvents.on('connections-updated', () => this.redrawConnectionOutlines());
  }

  /** Phase 86: non-private - MainScene's setupBuildingRemoval() redraws this eagerly right after a removal, ahead of the next 'connections-updated' emit. */
  redrawConnectionOutlines(): void {
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

  setupFenceVisuals(): void {
    this.fenceLineGraphics = this.scene.add.graphics();
    this.fenceLineGraphics.setDepth(15);

    gameEvents.on('connections-updated', () => this.redrawFenceLines());
  }

  redrawFenceLines(): void {
    this.fenceLineGraphics.clear();
    this.fenceLineGraphics.lineStyle(4, FENCE_LINE_COLOR, 1);

    for (const { fromId, toId } of getFenceLinks()) {
      const from = this.buildingVisuals.get(fromId);
      const to = this.buildingVisuals.get(toId);
      if (!from || !to) {
        continue;
      }
      const fromCenter = this.scene.tileCenter(from.building);
      const toCenter = this.scene.tileCenter(to.building);
      this.fenceLineGraphics.lineBetween(fromCenter.x, fromCenter.y, toCenter.x, toCenter.y);
    }
  }

  /**
   * Phase 48: Chain Encyclopedia & Resource Tooltips' map-side half. Mirrors
   * redrawConnectionOutlines' one-shared-Graphics-object approach rather than
   * a GameObject per highlighted building - a rect stroke per currently-
   * placed building whose type produces or consumes the ResourceHudPanel-
   * selected resource. Redrawn on selection change and on
   * 'connections-updated' (fired on every placement/removal, regardless of
   * building type) so a newly-placed matching building lights up without a
   * dedicated 'building-placed' listener.
   */
  setupChainView(): void {
    this.chainViewGraphics = this.scene.add.graphics();
    this.chainViewGraphics.setDepth(21);

    gameEvents.on('resource-selected', (key: ResourceKey | null) => {
      this.selectedResourceKey = key;
      this.redrawChainViewHighlight();
    });
    gameEvents.on('connections-updated', () => this.redrawChainViewHighlight());

    this.scene.input.keyboard?.on('keydown-ESC', () => {
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
  toggleChainViewVisibility(): void {
    if (!this.selectedResourceKey) {
      return;
    }
    this.chainViewVisible = !this.chainViewVisible;
    this.redrawChainViewHighlight();
  }

  // ---------------------------------------------------------------------
  // Building HP bars
  // ---------------------------------------------------------------------

  setupHpBarVisuals(): void {
    this.hpBarGraphics = this.scene.add.graphics();
    this.hpBarGraphics.setDepth(HP_BAR_DEPTH);

    // Redrawn every tick (cheap at this building count) rather than only on
    // damage events, since no damage source exists yet - this keeps the bars
    // correct automatically once one is added later.
    gameEvents.on('production-tick', () => this.redrawHpBars());
  }

  redrawHpBars(): void {
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

  // ---------------------------------------------------------------------
  // Status badges (understaffed / upkeep-unpaid)
  // ---------------------------------------------------------------------

  /**
   * Phase 34: understaffed / upkeep-unpaid badge over the building sprite.
   *
   * These two states are by far the most common reason a building silently
   * produces nothing, and until now the only way to find out was to click the
   * building and read the info panel. Redrawn on the production tick
   * alongside the HP bars, since both staffing and upkeep are recomputed
   * from scratch every tick in gameState.
   */
  setupStatusBadges(): void {
    this.statusBadgeGraphics = this.scene.add.graphics().setDepth(STATUS_BADGE_DEPTH);
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

  // ---------------------------------------------------------------------
  // Harvest radius / Church service ring
  // ---------------------------------------------------------------------

  /**
   * Phase 34: the harvest radius, drawn both while previewing a harvester's
   * placement and while one is selected. Deliberately drawn as a square
   * rather than a circle: findNearestVegetation/countVegetationInRadius both
   * use a square (Chebyshev) radius test, so a circle would be a picture of a
   * rule the game does not implement - the corners would look out of range
   * and still be harvested.
   *
   * Phase 70: reused verbatim for Church's service radius (also a square/
   * Chebyshev distance test) rather than a second Graphics object and
   * event-wiring block, since the two rings are drawn in the exact same two
   * contexts (placement preview, currently-selected building) and never need
   * to be visible simultaneously.
   */
  setupHarvestRadiusRing(): void {
    this.harvestRingGraphics = this.scene.add.graphics().setDepth(HARVEST_RING_DEPTH);

    gameEvents.on('building-selected', () => this.redrawHarvestRing());
    gameEvents.on('cancel-placement', () => this.redrawHarvestRing());
    // Vegetation appearing/disappearing inside the ring flips its colour.
    gameEvents.on('vegetation-added', () => this.redrawHarvestRing());
    gameEvents.on('vegetation-removed', () => this.redrawHarvestRing());
    // Phase 70: hiring clergy changes a live Church's radius/coverage; a
    // production tick can flip a House's served/unserved status even with no
    // radius change (a Church going unstaffed/disabled/destroyed).
    gameEvents.on('money-changed', () => this.redrawHarvestRing());
    gameEvents.on('production-tick', () => this.redrawHarvestRing());
    gameEvents.on('game-reset', () => this.harvestRingGraphics.clear());
  }

  /** Phase 86: exposed so MainScene's line-placement drag (which draws its own cost/preview UI in place of the harvest ring) can blank it without needing a full re-derivation. */
  clearHarvestRing(): void {
    this.harvestRingGraphics.clear();
  }

  /**
   * Drawn for whichever of the two contexts is live: the placement preview
   * takes priority (the player is actively deciding where to put one), and
   * otherwise the currently selected building's own radius is shown.
   */
  redrawHarvestRing(previewTileX?: number, previewTileY?: number): void {
    this.harvestRingGraphics.clear();

    const selectedType = this.scene.selectedType;
    if (selectedType !== null) {
      const harvest = BUILDING_DEFINITIONS[selectedType].harvest;
      if (harvest && previewTileX !== undefined && previewTileY !== undefined) {
        const center = getHarvestCenterTile(previewTileX, previewTileY, selectedType);
        this.drawHarvestRing(center.tileX, center.tileY, harvest.radiusTiles, harvest.kind);
      } else if (
        selectedType === BuildingType.Church &&
        previewTileX !== undefined &&
        previewTileY !== undefined
      ) {
        // A freshly-placed Church starts with 0 clergy, so the preview shows
        // just its base radius (CHURCH_BASE_RADIUS_TILES) - no live building
        // exists yet to read nunCount/priestCount off of.
        const center = getHarvestCenterTile(previewTileX, previewTileY, selectedType);
        this.drawServiceRing(center.tileX, center.tileY, CHURCH_BASE_RADIUS_TILES, true);
      }
      return;
    }

    const selectedBuildingId = this.scene.selectedBuildingId;
    const selected = selectedBuildingId ? getBuildingById(selectedBuildingId) : null;
    if (!selected) {
      return;
    }
    const harvest = BUILDING_DEFINITIONS[selected.type].harvest;
    if (harvest) {
      const center = getHarvestCenterTile(selected.tileX, selected.tileY, selected.type);
      this.drawHarvestRing(center.tileX, center.tileY, harvest.radiusTiles, harvest.kind);
      return;
    }
    if (selected.type === BuildingType.Church) {
      const center = getHarvestCenterTile(selected.tileX, selected.tileY, selected.type);
      // A Church's own ring is always "served" green - it's the source of
      // coverage, not a consumer of it; empty/red is reserved for a House
      // with nothing covering it (see the House branch below).
      this.drawServiceRing(center.tileX, center.tileY, getChurchRadius(selected), true);
      return;
    }
    if (selected.type === BuildingType.House) {
      const tierConfig = HOUSE_TIER_CONFIG[selected.houseTier];
      const nextTier = selected.houseTier < 3 ? ((selected.houseTier + 1) as HouseTier) : null;
      const nextTierConfig = nextTier !== null ? HOUSE_TIER_CONFIG[nextTier] : null;
      if (tierConfig.requiresChurch || nextTierConfig?.requiresChurch) {
        // A House has no radius of its own to draw - instead, ring the
        // nearest Church's actual coverage area (if any) so the player can
        // see at a glance whether this House sits inside it. No Church at
        // all anywhere on the map simply draws nothing (there's no radius to
        // show), matching the harvest ring's own "nothing to draw" behavior
        // when a harvester has no vegetation kind configured.
        this.drawNearestChurchRingFor(selected);
      }
    }
  }

  /** Finds and rings whichever Church is actually serving (or nearly serving) `house` - the nearest one, regardless of whether it currently qualifies, so the player can see how close they are. */
  private drawNearestChurchRingFor(house: PlacedBuilding): void {
    const houseCenter = getHarvestCenterTile(house.tileX, house.tileY, house.type);
    let nearest: PlacedBuilding | null = null;
    let nearestDistance = Infinity;
    for (const building of getPlacedBuildings()) {
      if (building.type !== BuildingType.Church) {
        continue;
      }
      const churchCenter = getHarvestCenterTile(building.tileX, building.tileY, building.type);
      const distance = Math.max(
        Math.abs(houseCenter.tileX - churchCenter.tileX),
        Math.abs(houseCenter.tileY - churchCenter.tileY),
      );
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = building;
      }
    }
    if (!nearest) {
      return;
    }
    const center = getHarvestCenterTile(nearest.tileX, nearest.tileY, nearest.type);
    this.drawServiceRing(center.tileX, center.tileY, getChurchRadius(nearest), isServedByChurch(house));
  }

  private drawHarvestRing(
    centerTileX: number,
    centerTileY: number,
    radiusTiles: number,
    kind: VegetationEntity['kind'],
  ): void {
    const hasVegetation = countVegetationInRadius(kind, centerTileX, centerTileY, radiusTiles) > 0;
    this.drawServiceRing(centerTileX, centerTileY, radiusTiles, hasVegetation);
  }

  /** The shared square-ring (Chebyshev) primitive both the harvest radius and Church's service radius draw through - green when `ok`, red otherwise. */
  private drawServiceRing(centerTileX: number, centerTileY: number, radiusTiles: number, ok: boolean): void {
    const color = ok ? HARVEST_RING_COLOR : HARVEST_RING_EMPTY_COLOR;

    const px = (centerTileX - radiusTiles) * TILE_SIZE;
    const py = (centerTileY - radiusTiles) * TILE_SIZE;
    const size = (radiusTiles * 2 + 1) * TILE_SIZE;

    this.harvestRingGraphics.fillStyle(color, HARVEST_RING_FILL_ALPHA);
    this.harvestRingGraphics.fillRect(px, py, size, size);
    this.harvestRingGraphics.lineStyle(2, color, 0.9);
    this.harvestRingGraphics.strokeRect(px, py, size, size);
  }

  // ---------------------------------------------------------------------
  // Enclosure debug overlay & exit-hint arrow
  // ---------------------------------------------------------------------

  /**
   * Real Fence Enclosures debug overlay: off by default (enclosureDebugVisible
   * starts false), toggled by the 'E' hotkey. Redrawn only on events that
   * could plausibly change a farm's cached enclosure result - never on a
   * timer/per-frame - and a no-op draw (just cleared) whenever it's hidden, so
   * toggling it off costs nothing per tick either.
   */
  setupEnclosureDebugOverlay(): void {
    this.enclosureDebugGraphics = this.scene.add.graphics().setDepth(ENCLOSURE_DEBUG_DEPTH);

    const redraw = () => this.redrawEnclosureDebugOverlay();
    gameEvents.on('building-placed', redraw);
    gameEvents.on('building-removed', redraw);
    gameEvents.on('building-repaired', redraw);
    gameEvents.on('game-loaded', redraw);
    gameEvents.on('game-reset', () => this.enclosureDebugGraphics.clear());
  }

  toggleEnclosureDebugOverlay(): void {
    this.enclosureDebugVisible = !this.enclosureDebugVisible;
    this.redrawEnclosureDebugOverlay();
  }

  private redrawEnclosureDebugOverlay(): void {
    this.enclosureDebugGraphics.clear();
    if (!this.enclosureDebugVisible) {
      return;
    }

    for (const building of getPlacedBuildings()) {
      const animalConfig = BUILDING_DEFINITIONS[building.type].animal;
      if (!animalConfig) {
        continue;
      }
      const enclosure = getEnclosureFor(building.id);
      if (!enclosure) {
        continue;
      }

      if (!enclosure.closed) {
        // Nothing enclosed to shade - just outline the farm's own footprint
        // in red so it's clear at a glance which farms are unfenced.
        const { width, height } = BUILDING_DEFINITIONS[building.type].size;
        this.enclosureDebugGraphics.lineStyle(2, ENCLOSURE_OPEN_COLOR, 0.9);
        this.enclosureDebugGraphics.strokeRect(
          building.tileX * TILE_SIZE,
          building.tileY * TILE_SIZE,
          width * TILE_SIZE,
          height * TILE_SIZE,
        );
        continue;
      }

      this.enclosureDebugGraphics.fillStyle(ENCLOSURE_VALID_COLOR, ENCLOSURE_DEBUG_FILL_ALPHA);
      for (const tile of enclosure.enclosedTiles) {
        this.enclosureDebugGraphics.fillRect(tile.tileX * TILE_SIZE, tile.tileY * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
      this.enclosureDebugGraphics.lineStyle(2, ENCLOSURE_VALID_COLOR, 0.9);
      for (const tile of enclosure.enclosedTiles) {
        this.enclosureDebugGraphics.strokeRect(tile.tileX * TILE_SIZE, tile.tileY * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  /**
   * Enclosure Detection Fix & Exit Indicator: unlike the 'E' debug overlay
   * above (off by default, a diagnostic tool), this arrow is always active -
   * it's a placement aid a player needs to see without knowing a debug
   * hotkey exists. Redrawn on exactly the same set of "a farm's cached
   * enclosure might have changed" events the debug overlay already listens
   * for, plus 'building-selected' (the selected-farm-always-shown half of
   * the visibility rule) and 'cancel-placement' (selection can change
   * without a fresh building-selected emit in a couple of UI paths).
   */
  setupEnclosureExitHint(): void {
    this.enclosureExitHintGraphics = this.scene.add.graphics().setDepth(ENCLOSURE_EXIT_HINT_DEPTH);

    const redraw = () => this.redrawEnclosureExitHints();
    gameEvents.on('building-placed', redraw);
    gameEvents.on('building-removed', redraw);
    gameEvents.on('building-repaired', redraw);
    gameEvents.on('game-loaded', redraw);
    gameEvents.on('building-selected', redraw);
    gameEvents.on('cancel-placement', redraw);
    // Phase 69: a WoodenGate toggling open/closed can flip a nearby farm's
    // enclosure validity the same tick.
    gameEvents.on('gate-state-changed', redraw);
    gameEvents.on('game-reset', () => this.enclosureExitHintGraphics.clear());
  }

  private redrawEnclosureExitHints(): void {
    this.enclosureExitHintGraphics.clear();

    for (const building of getPlacedBuildings()) {
      const animalConfig = BUILDING_DEFINITIONS[building.type].animal;
      if (!animalConfig) {
        continue;
      }
      // Item 4: fires on "not closed" rather than the old "not valid" -
      // once the perimeter is closed there is no more wall to build at this
      // specific spot, whether or not the pen is big enough yet.
      const enclosure = getEnclosureFor(building.id);
      if (enclosure && enclosure.closed) {
        continue;
      }

      const { width, height } = BUILDING_DEFINITIONS[building.type].size;
      // Deterministic anchor: bottom-center tile of the footprint, one tile
      // further south (outside the footprint) - same spot every redraw for a
      // given building, regardless of enclosure state.
      const anchorTileX = building.tileX + Math.floor((width - 1) / 2);
      const anchorTileY = building.tileY + height;
      const px = anchorTileX * TILE_SIZE + TILE_SIZE / 2;
      const py = anchorTileY * TILE_SIZE + TILE_SIZE / 2;
      this.drawExitArrow(px, py);
    }
  }

  /**
   * A small downward-pointing triangle "arrow" suggesting a spot to close off
   * the pen's Fence perimeter - a placement aid only, never a gameplay
   * constraint.
   */
  private drawExitArrow(centerX: number, centerY: number): void {
    const halfLength = ENCLOSURE_EXIT_HINT_ARROW_LENGTH_PX / 2;
    const halfWidth = ENCLOSURE_EXIT_HINT_ARROW_WIDTH_PX / 2;
    const tipY = centerY + halfLength;
    const tailY = centerY - halfLength;
    this.enclosureExitHintGraphics.fillStyle(ENCLOSURE_EXIT_HINT_COLOR, 0.95);
    this.enclosureExitHintGraphics.fillTriangle(
      centerX - halfWidth,
      tailY,
      centerX + halfWidth,
      tailY,
      centerX,
      tipY,
    );
    this.enclosureExitHintGraphics.lineStyle(1, 0x5d4037, 0.8);
    this.enclosureExitHintGraphics.strokeTriangle(
      centerX - halfWidth,
      tailY,
      centerX + halfWidth,
      tailY,
      centerX,
      tipY,
    );
  }

  // ---------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------

  /** Called from MainScene's 'game-reset' handler. */
  resetForGameReset(): void {
    for (const { image, animalImages, accentObjects } of this.buildingVisuals.values()) {
      image.destroy();
      for (const animalImage of animalImages) {
        this.scene.tweens.killTweensOf(animalImage);
        animalImage.destroy();
      }
      for (const accentObject of accentObjects) {
        this.scene.tweens.killTweensOf(accentObject);
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
    this.statusBadgeGraphics.clear();
    this.harvestRingGraphics.clear();
    this.enclosureDebugGraphics.clear();
    this.enclosureExitHintGraphics.clear();

    // gameState.resetGame reseeds vegetation before emitting 'game-reset', so
    // rebuilding every sprite from the current entity list here picks up the
    // new layout.
    this.redrawAllVegetation();
  }
}

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
