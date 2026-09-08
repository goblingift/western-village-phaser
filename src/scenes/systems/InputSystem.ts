import Phaser from 'phaser';
import {
  CAMERA_KEYBOARD_PAN_SPEED_PX_PER_SEC,
  CAMERA_MAX_ZOOM,
  CAMERA_MIN_ZOOM,
  CAMERA_ZOOM_STEP,
  MAP_HEIGHT_TILES,
  MAP_WIDTH_TILES,
  ROAD_UNIT_SPEED_MULTIPLIER,
  ROAD_UNIT_SPEED_SAMPLE_THRESHOLD,
  TILE_SIZE,
  VEGETATION_CLEAR_COST,
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
} from '../../config/constants';
import {
  BUILDING_ATLAS_KEY,
  BUILDING_DEFINITIONS,
  BuildingCategory,
  BuildingType,
  PlacedBuilding,
  ResourceKey,
  buildingTextureKey,
  formatResourceMap,
  isLinePlacementBuilding,
} from '../../config/buildingConfig';
import { playPlacementSound, playUiSound, playWorldSound } from '../../audio/sound';
import { gameEvents } from '../../state/gameEvents';
import { getVegetationAtTile } from '../../state/vegetation';
import { BlueprintTile, getBlueprintById, saveBlueprint } from '../../state/blueprints';
import {
  clearVegetationAt,
  demolishBuilding,
  getBuildingAtTile,
  getPlacedBuildings,
  getPlacementRejection,
  getPlacementWarning,
  placeBuilding,
  setAllGates,
  setRallyPoint,
} from '../../state/gameState';
import { RaiderCamp } from '../../state/raiderCamps';
import { UNIT_KIND_CONFIG } from '../MainScene';
import type { AttackTargetRef, CombatUnit, MainScene } from '../MainScene';
import type { Raider } from './RaidSystem';

const VALID_TINT = 0x00ff00;
const INVALID_TINT = 0xff0000;
/** Phase 33: placement rejection reason, shown just under the preview footprint. */
const PLACEMENT_HINT_DEPTH = 1000;
const CLICK_MOVE_THRESHOLD = 6;

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

/** Phase 24: Cowboys are player-directed units, so their selection/movement constants live near the input code that reads them. */
const COWBOY_SELECT_HIT_RADIUS_PX = 10;
/** Mirrors MainScene's own COWBOY_SELECTION_RING_DEPTH (redrawSelectionRing's color/radius constants stay on MainScene, but this system creates the Graphics object itself). */
const COWBOY_SELECTION_RING_DEPTH = 13.6;
/** Phase 25: per-unit random offset applied to a multi-unit move order's target point so units don't all walk to the exact same pixel and stack. */
const UNIT_MOVE_ORDER_JITTER_PX = 12;
/** Phase 25: drag-rectangle multi-select box; reuses the selection ring's blue so both read as "the same selection concept". */
const SELECTION_RECT_COLOR = 0x42a5f5;
const SELECTION_RECT_FILL_ALPHA = 0.15;
const SELECTION_RECT_DEPTH = 13.4;

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
 * Phase 87: MainScene Decomposition Part 3 - Input & Rally Points.
 *
 * A pure code-move out of MainScene.ts: camera drag/zoom/keyboard pan, touch
 * gestures (two-finger pan/pinch-zoom, single-finger tap-to-order), hotkeys
 * (control groups, idle-unit cycling, category-switching), unit selection/
 * box-select/move-attack-order resolution, building placement mode (single-
 * tile + line-drag + placement-warning hints), demolish mode, and rally-point
 * picking. Follows RaidSystem.ts/WorldVisualsSystem.ts/AmbientLifeSystem.ts's
 * exact plain-class pattern - constructed once in MainScene.create() as
 * `new InputSystem(this)`.
 *
 * What deliberately did NOT move: `selectedUnits`, `cowboyUnits`,
 * `cowboySelectionHintText`, `selectionRingGraphics` (and the per-frame
 * `redrawSelectionRing` that draws it) stay on MainScene - they're also
 * touched by combat/cleanup code (killUnit, removeUnitsOfBuilding,
 * setupGameOverHalt) that isn't moving, so splitting the field from its other
 * readers would scatter one selection concept across two files for no
 * benefit. Likewise `selectedType`/`selectedBuildingId` stay on MainScene
 * (WorldVisualsSystem already reads them via `this.scene.xxx`, per Phase 86);
 * this system reads/writes them the same way. `approachOrEngageTarget`/
 * `getAttackTargetPosition`/`resolveUnitAttackOrders` stay on MainScene since
 * they're the per-combat-tick half of attack orders, fused with
 * runRaidCombatTick's other shooter-resolution code - only the *issuing* side
 * (issueUnitAttackOrder, on a right-click) lives here, calling back into
 * MainScene's approachOrEngageTarget for the shared "walk into range or hold"
 * logic. `UNIT_KIND_CONFIG` (walk speed/range/damage per unit kind) is
 * exported from MainScene and imported here for issueUnitMoveOrder's
 * road-speed-bonus calculation.
 */
export class InputSystem {
  private scene: MainScene;

  private demolishMode = false;
  private previewImage: Phaser.GameObjects.Image | null = null;
  /** Phase 43: pooled preview tiles for a drag-to-place line (Road/Fence), indexed by position along the line; grown on demand, never shrunk (extras past the current line length are just hidden). */
  private linePreviewImages: Phaser.GameObjects.Image[] = [];
  private placementHintText!: Phaser.GameObjects.Text;
  /** Phase 43: running cost tag ("6/8 Road - $60") shown near the drag's end tile while a line preview is active. */
  private lineCostText!: Phaser.GameObjects.Text;
  /** Phase 43: held to keep the placement tool active after a placement (single click or line) instead of exiting - see applyShiftRepeatPolicy. */
  private shiftKey: Phaser.Input.Keyboard.Key | null = null;
  /** Phase 43: previous pointermove's line-drag state, so hideLinePreview only runs on the drag-ended transition rather than every idle mousemove. */
  private lineDragWasActive = false;
  private infoText!: Phaser.GameObjects.Text;
  private lastInfoTileX: number | null = null;
  private lastInfoTileY: number | null = null;

  /**
   * Phase 65: touch/tablet controls. Every currently-active (finger-down)
   * touch pointer, keyed by Pointer.id - the only way to reason about a
   * genuine two-finger gesture, since Phaser's leftButtonDown()/rightButtonDown()
   * collapse any touch to "the primary button" regardless of finger count.
   * Populated/cleared purely from pointerdown/pointerup/pointerupoutside, never
   * from pointermove (a moving finger doesn't change which fingers are down).
   */
  private activeTouchPointers = new Map<number, Phaser.Input.Pointer>();
  /** Phase 65: true for exactly the frames where 2+ touch pointers are simultaneously down - the two-finger pan/zoom gesture is active and every single-finger interpretation (box-select, line preview, tap-to-place/select/order) must be suppressed. */
  private twoFingerGestureActive = false;
  /**
   * Phase 65: the two specific pointer ids currently driving the gesture,
   * locked in the instant the gesture starts (first-two-by-arrival, ignoring
   * any stray 3rd+ touch such as a resting palm). Tracking this explicitly -
   * rather than re-deriving "the first two" from activeTouchPointers'
   * iteration order every frame - is what keeps a stray 3rd finger from ever
   * silently swapping into the pair whichever driving finger lifts first:
   * the moment either id in this pair lifts, the WHOLE gesture ends (even if
   * a 3rd finger is still down), rather than the 3rd finger being promoted
   * into a new, differently-baselined pair.
   */
  private twoFingerGestureIds: [number, number] | null = null;
  /** Phase 65: two-finger gesture baseline, re-captured every frame the gesture runs (delta-based, not compared back to gesture-start) so a finger's tiny per-frame jitter can't accumulate into a jump. Null whenever the gesture isn't active. */
  private twoFingerLastMidpointX: number | null = null;
  private twoFingerLastMidpointY: number | null = null;
  private twoFingerLastDistance: number | null = null;
  /**
   * Phase 65: pointer ids that participated in a two-finger gesture during
   * their current press-to-release lifetime. Marked the instant a second
   * finger lands (both ids) and checked (then cleared) on that pointer's own
   * eventual pointerup, so a pinch/pan ending - in any finger-lift order -
   * can never be misread as a tap-to-place/select/move-order by whichever
   * finger happens to lift last.
   */
  private touchPointersSuppressedForTap = new Set<number>();

  private lastPointerX = 0;
  private lastPointerY = 0;
  private pointerDownX = 0;
  private pointerDownY = 0;
  private dragStartWorldX = 0;
  private dragStartWorldY = 0;

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

  /** Phase 41: control groups (Ctrl+1..9 assign, bare 1..9 recall) keyed by group number, storing member CombatUnit.ids rather than live references so a dead-and-filtered-out unit is simply absent on the next recall's alive-check. */
  private controlGroups = new Map<number, string[]>();
  /** Phase 41: last this.time.now a bare-number-key recall of a given group fired, for the double-tap-to-recenter check. */
  private lastGroupRecallAt = new Map<number, number>();
  /** Phase 41: double-click-select-all-of-kind state - the id/time of the last unit click-select, independent of controlGroups. */
  private lastUnitClickId: string | null = null;
  private lastUnitClickAt = 0;
  private selectionRectGraphics!: Phaser.GameObjects.Graphics;

  /** Phase 53: shared Graphics redrawn from scratch over every building with a rallyPoint set, mirroring connectionGraphics'/fenceLineGraphics' one-Graphics-per-redraw discipline rather than a GameObject per flag. */
  private rallyPointGraphics!: Phaser.GameObjects.Graphics;
  /** Phase 53: non-null while a "Set Rally Point" button has armed the next qualifying right-click to set that building's rally point instead of issuing a unit move/attack order. */
  private rallyPointModeBuildingId: string | null = null;
  private rallyPointModeHintText!: Phaser.GameObjects.Text;

  /**
   * Phase 88: Blueprint Copy-Paste. `blueprintCopyMode` and
   * `blueprintPasteId` are a FOURTH mutually-exclusive left-drag mode,
   * resolved the exact same way Phase 43's line-drag placement was: one more
   * condition checked before setupCameraDrag's existing pan/box-select/line-
   * drag branch chain (see its own updated comment). Copy mode captures a
   * drag-rectangle of already-placed buildings on release; Paste mode (armed
   * once a blueprint is chosen from BuildingBar's picker) shows a ghost of
   * the whole relative tile-set following the cursor and commits on click,
   * closely mirroring updateLinePreview/commitLinePlacement's shape but for a
   * 2D relative-offset set instead of a 1D line run.
   */
  private blueprintCopyMode = false;
  private blueprintPasteId: string | null = null;
  /** Pooled ghost-preview tiles for the active paste blueprint, index-aligned with its `tiles` array - same grow-only reuse pattern as linePreviewImages. */
  private blueprintPreviewImages: Phaser.GameObjects.Image[] = [];
  private blueprintCostText!: Phaser.GameObjects.Text;

  constructor(scene: MainScene) {
    this.scene = scene;
  }

  // ---------------------------------------------------------------------
  // Camera drag / zoom / keyboard pan
  // ---------------------------------------------------------------------

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

  /**
   * Phase 63: world coordinates under the pointer, always resolved against the
   * MAIN camera.
   *
   * pointer.worldX/worldY cannot be trusted once a second camera exists:
   * Phaser's InputManager.hitTest overwrites them using whichever camera it is
   * currently hit-testing (InputPlugin.hitTestPointer walks cameras top-most
   * first and stops at the first hit), so while the cursor is over an
   * interactive HUD object - ResourceHudPanel's per-row tooltip Zones are the
   * only ones in this scene - they hold UI-camera coordinates (i.e. raw screen
   * position), not world position. Every placement/selection/order path reads
   * world position through this instead.
   */
  private pointerWorldPoint(pointer: Phaser.Input.Pointer): Phaser.Math.Vector2 {
    return this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
  }

  /**
   * Phase 33: wheel zoom about the cursor. The world point under the pointer
   * is captured before the zoom change and the camera is then scrolled so
   * that same world point lands back under the cursor afterwards - which is
   * what makes it feel like zooming into what you're looking at rather than
   * into the screen centre. The minimap viewport rectangle needs no special
   * handling: it derives from camera.worldView, which is already zoom-aware.
   */
  setupCameraZoom(): void {
    this.scene.input.on(
      'wheel',
      (pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => {
        const camera = this.scene.cameras.main;
        // Phase 63: read through the main camera explicitly rather than
        // pointer.worldX/Y, which the input system may have last written using
        // the UI camera (see pointerWorldPoint). The zoom-to-cursor re-anchor
        // below is unchanged: capture the world point under the cursor before
        // the zoom, then scroll by however far that same point moved after it.
        const preZoom = this.pointerWorldPoint(pointer);
        const worldPointX = preZoom.x;
        const worldPointY = preZoom.y;

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

        this.scene.minimapSystem.redrawMinimapViewport();
      },
    );
  }

  setupCameraDrag(): void {
    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      // Phase 65: a two-finger gesture owns all interpretation of both its
      // pointers' movement (see setupTouchGestures, registered separately);
      // every single-finger drag branch below (pan/box-select/line-preview)
      // must sit out entirely while it's active, not just decline to redraw -
      // updateSelectionRectangle/updateLinePreview would otherwise keep
      // stretching a stale box/line toward whichever finger this handler
      // happens to be called for.
      if (this.twoFingerGestureActive) {
        return;
      }

      if (this.scene.minimapSystem.minimapPointerActive) {
        if (pointer.isDown) {
          this.scene.minimapSystem.navigateMinimapTo(pointer);
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
      // `this.scene.selectedType === null`, so a line-friendly building being
      // selected (Road/Fence) automatically routes left-drag into the line
      // preview instead, with no separate mode flag needed on the box-select
      // side.
      //
      // Phase 88: Blueprint Copy-Paste adds a FOURTH mutually-exclusive mode
      // to this same left-drag gesture, resolved the identical way Phase 43
      // resolved its own conflict with box-select - one more condition
      // checked ahead of the existing chain, with no new state machine.
      // blueprintCopyMode and a non-null blueprintPasteId are themselves
      // mutually exclusive by construction (see toggleBlueprintCopyMode/
      // beginBlueprintPaste, each of which cancels the other), so only one of
      // isBlueprintCopyDragging/isBlueprintPasting can ever be true at once.
      const dxFromDown = pointer.x - this.pointerDownX;
      const dyFromDown = pointer.y - this.pointerDownY;
      const dragDistance = Math.sqrt(dxFromDown * dxFromDown + dyFromDown * dyFromDown);
      const isLineDragging =
        this.scene.selectedType !== null &&
        isLinePlacementBuilding(this.scene.selectedType) &&
        pointer.leftButtonDown() &&
        dragDistance > CLICK_MOVE_THRESHOLD;
      const isBlueprintCopyDragging =
        this.blueprintCopyMode && pointer.leftButtonDown() && dragDistance > CLICK_MOVE_THRESHOLD;
      const isBlueprintPasting = this.blueprintPasteId !== null;

      if (pointer.rightButtonDown() && this.scene.selectedType === null) {
        const dx = pointer.x - this.lastPointerX;
        const dy = pointer.y - this.lastPointerY;
        this.scene.cameras.main.scrollX -= dx;
        this.scene.cameras.main.scrollY -= dy;
        this.scene.minimapSystem.redrawMinimapViewportThrottled();
      } else if (isBlueprintPasting) {
        this.updateBlueprintPastePreview(pointer);
      } else if (isBlueprintCopyDragging) {
        this.updateSelectionRectangle(pointer);
      } else if (isLineDragging) {
        this.updateLinePreview(pointer);
      } else if (
        pointer.leftButtonDown() &&
        this.scene.selectedType === null &&
        !this.blueprintCopyMode
      ) {
        this.updateSelectionRectangle(pointer);
      }

      if (!isLineDragging && this.lineDragWasActive) {
        this.hideLinePreview();
      }
      this.lineDragWasActive = isLineDragging;

      this.lastPointerX = pointer.x;
      this.lastPointerY = pointer.y;
      this.updateInfoText(pointer);
      if (!isLineDragging && !isBlueprintPasting) {
        this.updatePreview(pointer);
      }
    });

    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.lastPointerX = pointer.x;
      this.lastPointerY = pointer.y;
      this.pointerDownX = pointer.x;
      this.pointerDownY = pointer.y;
      const dragStartWorld = this.pointerWorldPoint(pointer);
      this.dragStartWorldX = dragStartWorld.x;
      this.dragStartWorldY = dragStartWorld.y;

      this.scene.minimapSystem.minimapPointerActive = this.scene.minimapSystem.isPointerInMinimap(pointer);
      if (this.scene.minimapSystem.minimapPointerActive) {
        this.scene.minimapSystem.navigateMinimapTo(pointer);
      }
    });
  }

  /**
   * Phase 65: touch/tablet controls - two-finger pan+pinch-zoom, plus the
   * bookkeeping (activeTouchPointers/twoFingerGestureActive/
   * touchPointersSuppressedForTap) every other touch-aware branch in this
   * file reads. This method OWNS tracking which touch pointers are currently
   * down; it registers its own pointerdown/pointerup/pointerupoutside/
   * pointermove listeners rather than reusing setupCameraDrag's, so a
   * two-finger gesture's start/end can be detected the instant it happens
   * (on the pointerdown/up that changes the count) rather than inferred later
   * from pointermove.
   *
   * State machine:
   * - 0->1 touch pointers down: nothing special: normal single-finger path
   *   (setupCameraDrag/setupBuildingPlacement/setupUnitControl etc.) runs
   *   completely unmodified, since wasTouch-gated code here never fires for a
   *   single touch.
   * - 1->2: the just-added pointer's pointerdown handler here detects
   *   activeTouchPointers.size reaching 2, flips twoFingerGestureActive on,
   *   captures the two pointers' midpoint/distance as this frame's baseline,
   *   marks BOTH pointer ids in touchPointersSuppressedForTap (so neither
   *   finger's eventual lift can fire a tap action), and immediately clears
   *   any in-flight single-finger drag visuals (selection rectangle, line
   *   preview) - a second finger landing mid-drag must not leave either
   *   stranded on screen.
   * - while 2 (or more - a stray 3rd touch is ignored, only the first two
   *   tracked ids drive the gesture): every pointermove from either
   *   participating pointer recomputes the midpoint/distance from BOTH
   *   pointers' latest known positions and pans/zooms by the delta against
   *   the previous frame's baseline (not gesture-start), then rewrites the
   *   baseline - so per-frame jitter can't accumulate and a finger that
   *   simply isn't moving this event doesn't cause a jump.
   * - 2->1 (one finger lifts, one stays down): the lifted pointer is removed
   *   from activeTouchPointers, twoFingerGestureActive turns off, and -
   *   critically - the REMAINING pointer's lastPointerX/Y (which
   *   setupCameraDrag's single-finger pan math reads a raw delta against) and
   *   pointerDownX/Y/dragStartWorldX/Y (which click-vs-drag distance and
   *   box-select/line-preview read) are all re-baselined to that pointer's
   *   current position. Without this, the very next pointermove for the
   *   surviving finger would compute a pan/drag delta against wherever it was
   *   dragged to potentially several inches ago, at the moment it first
   *   pressed down - a large, jarring jump.
   * - 1->0 or 2->0 (last finger(s) lift): activeTouchPointers empties,
   *   twoFingerGestureActive turns off, baseline nulled. Both orders (lift
   *   one-then-other vs both nearly simultaneously) reduce to the same final
   *   state since each pointerup is handled independently.
   */
  setupTouchGestures(): void {
    const endTwoFingerGesture = (): void => {
      this.twoFingerGestureActive = false;
      this.twoFingerGestureIds = null;
      this.twoFingerLastMidpointX = null;
      this.twoFingerLastMidpointY = null;
      this.twoFingerLastDistance = null;
    };

    // Re-baseline the surviving finger so the ordinary single-finger
    // pan/drag/tap code (which only ever reads lastPointerX/Y and
    // pointerDownX/Y, with no knowledge a pinch just ended) starts fresh
    // from here rather than jumping back to that finger's original
    // touchdown point (or, worse, computing a delta against the OTHER
    // finger's last position).
    const rebaselineSingleFinger = (pointer: Phaser.Input.Pointer): void => {
      this.lastPointerX = pointer.x;
      this.lastPointerY = pointer.y;
      this.pointerDownX = pointer.x;
      this.pointerDownY = pointer.y;
      const world = this.pointerWorldPoint(pointer);
      this.dragStartWorldX = world.x;
      this.dragStartWorldY = world.y;
    };

    const removeTouchPointer = (pointer: Phaser.Input.Pointer): void => {
      this.activeTouchPointers.delete(pointer.id);

      const wasDrivingGesture =
        this.twoFingerGestureIds !== null &&
        (this.twoFingerGestureIds[0] === pointer.id || this.twoFingerGestureIds[1] === pointer.id);

      if (wasDrivingGesture) {
        // Either driving finger lifting ends the WHOLE gesture outright, even
        // if a stray 3rd touch is still down - see twoFingerGestureIds' own
        // doc comment for why a 3rd finger is never promoted into the pair.
        endTwoFingerGesture();

        // Exactly one other touch pointer remains (the gesture's other
        // finger, if it's still down) -> that's a real single-finger
        // continuation and needs re-baselining. Zero or 2+ remaining means
        // either everything lifted (nothing to re-baseline) or a stray extra
        // finger makes "the" remaining pointer ambiguous, so no single-finger
        // gesture resumes until it's down to exactly one.
        if (this.activeTouchPointers.size === 1) {
          const remaining = this.activeTouchPointers.values().next().value as
            | Phaser.Input.Pointer
            | undefined;
          if (remaining) {
            rebaselineSingleFinger(remaining);
          }
        }
      }
    };

    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.wasTouch) {
        return;
      }
      this.activeTouchPointers.set(pointer.id, pointer);

      if (this.twoFingerGestureIds === null && this.activeTouchPointers.size === 2) {
        const [p1, p2] = [...this.activeTouchPointers.values()];
        this.twoFingerGestureActive = true;
        this.twoFingerGestureIds = [p1.id, p2.id];
        this.twoFingerLastMidpointX = (p1.x + p2.x) / 2;
        this.twoFingerLastMidpointY = (p1.y + p2.y) / 2;
        this.twoFingerLastDistance = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
        this.touchPointersSuppressedForTap.add(p1.id);
        this.touchPointersSuppressedForTap.add(p2.id);

        // A second finger landing mid-drag must not leave a stray selection
        // box or line-placement preview on screen once the gesture takes
        // over - these are the only two "drawn while a single finger is held
        // down" visuals a pinch could interrupt (the placement preview
        // itself is harmless to leave showing, and hiding it here would
        // fight updatePreview's own per-move redraw the moment the pinch
        // ends).
        this.selectionRectGraphics.clear();
        if (this.lineDragWasActive) {
          this.hideLinePreview();
          this.lineDragWasActive = false;
        }
      } else if (this.twoFingerGestureIds !== null) {
        // A stray 3rd+ touch while a gesture is already locked in (e.g. a
        // resting palm) is tracked for cleanup purposes only - it never
        // joins the driving pair and can't affect the gesture's math -
        // but is still marked non-tap-worthy in case it's the finger that
        // ends up lifting last.
        this.touchPointersSuppressedForTap.add(pointer.id);
      }
    });

    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.wasTouch || !this.activeTouchPointers.has(pointer.id)) {
        return;
      }
      // Keep the tracked pointer reference fresh (Phaser reuses the same
      // Pointer object per slot, so this is mostly a no-op, but the
      // activeTouchPointers.has check above is what matters for correctness
      // here).
      this.activeTouchPointers.set(pointer.id, pointer);

      if (
        !this.twoFingerGestureActive ||
        this.twoFingerGestureIds === null ||
        this.twoFingerLastMidpointX === null ||
        this.twoFingerLastMidpointY === null ||
        this.twoFingerLastDistance === null
      ) {
        return;
      }

      // Only the two pointers actually driving the gesture ever feed its
      // math - a moving stray 3rd finger is fully ignored, not just excluded
      // from "the first two by iteration order" (see twoFingerGestureIds).
      const p1 = this.activeTouchPointers.get(this.twoFingerGestureIds[0]);
      const p2 = this.activeTouchPointers.get(this.twoFingerGestureIds[1]);
      if (!p1 || !p2) {
        return;
      }

      const midpointX = (p1.x + p2.x) / 2;
      const midpointY = (p1.y + p2.y) / 2;
      const distance = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);

      const camera = this.scene.cameras.main;

      // Pan: same raw, unscaled-by-zoom screen-px delta straight onto
      // scrollX/scrollY that the existing right-drag pan uses (setupCameraDrag).
      const panDx = midpointX - this.twoFingerLastMidpointX;
      const panDy = midpointY - this.twoFingerLastMidpointY;
      camera.scrollX -= panDx;
      camera.scrollY -= panDy;

      // Zoom: re-anchor the pre-zoom world point under the (post-pan) midpoint,
      // mirroring setupCameraZoom's wheel-zoom-to-cursor logic exactly, just
      // driven by a distance ratio instead of a fixed step per wheel notch.
      if (this.twoFingerLastDistance > 0) {
        const preZoomWorld = camera.getWorldPoint(midpointX, midpointY);
        const zoomRatio = distance / this.twoFingerLastDistance;
        const nextZoom = Phaser.Math.Clamp(
          camera.zoom * zoomRatio,
          this.getMinZoom(),
          CAMERA_MAX_ZOOM,
        );
        if (nextZoom !== camera.zoom) {
          camera.setZoom(nextZoom);
          const postZoomWorld = camera.getWorldPoint(midpointX, midpointY);
          camera.scrollX += preZoomWorld.x - postZoomWorld.x;
          camera.scrollY += preZoomWorld.y - postZoomWorld.y;
        }
      }

      this.twoFingerLastMidpointX = midpointX;
      this.twoFingerLastMidpointY = midpointY;
      this.twoFingerLastDistance = distance;
      this.scene.minimapSystem.redrawMinimapViewportThrottled();
    });

    const handleTouchRelease = (pointer: Phaser.Input.Pointer): void => {
      if (!pointer.wasTouch) {
        return;
      }
      removeTouchPointer(pointer);
    };

    this.scene.input.on('pointerup', handleTouchRelease);
    this.scene.input.on('pointerupoutside', handleTouchRelease);

    gameEvents.on('game-reset', () => {
      this.activeTouchPointers.clear();
      endTwoFingerGesture();
      this.touchPointersSuppressedForTap.clear();
    });
  }

  /**
   * Phase 65: true if this pointerup should NOT trigger a tap-action (place/
   * select/box-select-resolve/move-order/attack-order/rally-point-pick) -
   * either it just took part in a two-finger gesture, or the gesture is
   * somehow still flagged active (defensive; the count-based check in
   * removeTouchPointer should already have cleared it by the time any
   * pointerup listener runs, since setupTouchGestures' own pointerup handler
   * is registered before setupBuildingPlacement/setupBuildingSelection/
   * setupUnitControl in create()'s call order and Phaser fires listeners for
   * the same event in registration order). Consumes (deletes) the pointer's
   * suppression flag so a later, genuinely-fresh single-finger tap on the
   * same recycled pointer slot isn't permanently suppressed.
   */
  private consumeTouchTapSuppression(pointer: Phaser.Input.Pointer): boolean {
    if (!pointer.wasTouch) {
      return false;
    }
    const wasSuppressed = this.touchPointersSuppressedForTap.delete(pointer.id);
    return wasSuppressed || this.twoFingerGestureActive;
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

    const world = this.pointerWorldPoint(pointer);
    const minX = Math.min(this.dragStartWorldX, world.x);
    const minY = Math.min(this.dragStartWorldY, world.y);
    const width = Math.abs(world.x - this.dragStartWorldX);
    const height = Math.abs(world.y - this.dragStartWorldY);

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
  setupKeyboardCamera(): void {
    const keyboard = this.scene.input.keyboard;
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

  updateKeyboardCameraPan(deltaMs: number): void {
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
    this.scene.cameras.main.scrollX += (dx / length) * distance;
    this.scene.cameras.main.scrollY += (dy / length) * distance;
    this.scene.minimapSystem.redrawMinimapViewportThrottled();
  }

  // ---------------------------------------------------------------------
  // Info text (tile coordinate readout)
  // ---------------------------------------------------------------------

  setupInfoText(): void {
    this.infoText = this.scene.add.text(8, VIEWPORT_HEIGHT - 8, 'tile: -, -', {
      fontSize: '14px',
      color: '#ffffff',
      backgroundColor: '#2b1d12cc',
      padding: { x: 6, y: 4 },
    });
    this.infoText.setOrigin(0, 1);
    this.infoText.setScrollFactor(0);
    this.infoText.setDepth(1000);
    this.scene.registerUiObject(this.infoText);

    // World-space (no setScrollFactor(0)) so it stays pinned under the
    // preview footprint it is describing as the camera pans/zooms.
    this.placementHintText = this.scene.add
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
    this.lineCostText = this.scene.add
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

  // ---------------------------------------------------------------------
  // Building placement (single-tile + line-drag)
  // ---------------------------------------------------------------------

  setupBuildingPlacement(): void {
    this.scene.input.mouse?.disableContextMenu();
    this.shiftKey = this.scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT) ?? null;

    gameEvents.on('select-building', (type: BuildingType) => {
      this.scene.selectedType = type;
      this.refreshPreviewTexture();
    });

    gameEvents.on('cancel-placement', () => {
      this.cancelPlacement();
    });

    this.scene.input.keyboard?.on('keydown-ESC', () => {
      gameEvents.emit('cancel-placement');
    });

    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.scene.minimapSystem.isPointerInMinimap(pointer)) {
        return;
      }
      // Phase 65: setupTouchGestures' own pointerdown listener (registered
      // earlier in create()) has already flipped twoFingerGestureActive on by
      // the time this runs, the instant a second finger lands - a single-tap
      // placement must not fire off the finger that happens to complete the
      // pinch's pointerdown pair.
      if (this.twoFingerGestureActive) {
        return;
      }
      // Phase 65: touch produces no hover - pointermove only fires while a
      // finger is already down - so without this, the placement preview
      // (and its rejection-reason hint) would only appear after the finger
      // started moving, one full drag-distance late. Gated to wasTouch so
      // mouse behavior (which never called updatePreview from pointerdown)
      // is unaffected; a mouse's own hover already drives updatePreview via
      // pointermove well before any click.
      if (pointer.wasTouch && this.scene.selectedType !== null) {
        this.updatePreview(pointer);
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
        this.scene.selectedType !== null &&
        pointer.leftButtonDown() &&
        !isLinePlacementBuilding(this.scene.selectedType)
      ) {
        this.tryPlaceAt(pointer);
      }
    });

    this.scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      // Phase 65: a two-finger gesture ending must never be read as "commit
      // the line" - consumeTouchTapSuppression both checks and clears this
      // pointer's flag, so a later genuine single-finger tap isn't stuck
      // suppressed forever.
      if (this.consumeTouchTapSuppression(pointer)) {
        return;
      }
      if (
        this.scene.selectedType === null ||
        !isLinePlacementBuilding(this.scene.selectedType) ||
        !pointer.leftButtonReleased() ||
        this.scene.minimapSystem.isPointerInMinimap(pointer)
      ) {
        return;
      }
      this.commitLinePlacement(pointer);
    });
  }

  // ---------------------------------------------------------------------
  // Blueprint copy-paste (Phase 88)
  // ---------------------------------------------------------------------

  /**
   * Copy mode is armed via BuildingBar's "Copy" button or the 'B' hotkey
   * (see setupHotkeys); Paste mode is armed once a blueprint is chosen from
   * BuildingBar's picker (`'blueprint-paste-selected'`). Both share the exact
   * mode-exclusivity mechanism Phase 43 established for line-drag placement:
   * a boolean/nullable field checked ahead of setupCameraDrag's existing
   * pan/box-select/line-drag branch chain (see that method's own updated
   * comment) rather than a new state machine. Entering either mode cancels
   * placement/demolish mode and vice versa, mirroring how
   * setupDemolishMode already cancels placement on entry.
   */
  setupBlueprints(): void {
    this.blueprintCostText = this.scene.add
      .text(0, 0, '', {
        fontSize: '12px',
        color: '#ffffff',
        backgroundColor: '#2e7d32dd',
        padding: { x: 4, y: 2 },
      })
      .setDepth(PLACEMENT_HINT_DEPTH)
      .setVisible(false);

    gameEvents.on('blueprint-paste-selected', (blueprintId: string | null) => {
      this.beginBlueprintPaste(blueprintId);
    });
    // BuildingBar's Copy button has no direct reference to InputSystem (it
    // only ever talks to gameState/gameEvents), so it emits this bare toggle
    // rather than calling toggleBlueprintCopyMode() directly - the 'B'
    // hotkey (setupHotkeys) calls the method itself since it already lives
    // on this class.
    gameEvents.on('toggle-blueprint-copy-mode', () => this.toggleBlueprintCopyMode());

    // Entering placement/demolish mode or selecting another blueprint always
    // cancels whichever blueprint mode is active - the same exclusivity rule
    // setupDemolishMode/setupRallyPoints already apply to themselves.
    gameEvents.on('select-building', () => {
      this.exitBlueprintCopyMode();
      this.cancelBlueprintPaste();
    });
    gameEvents.on('demolish-mode-changed', (active: boolean) => {
      if (active) {
        this.exitBlueprintCopyMode();
        this.cancelBlueprintPaste();
      }
    });
    gameEvents.on('cancel-placement', () => {
      this.exitBlueprintCopyMode();
      this.cancelBlueprintPaste();
    });
    gameEvents.on('game-reset', () => {
      this.exitBlueprintCopyMode();
      this.cancelBlueprintPaste();
    });

    this.scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.consumeTouchTapSuppression(pointer)) {
        return;
      }
      if (this.scene.minimapSystem.isPointerInMinimap(pointer)) {
        return;
      }
      if (!pointer.leftButtonReleased()) {
        return;
      }

      if (this.blueprintCopyMode) {
        this.commitBlueprintCopy(pointer);
        return;
      }
      if (this.blueprintPasteId !== null) {
        this.commitBlueprintPaste(pointer);
      }
    });
  }

  /** Called by BuildingBar's Copy button and the 'B' hotkey - toggles Copy mode, cancelling Paste mode and normal placement/demolish mode on entry (see setupBlueprints' exclusivity comment). */
  toggleBlueprintCopyMode(): void {
    if (this.blueprintCopyMode) {
      this.exitBlueprintCopyMode();
      return;
    }
    this.cancelBlueprintPaste();
    gameEvents.emit('cancel-placement');
    if (this.demolishMode) {
      gameEvents.emit('demolish-mode-changed', false);
    }
    this.blueprintCopyMode = true;
    gameEvents.emit('blueprint-copy-mode-changed', true);
  }

  private exitBlueprintCopyMode(): void {
    if (!this.blueprintCopyMode) {
      return;
    }
    this.blueprintCopyMode = false;
    this.selectionRectGraphics.clear();
    gameEvents.emit('blueprint-copy-mode-changed', false);
  }

  /**
   * Scans every PlacedBuilding whose ORIGIN tile (tileX/tileY, not any tile
   * of a multi-tile footprint) falls inside the released drag-rectangle, and
   * saves the result as a Blueprint via a name prompt - mirroring
   * SaveLoadOverlay's window.prompt convention (Phase 65's established
   * pattern for a one-off text input, rather than inventing a form field for
   * this single case). An empty capture is reported, not silently
   * discarded - saveBlueprint itself returns the "nothing to save" reason,
   * which is surfaced via the same transient world-space hint
   * showTransientHint already uses for the bulldozer's "need $X to clear"
   * message.
   */
  private commitBlueprintCopy(pointer: Phaser.Input.Pointer): void {
    const dx = pointer.x - this.pointerDownX;
    const dy = pointer.y - this.pointerDownY;
    if (Math.sqrt(dx * dx + dy * dy) <= CLICK_MOVE_THRESHOLD) {
      this.selectionRectGraphics.clear();
      return;
    }

    const world = this.pointerWorldPoint(pointer);
    const startTile = this.worldToTile(this.dragStartWorldX, this.dragStartWorldY);
    const endTile = this.worldToTile(world.x, world.y);
    const minTileX = Math.min(startTile.tileX, endTile.tileX);
    const maxTileX = Math.max(startTile.tileX, endTile.tileX);
    const minTileY = Math.min(startTile.tileY, endTile.tileY);
    const maxTileY = Math.max(startTile.tileY, endTile.tileY);

    const captured: BlueprintTile[] = [];
    for (const building of getPlacedBuildings()) {
      if (
        building.tileX >= minTileX &&
        building.tileX <= maxTileX &&
        building.tileY >= minTileY &&
        building.tileY <= maxTileY
      ) {
        captured.push({
          dxTile: building.tileX - minTileX,
          dyTile: building.tileY - minTileY,
          type: building.type,
        });
      }
    }

    this.selectionRectGraphics.clear();
    this.exitBlueprintCopyMode();

    if (captured.length === 0) {
      this.showTransientHint('No buildings in that selection', world.x, world.y);
      return;
    }

    // Same window.prompt convention SaveLoadOverlay's own save-name prompt
    // uses (Phase 65's established pattern for a one-off text input, rather
    // than inventing a form field for this single case).
    const name = window.prompt('Blueprint name:', '');
    if (name === null) {
      // Cancelled - nothing was saved (a genuine Cancel/Escape aborts the
      // whole capture rather than saving an "Untitled Blueprint" the player
      // explicitly backed out of).
      return;
    }

    const result = saveBlueprint(name, captured);
    if (!result.ok) {
      this.showTransientHint(result.reason, world.x, world.y);
      return;
    }
    playUiSound('moveConfirm');
  }

  /** Called by BuildingBar's picker when a blueprint row is chosen; `null` cancels an in-progress paste. Cancels Copy mode and normal placement/demolish mode on entry (see setupBlueprints' exclusivity comment). */
  private beginBlueprintPaste(blueprintId: string | null): void {
    if (blueprintId === null) {
      this.cancelBlueprintPaste();
      return;
    }
    const blueprint = getBlueprintById(blueprintId);
    if (!blueprint) {
      this.cancelBlueprintPaste();
      return;
    }
    this.exitBlueprintCopyMode();
    gameEvents.emit('cancel-placement');
    if (this.demolishMode) {
      gameEvents.emit('demolish-mode-changed', false);
    }
    this.blueprintPasteId = blueprintId;
  }

  private cancelBlueprintPaste(): void {
    if (this.blueprintPasteId === null) {
      return;
    }
    this.blueprintPasteId = null;
    this.hideBlueprintPastePreview();
  }

  private hideBlueprintPastePreview(): void {
    for (const image of this.blueprintPreviewImages) {
      image.setVisible(false);
    }
    this.blueprintCostText?.setVisible(false);
    this.placementHintText?.setVisible(false);
  }

  private getOrCreateBlueprintPreviewImage(index: number, type: BuildingType): Phaser.GameObjects.Image {
    const existing = this.blueprintPreviewImages[index];
    if (existing) {
      existing.setTexture(BUILDING_ATLAS_KEY, buildingTextureKey(type));
      return existing;
    }
    const image = this.scene.add.image(0, 0, BUILDING_ATLAS_KEY, buildingTextureKey(type));
    image.setOrigin(0, 0);
    image.setAlpha(0.6);
    image.setDepth(500);
    this.blueprintPreviewImages[index] = image;
    return image;
  }

  /**
   * Ghost preview of the WHOLE relative tile-set anchored at the cursor's
   * tile, following updateLinePreview's exact green/red-per-tile
   * (getPlacementRejection) plus running-cost-tag pattern, just over a 2D
   * offset set instead of a 1D line run.
   */
  private updateBlueprintPastePreview(pointer: Phaser.Input.Pointer): void {
    if (this.blueprintPasteId === null) {
      return;
    }
    const blueprint = getBlueprintById(this.blueprintPasteId);
    if (!blueprint) {
      this.cancelBlueprintPaste();
      return;
    }

    const { tileX: anchorTileX, tileY: anchorTileY } = this.pointerToTile(pointer);

    let validCount = 0;
    let totalMoney = 0;
    const totalMaterials: Partial<Record<ResourceKey, number>> = {};

    blueprint.tiles.forEach((tile, index) => {
      const tileX = anchorTileX + tile.dxTile;
      const tileY = anchorTileY + tile.dyTile;
      const rejection = getPlacementRejection(tileX, tileY, tile.type);
      const image = this.getOrCreateBlueprintPreviewImage(index, tile.type);
      image.setPosition(tileX * TILE_SIZE, tileY * TILE_SIZE);
      image.setVisible(true);
      image.setTint(rejection === null ? VALID_TINT : INVALID_TINT);

      if (rejection === null) {
        validCount++;
        const definition = BUILDING_DEFINITIONS[tile.type];
        totalMoney += definition.cost;
        if (definition.materials) {
          for (const [key, amount] of Object.entries(definition.materials) as [ResourceKey, number][]) {
            totalMaterials[key] = (totalMaterials[key] ?? 0) + amount;
          }
        }
      }
    });

    for (let index = blueprint.tiles.length; index < this.blueprintPreviewImages.length; index++) {
      this.blueprintPreviewImages[index].setVisible(false);
    }

    const costLabel =
      Object.keys(totalMaterials).length > 0
        ? `$${totalMoney} + ${formatResourceMap(totalMaterials)}`
        : `$${totalMoney}`;
    this.blueprintCostText.setText(`${blueprint.name}: ${validCount}/${blueprint.tiles.length} - ${costLabel}`);
    this.blueprintCostText.setPosition(anchorTileX * TILE_SIZE, (anchorTileY - 1) * TILE_SIZE - 4);
    this.blueprintCostText.setVisible(true);
    this.placementHintText.setVisible(false);
    this.scene.worldVisualsSystem.clearHarvestRing();
  }

  /**
   * Commits every tile of the blueprint IN ITS OWN STORED (row-major
   * capture) ORDER via the shared placeBuildingAt primitive, one call per
   * tile - matching commitLinePlacement's exact established semantic: each
   * call re-checks getPlacementRejection/canPlaceBuilding against whatever
   * money/materials remain AT THAT POINT, so a paste that outruns the
   * player's funds simply stops placing partway through rather than
   * overspending or aborting the whole stamp. Paste mode stays armed after a
   * commit (unlike single-tile placement's shift-repeat default) so stamping
   * the same cluster repeatedly is the common case, not the exception -
   * Escape/selecting a building/demolish mode/a fresh pick from the picker
   * all still cancel it via beginBlueprintPaste/cancelBlueprintPaste.
   */
  private commitBlueprintPaste(pointer: Phaser.Input.Pointer): void {
    if (this.blueprintPasteId === null) {
      return;
    }
    const blueprint = getBlueprintById(this.blueprintPasteId);
    if (!blueprint) {
      this.cancelBlueprintPaste();
      return;
    }

    const { tileX: anchorTileX, tileY: anchorTileY } = this.pointerToTile(pointer);

    let placedCount = 0;
    for (const tile of blueprint.tiles) {
      if (this.placeBuildingAtType(anchorTileX + tile.dxTile, anchorTileY + tile.dyTile, tile.type)) {
        placedCount++;
      }
    }

    if (placedCount > 0) {
      playPlacementSound();
    }

    this.updateBlueprintPastePreview(pointer);
  }

  setupBuildingSelection(): void {
    this.scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      const wasMinimapClick = this.scene.minimapSystem.minimapPointerActive;
      this.scene.minimapSystem.minimapPointerActive = false;
      if (wasMinimapClick) {
        return;
      }

      // Phase 65: same two-finger-gesture-ending guard as the line-placement
      // commit above - a pinch/pan releasing must not be read as "tap to
      // select/deselect a building".
      if (this.consumeTouchTapSuppression(pointer)) {
        return;
      }

      // Phase 88: a Copy-mode drag-release or a Paste-mode click is handled
      // entirely by setupBlueprints' own pointerup listener - this handler
      // must not also read the same release as a building select/deselect
      // click underneath it.
      if (this.scene.selectedType !== null || this.blueprintCopyMode || this.blueprintPasteId !== null) {
        return;
      }

      const dx = pointer.x - this.pointerDownX;
      const dy = pointer.y - this.pointerDownY;
      if (Math.sqrt(dx * dx + dy * dy) > CLICK_MOVE_THRESHOLD) {
        return;
      }

      const { tileX, tileY } = this.pointerToTile(pointer);
      const building = getBuildingAtTile(tileX, tileY);

      this.scene.selectedBuildingId = building?.id ?? null;
      gameEvents.emit('building-selected', building);
    });

    // Keeps the tracked id in step with panel closes issued elsewhere
    // (game-reset, a removal closing the panel) without those paths needing
    // to know about this field.
    gameEvents.on('building-selected', (building: PlacedBuilding | null) => {
      this.scene.selectedBuildingId = building?.id ?? null;
    });
  }

  private refreshPreviewTexture(): void {
    if (this.scene.selectedType === null) {
      return;
    }

    this.previewImage?.destroy();
    this.previewImage = this.scene.add.image(0, 0, BUILDING_ATLAS_KEY, buildingTextureKey(this.scene.selectedType));
    this.previewImage.setOrigin(0, 0);
    this.previewImage.setAlpha(0.6);
    this.previewImage.setDepth(500);
  }

  /** Phase 87: non-private - MainScene's setupGameOverHalt calls this directly on 'game-over' to exit placement mode, mirroring the original inline call. */
  cancelPlacement(): void {
    this.scene.selectedType = null;
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
    const image = this.scene.add.image(0, 0, BUILDING_ATLAS_KEY, buildingTextureKey(type));
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
    const type = this.scene.selectedType;
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
    this.scene.worldVisualsSystem.clearHarvestRing();
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
    const type = this.scene.selectedType;
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
    if (this.scene.selectedType !== null) {
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
    if (this.scene.selectedType === null || !this.previewImage) {
      return;
    }

    const { tileX, tileY } = this.pointerToTile(pointer);
    this.previewImage.setPosition(tileX * TILE_SIZE, tileY * TILE_SIZE);

    // Phase 34: a harvester's reach is drawn under the preview so "will this
    // actually reach anything" is answerable before paying for it.
    this.scene.worldVisualsSystem.redrawHarvestRing(tileX, tileY);

    const rejection = getPlacementRejection(tileX, tileY, this.scene.selectedType);
    this.previewImage.setTint(rejection === null ? VALID_TINT : INVALID_TINT);

    // Phase 34: a legal-but-unwise placement gets a warning rather than a
    // block. The tint stays green (it IS placeable) and only the hint text
    // changes colour, so the two signals can't be confused with each other.
    const warning = rejection === null ? getPlacementWarning(tileX, tileY, this.scene.selectedType) : null;
    const message = rejection ?? warning;

    if (message === null) {
      this.placementHintText.setVisible(false);
      return;
    }

    const { height } = BUILDING_DEFINITIONS[this.scene.selectedType].size;
    this.placementHintText.setText(message);
    this.placementHintText.setBackgroundColor(rejection === null ? '#8d6e00dd' : '#c62828dd');
    this.placementHintText.setPosition(
      tileX * TILE_SIZE,
      (tileY + height) * TILE_SIZE + 4,
    );
    this.placementHintText.setVisible(true);
  }

  /**
   * Phase 43: extracted from tryPlaceAt so commitLinePlacement can call it
   * once per tile of a drag-line - returns whether a building was actually
   * placed (a tile failing getPlacementRejection just returns false, letting
   * the line skip it silently) rather than void, and deliberately does NOT
   * play the placement sound itself, since a multi-tile line plays it once
   * for the whole line instead of once per tile (see tryPlaceAt/
   * commitLinePlacement, the two callers).
   *
   * Phase 88: unchanged signature/behavior - still resolves the type from
   * `this.scene.selectedType`, exactly as before. Its body now delegates to
   * placeBuildingAtType (a plain sibling taking an explicit type) so
   * commitBlueprintPaste can place tiles of a blueprint's own recorded
   * per-tile type without a selectedType to read from.
   */
  private placeBuildingAt(tileX: number, tileY: number): boolean {
    if (this.scene.selectedType === null) {
      return false;
    }
    return this.placeBuildingAtType(tileX, tileY, this.scene.selectedType);
  }

  /** Phase 88: the actual placement primitive, shared by placeBuildingAt (reads this.scene.selectedType) and commitBlueprintPaste (reads each blueprint tile's own stored type). Same return-false-on-rejection, no-sound-here contract as placeBuildingAt. */
  private placeBuildingAtType(tileX: number, tileY: number, type: BuildingType): boolean {
    const building = placeBuilding(tileX, tileY, type);
    if (!building) {
      return false;
    }

    // A freshly placed Barracks/Horsery always starts with zero trained units
    // (see gameState.ts), so there is nothing to spawn here - Cowboy/mounted-
    // Cowboy units only ever appear via the 'cowboy-trained'/'mounted-cowboy-
    // trained' events. A loaded save's worldVisualsSystem.restoreBuildingVisual,
    // used elsewhere, is the one path that DOES need to spawn units up front
    // (a restored Barracks can already have a nonzero cowboyCount).
    this.scene.worldVisualsSystem.createVisualForBuilding(building);
    // Phase 82: cull immediately so a building placed off-screen (e.g. the
    // far end of a drag-placed Road/Fence line) starts in the correct
    // visibility state rather than waiting for the next throttled tick.
    this.scene.updateViewportCulling();
    return true;
  }

  private tryPlaceAt(pointer: Phaser.Input.Pointer): void {
    if (this.scene.selectedType === null) {
      return;
    }

    const { tileX, tileY } = this.pointerToTile(pointer);
    if (!this.placeBuildingAt(tileX, tileY)) {
      return;
    }

    playPlacementSound();
    this.applyShiftRepeatPolicy();
  }

  // ---------------------------------------------------------------------
  // Demolish mode
  // ---------------------------------------------------------------------

  /**
   * Phase 31: explicit bulldozer mode. Kept as a separate mode rather than a
   * button on the info panel so demolishing several buildings in a row
   * doesn't mean re-selecting each one first; selecting a building to place
   * cancels it (and vice versa) since the two modes both own the left click.
   */
  setupDemolishMode(): void {
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

    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.twoFingerGestureActive) {
        return;
      }
      if (!this.demolishMode || !pointer.leftButtonDown() || this.scene.minimapSystem.isPointerInMinimap(pointer)) {
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
    this.scene.time.delayedCall(1200, () => {
      if (this.scene.selectedType === null) {
        this.placementHintText.setVisible(false);
      }
    });
  }

  // ---------------------------------------------------------------------
  // Rally points (Phase 53)
  // ---------------------------------------------------------------------

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
  setupRallyPoints(): void {
    this.rallyPointGraphics = this.scene.add.graphics().setDepth(RALLY_POINT_DEPTH);
    this.rallyPointModeHintText = this.scene.add
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
    this.scene.registerUiObject(this.rallyPointModeHintText);

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

  // ---------------------------------------------------------------------
  // Unit selection / box-select / move & attack order resolution
  // ---------------------------------------------------------------------

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
   * minimapPointerActive, since setupBuildingSelection's own pointerup
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
  setupUnitControl(): void {
    this.scene.selectionRingGraphics = this.scene.add.graphics().setDepth(COWBOY_SELECTION_RING_DEPTH);
    this.selectionRectGraphics = this.scene.add.graphics().setDepth(SELECTION_RECT_DEPTH);

    this.scene.cowboySelectionHintText = this.scene.add
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
    this.scene.registerUiObject(this.scene.cowboySelectionHintText);

    this.scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      // The drag rectangle (if any) always ends here, regardless of which
      // guard below fires next, so no stray box can ever outlive its drag.
      this.selectionRectGraphics.clear();

      // Phase 65: a pinch/pan gesture ending must never be read as a unit
      // command, a rally-point pick, or a selection change - checked (and
      // cleared) before every other branch below, mirroring the same guard
      // added to setupBuildingPlacement/setupBuildingSelection's pointerup
      // handlers.
      if (this.consumeTouchTapSuppression(pointer)) {
        return;
      }

      // Phase 88: Copy/Paste mode already fully handled this release in
      // setupBlueprints' own (earlier-registered) pointerup listener - must
      // not also be read as a unit selection/box-select/move-order here.
      if (
        this.scene.selectedType !== null ||
        this.blueprintCopyMode ||
        this.blueprintPasteId !== null ||
        this.scene.minimapSystem.isPointerInMinimap(pointer)
      ) {
        return;
      }

      const dx = pointer.x - this.pointerDownX;
      const dy = pointer.y - this.pointerDownY;
      const dragDistance = Math.sqrt(dx * dx + dy * dy);
      // Phase 63: resolved once through the main camera and reused by every
      // branch below - pointer.worldX/Y is unreliable with a second camera in
      // play (see pointerWorldPoint).
      const world = this.pointerWorldPoint(pointer);

      if (pointer.rightButtonReleased()) {
        this.resolveRallyOrCommandOrder(pointer, world, dragDistance);
        return;
      }

      if (!pointer.leftButtonReleased()) {
        return;
      }

      // Phase 65: single-finger tap-to-order, mode-aware. A plain left-click
      // release on desktop (mouse) still ONLY selects/box-selects, exactly as
      // before - this branch is gated on the release having come from a touch
      // pointer specifically, so mouse behavior is untouched byte-for-byte.
      // See resolveTouchTapAction's own doc comment for the full precedence
      // rule (rally-pick > select-a-unit > raider/camp/move-order). An armed
      // rally-point pick is reachable via touch even with zero units selected
      // - it's a building-mode action, not a unit-order one - so it's
      // checked here independently of selectedUnits.length rather than
      // folded into that same guard.
      if (pointer.wasTouch && dragDistance <= CLICK_MOVE_THRESHOLD && !this.demolishMode) {
        if (this.rallyPointModeBuildingId !== null) {
          this.resolveRallyOrCommandOrder(pointer, world, dragDistance);
          return;
        }
        if (this.scene.selectedUnits.length > 0) {
          this.resolveTouchTapAction(pointer, world, dragDistance);
          return;
        }
      }

      if (dragDistance <= CLICK_MOVE_THRESHOLD) {
        this.selectUnitAt(pointer);
      } else {
        this.selectUnitsInRect(this.dragStartWorldX, this.dragStartWorldY, world.x, world.y);
      }
    });
  }

  /**
   * Phase 65: the right-click-release command chain, extracted verbatim out
   * of setupUnitControl's pointerup handler so touch's single-finger-tap
   * order (resolveTouchTapAction) can call the exact same raider/camp/
   * move-order resolution instead of a second copy. Behavior for the mouse
   * right-click caller is completely unchanged - this is a pure extraction,
   * not a rewrite.
   */
  private resolveRallyOrCommandOrder(
    pointer: Phaser.Input.Pointer,
    world: Phaser.Math.Vector2,
    dragDistance: number,
  ): void {
    // Phase 53: an armed rally-point pick takes over this right-click
    // entirely, ahead of the unit move/attack-order logic below - a
    // qualifying click (not a right-drag pan past the threshold) sets the
    // rally point and disarms; anything else (a pan) leaves the mode
    // armed for a later attempt.
    if (this.rallyPointModeBuildingId !== null) {
      if (dragDistance <= CLICK_MOVE_THRESHOLD) {
        setRallyPoint(this.rallyPointModeBuildingId, world.x, world.y);
        gameEvents.emit('rally-point-mode-changed', null);
      }
      return;
    }

    if (dragDistance > CLICK_MOVE_THRESHOLD || this.scene.selectedUnits.length === 0) {
      return;
    }
    // Phase 40: right-clicking directly on a live raider issues a focus-fire
    // attack order on that specific raider instead of a plain move order;
    // Phase 57 extends the same hit-test to a live Raider Camp (checked
    // second - a raider standing in front of its own camp still wins);
    // Phase 71 extends it a third time to wildlife (checked last); right-
    // clicking anything else (empty ground, a building, etc.) keeps the
    // original move-order behavior unchanged.
    const raider = this.findRaiderAt(world.x, world.y);
    if (raider) {
      this.issueUnitAttackOrder({ kind: 'raider', id: raider.id }, { x: raider.image.x, y: raider.image.y });
      return;
    }
    const camp = this.findCampAt(world.x, world.y);
    if (camp) {
      this.issueUnitAttackOrder({ kind: 'camp', id: camp.id }, { x: camp.x, y: camp.y });
      return;
    }
    const creature = this.scene.ambientLifeSystem.findWildlifeAt(world.x, world.y);
    if (creature) {
      this.issueUnitAttackOrder(
        { kind: 'wildlife', id: creature.id },
        { x: creature.image.x, y: creature.image.y },
      );
    } else {
      this.issueUnitMoveOrders(pointer);
    }
  }

  /**
   * Phase 65: a single-finger TAP (drag distance <= CLICK_MOVE_THRESHOLD)
   * with units currently selected AND no armed rally-point pick (that case is
   * intercepted one level up, in setupUnitControl's pointerup handler, before
   * this is ever called - see its own comment). Only reachable with
   * pointer.wasTouch - mouse left-clicks never call this, so desktop behavior
   * is unaffected.
   *
   * Precedence (documented per the phase spec):
   * 1. An armed rally-point pick wins outright (handled by the caller, ahead
   *    of this method - not repeated here to avoid two sources of truth for
   *    the same branch).
   * 2. Otherwise, if the tap hits a LIVE UNIT (findAliveUnitAt, using the
   *    same COWBOY_SELECT_HIT_RADIUS_PX selectUnitAt already hit-tests
   *    against - practical because it's a generous 10px radius, roughly a
   *    fingertip's worth of slop at this game's zoom range), selecting that
   *    unit wins over issuing an order onto it. Without this rule a touch
   *    player could tap a second unit while one is already selected and
   *    NEVER change their selection - every tap would be interpreted as a
   *    move/attack order onto the point they were trying to select at,
   *    a genuine dead end this phase's brief explicitly calls out.
   * 3. Only a tap that hits no unit falls through to the shared raider/camp/
   *    move-order chain - the same deselect-by-tapping-empty-ground-issues-a-
   *    move-order behavior the brief accepts as the intended escape hatch
   *    (Escape/re-opening the building/placement UI already clears unit
   *    selection elsewhere).
   */
  private resolveTouchTapAction(
    pointer: Phaser.Input.Pointer,
    world: Phaser.Math.Vector2,
    dragDistance: number,
  ): void {
    const hitUnit = this.findAliveUnitAt(world.x, world.y);
    if (hitUnit) {
      this.selectUnitAt(pointer);
      return;
    }

    this.resolveRallyOrCommandOrder(pointer, world, dragDistance);
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
    const world = this.pointerWorldPoint(pointer);
    const hit = this.findAliveUnitAt(world.x, world.y);

    if (!hit) {
      this.scene.selectedUnits = [];
      this.lastUnitClickId = null;
      this.scene.cowboySelectionHintText.setVisible(false);
      return;
    }

    const now = this.scene.time.now;
    const isDoubleClick = hit.id === this.lastUnitClickId && now - this.lastUnitClickAt <= UNIT_DOUBLE_CLICK_MS;
    this.lastUnitClickId = hit.id;
    this.lastUnitClickAt = now;

    this.scene.selectedUnits = isDoubleClick
      ? this.scene.cowboyUnits.filter((unit) => unit.kind === hit.kind && this.scene.isCowboyUnitAlive(unit))
      : [hit];
    this.scene.cowboySelectionHintText.setVisible(true);
  }

  /** Every living unit whose position falls within the released drag rectangle (world-space corners, order-independent). */
  private selectUnitsInRect(x1: number, y1: number, x2: number, y2: number): void {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    this.scene.selectedUnits = this.scene.cowboyUnits.filter(
      (unit) =>
        this.scene.isCowboyUnitAlive(unit) &&
        unit.image.x >= minX &&
        unit.image.x <= maxX &&
        unit.image.y >= minY &&
        unit.image.y <= maxY,
    );
    this.scene.cowboySelectionHintText.setVisible(this.scene.selectedUnits.length > 0);
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
    const world = this.pointerWorldPoint(pointer);
    for (const unit of this.scene.selectedUnits) {
      // An explicit new move order supersedes any standing attack order -
      // otherwise resolveUnitAttackOrders would immediately start steering
      // the unit back toward its old target on the next combat tick.
      unit.attackTarget = null;
      const jitterX = Phaser.Math.Between(-UNIT_MOVE_ORDER_JITTER_PX, UNIT_MOVE_ORDER_JITTER_PX);
      const jitterY = Phaser.Math.Between(-UNIT_MOVE_ORDER_JITTER_PX, UNIT_MOVE_ORDER_JITTER_PX);
      this.issueUnitMoveOrder(unit, world.x + jitterX, world.y + jitterY);
    }
  }

  /**
   * Nearest currently-alive CombatUnit to a world point within
   * COWBOY_SELECT_HIT_RADIUS_PX, or null. Extracted out of selectUnitAt
   * (Phase 65) so the touch tap-order path can run the same "did this tap
   * actually hit one of my own units" check selectUnitAt uses, without
   * duplicating the loop - see resolveTouchTapAction's doc comment for why
   * that check has to happen before the raider/camp/move-order chain.
   */
  private findAliveUnitAt(worldX: number, worldY: number): CombatUnit | null {
    let best: CombatUnit | null = null;
    let bestDistance = COWBOY_SELECT_HIT_RADIUS_PX;

    for (const unit of this.scene.cowboyUnits) {
      if (!this.scene.isCowboyUnitAlive(unit)) {
        continue;
      }
      const distance = Phaser.Math.Distance.Between(worldX, worldY, unit.image.x, unit.image.y);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = unit;
      }
    }

    return best;
  }

  /** Nearest live raider to a world point within RAIDER_ATTACK_HIT_RADIUS_PX, or null - the hit-test that tells a right-click-on-a-raider (attack order) apart from a right-click-on-ground (move order). Phase 85: delegates to RaidSystem, which owns the raiders array. */
  private findRaiderAt(worldX: number, worldY: number): Raider | null {
    return this.scene.raidSystem.findRaiderAt(worldX, worldY);
  }

  /** Nearest live Raider Camp to a world point within RAIDER_CAMP_ATTACK_HIT_RADIUS_PX, or null - mirrors findRaiderAt exactly, checked second in the pointerup handler so an overlapping raider always wins the hit-test. Phase 85: delegates to RaidSystem. */
  private findCampAt(worldX: number, worldY: number): RaiderCamp | null {
    return this.scene.raidSystem.findCampAt(worldX, worldY);
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
   * MainScene's getAttackTargetPosition instead of trusting this snapshot.
   */
  private issueUnitAttackOrder(target: AttackTargetRef, position: { x: number; y: number }): void {
    // Same one-confirmation-per-order rule as issueUnitMoveOrders.
    playUiSound('moveConfirm');
    for (const unit of this.scene.selectedUnits) {
      unit.attackTarget = target;
      this.scene.approachOrEngageTarget(unit, position);
    }
  }

  /**
   * Phase 63: Roads & Logistics' own +10% PRODUCTION bonus (BFS road-network
   * connectivity) is untouched by this - a separate, additive check for unit
   * MOVEMENT speed. Deliberately cheap and one-shot (per CLAUDE.md's
   * performance rules against heavy per-frame/update-loop work): samples a
   * handful of points along the straight-line path at move-order-issue time
   * only, same half-tile-step technique sampleForBlockingWall already uses
   * for raider wall detection, and never rechecked again while the tween
   * runs - a unit doesn't "enter"/"exit" road speed mid-tween, the whole leg
   * is either road-sped or not.
   */
  private isPathMostlyOnRoad(x1: number, y1: number, x2: number, y2: number): boolean {
    const distance = Phaser.Math.Distance.Between(x1, y1, x2, y2);
    const steps = Math.max(1, Math.ceil(distance / (TILE_SIZE / 2)));
    let onRoadCount = 0;
    let sampleCount = 0;

    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const sampleTileX = Math.floor((x1 + (x2 - x1) * t) / TILE_SIZE);
      const sampleTileY = Math.floor((y1 + (y2 - y1) * t) / TILE_SIZE);
      sampleCount++;

      const building = getBuildingAtTile(sampleTileX, sampleTileY);
      if (building && building.type === BuildingType.Road && building.hp > 0) {
        onRoadCount++;
      }
    }

    return sampleCount > 0 && onRoadCount / sampleCount >= ROAD_UNIT_SPEED_SAMPLE_THRESHOLD;
  }

  /**
   * Same point-to-point tween technique as villagers/raiders (distance/speed
   * -> duration, setFlipX for facing), clamped to map bounds.
   *
   * Phase 87: non-private - MainScene's setupCowboyVisuals (sendUnitToRallyPointIfSet,
   * marching a newly-trained unit to its building's rally point) and
   * approachOrEngageTarget (the per-combat-tick attack-order resolution,
   * which stays on MainScene fused with runRaidCombatTick) both call this via
   * this.scene.inputSystem.issueUnitMoveOrder.
   */
  issueUnitMoveOrder(unit: CombatUnit, targetWorldX: number, targetWorldY: number): void {
    const targetX = Phaser.Math.Clamp(targetWorldX, 0, MAP_WIDTH_TILES * TILE_SIZE);
    const targetY = Phaser.Math.Clamp(targetWorldY, 0, MAP_HEIGHT_TILES * TILE_SIZE);

    unit.moveTween?.stop();
    unit.image.setFlipX(targetX < unit.image.x);

    const distance = Phaser.Math.Distance.Between(unit.image.x, unit.image.y, targetX, targetY);
    const onRoad = this.isPathMostlyOnRoad(unit.image.x, unit.image.y, targetX, targetY);
    const effectiveSpeed =
      UNIT_KIND_CONFIG[unit.kind].walkSpeedPxPerSec * (onRoad ? ROAD_UNIT_SPEED_MULTIPLIER : 1);
    const duration = (distance / effectiveSpeed) * 1000;

    unit.moveTween = this.scene.tweens.add({
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

  // ---------------------------------------------------------------------
  // Hotkeys (control groups, idle cycling, category switching, misc)
  // ---------------------------------------------------------------------

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
  setupHotkeys(): void {
    const keyboard = this.scene.input.keyboard;
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
        this.scene.worldVisualsSystem.toggleChainViewVisibility();
        event.preventDefault();
      }

      // Phase 49: 'V' ("view stats") toggles the Statistics & Efficiency
      // panel. MainScene owns no state for it - the panel itself is the only
      // listener - so this is a bare emit, same shape as the 'C' hotkey above.
      if (event.code === 'KeyV') {
        gameEvents.emit('toggle-statistics-panel');
        event.preventDefault();
      }

      // Real Fence Enclosures: 'E' ("enclosure") toggles the debug overlay
      // showing every farm's cached enclosure state. Unlike 'C'/'V' this is a
      // local toggle (the overlay is drawn straight onto the world, not a
      // separate panel), so it calls WorldVisualsSystem's method rather than
      // emitting a bare event.
      if (event.code === 'KeyE') {
        this.scene.worldVisualsSystem.toggleEnclosureDebugOverlay();
        event.preventDefault();
      }

      // Phase 64: 'H' (or '?', the conventional help key - Slash carries it
      // on most layouts) toggles the hotkey/resource-chain reference. Bare
      // emit like 'C'/'V': HelpOverlay owns all of its own state. Neither key
      // was previously bound (checked against WASD/arrows, Shift, digits 1-9,
      // Space, Delete/Backspace, C, V, E and Esc).
      if (event.code === 'KeyH' || event.code === 'Slash') {
        gameEvents.emit('toggle-help-overlay');
        event.preventDefault();
      }

      // Phase 69: 'G' ("gates") toggles every placed WoodenGate open/closed
      // in one press - see toggleAllGates's own doc comment for the
      // majority-state logic. Confirmed unbound before adding: grepped
      // setupHotkeys for every existing event.code branch (WASD/arrows via
      // the separate cameraKeys record, Shift, digit 1-9, Space, Delete/
      // Backspace, C, V, E, H/Slash) - none use KeyG.
      if (event.code === 'KeyG') {
        this.toggleAllGates();
        event.preventDefault();
      }

      // Phase 88: 'B' ("blueprint") toggles Copy mode. Confirmed unbound
      // before adding: grepped setupHotkeys/setupKeyboardCamera for every
      // existing key binding (WASD/arrows via the separate cameraKeys record,
      // Shift, digit 1-9, Space, Delete/Backspace, C, V, E, G, H/Slash) - none
      // use KeyB.
      if (event.code === 'KeyB') {
        this.toggleBlueprintCopyMode();
        event.preventDefault();
      }
    });
  }

  private handleNumberKey(groupNumber: number, ctrlHeld: boolean): void {
    if (ctrlHeld) {
      if (this.scene.selectedUnits.length === 0) {
        return;
      }
      this.controlGroups.set(groupNumber, this.scene.selectedUnits.map((unit) => unit.id));
      return;
    }

    const memberIds = this.controlGroups.get(groupNumber);
    const livingMembers = memberIds
      ? this.scene.cowboyUnits.filter((unit) => memberIds.includes(unit.id) && this.scene.isCowboyUnitAlive(unit))
      : [];

    if (livingMembers.length > 0) {
      const now = this.scene.time.now;
      const lastRecallAt = this.lastGroupRecallAt.get(groupNumber) ?? -Infinity;
      this.lastGroupRecallAt.set(groupNumber, now);

      this.scene.selectedUnits = livingMembers;
      this.scene.cowboySelectionHintText.setVisible(true);

      if (now - lastRecallAt <= CONTROL_GROUP_DOUBLE_TAP_MS) {
        this.centerCameraOnUnits(livingMembers);
      }
      return;
    }

    if (this.scene.selectedUnits.length === 0 && this.scene.selectedType === null && !this.demolishMode) {
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
    this.scene.cameras.main.centerOn(worldX, worldY);
    this.scene.minimapSystem.redrawMinimapViewportThrottled();
  }

  /** Phase 44: NotificationLogPanel (a DOM overlay with no camera access) asks to pan here via gameEvents rather than duplicating tile->world math. */
  setupNotificationLog(): void {
    gameEvents.on('camera-focus-requested', (worldX: number, worldY: number) => {
      this.centerCameraOnWorldPoint(worldX, worldY);
    });
  }

  /** 1-indexed against BuildingCategory's declaration order (BuildingBar builds its tabs off the same Object.values(...) order); out-of-range numbers beyond the current category count are simply a no-op. */
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
    const idleUnits = this.scene.cowboyUnits.filter(
      (unit) => this.scene.isCowboyUnitAlive(unit) && unit.moveTween === null && unit.attackTarget === null,
    );
    if (idleUnits.length === 0) {
      return;
    }

    const currentIndex =
      this.scene.selectedUnits.length === 1 ? idleUnits.indexOf(this.scene.selectedUnits[0]) : -1;
    const nextUnit = idleUnits[(currentIndex + 1) % idleUnits.length];

    this.scene.selectedUnits = [nextUnit];
    this.scene.cowboySelectionHintText.setVisible(true);
    this.scene.cameras.main.centerOn(nextUnit.image.x, nextUnit.image.y);
    this.scene.minimapSystem.redrawMinimapViewportThrottled();
  }

  /** Mirrors BuildingInfoPanel's own Demolish button (demolishBuilding + clearing the selection), just bound to Delete/Backspace on whichever building is currently selected. No-op if nothing is selected. */
  private demolishSelectedBuilding(): void {
    if (!this.scene.selectedBuildingId) {
      return;
    }
    demolishBuilding(this.scene.selectedBuildingId);
    gameEvents.emit('building-selected', null);
  }

  /**
   * Phase 69: the 'G' hotkey and the building bar's "Close/Open All Gates"
   * button both call this - majority-state-derived rather than a separately
   * tracked local toggle flag, so it stays correct after a load/reset or
   * after any single gate was already toggled individually via the info
   * panel (a local "last commanded state" flag could silently disagree with
   * what's actually on the map). If any WoodenGate is currently open, this
   * closes every gate (the more defensive default when the player's intent
   * is ambiguous); only when every gate is already closed does it open them
   * all.
   */
  private toggleAllGates(): void {
    const gates = getPlacedBuildings().filter((building) => building.type === BuildingType.WoodenGate);
    if (gates.length === 0) {
      return;
    }
    const anyOpen = gates.some((gate) => gate.gateOpen !== false);
    setAllGates(!anyOpen);
  }

  // ---------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------

  private pointerToTile(pointer: Phaser.Input.Pointer): { tileX: number; tileY: number } {
    const world = this.pointerWorldPoint(pointer);
    return {
      tileX: Math.floor(world.x / TILE_SIZE),
      tileY: Math.floor(world.y / TILE_SIZE),
    };
  }

  // ---------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------

  /**
   * Called from MainScene's 'game-reset' handler - clears every InputSystem-
   * owned selection/mode/placement-visual field that the original inline
   * handler cleared directly. cowboyUnits/selectedUnits themselves stay on
   * MainScene (see this class's own doc comment) and are reset there.
   *
   * Deliberately does NOT touch rallyPointGraphics/rallyPointModeBuildingId -
   * setupRallyPoints registers its own independent 'game-reset' listener
   * (mirroring the original code, where that cleanup lived in setupRallyPoints
   * rather than the big inline setupGameReset handler) that already clears
   * both; duplicating it here would double-fire on every reset.
   */
  resetForGameReset(): void {
    this.cancelPlacement();
    this.controlGroups.clear();
    this.lastGroupRecallAt.clear();
    this.lastUnitClickId = null;
    this.selectionRectGraphics.clear();
  }
}
