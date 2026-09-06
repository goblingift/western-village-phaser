import Phaser from 'phaser';
import {
  DAY_NIGHT_TRANSITION_MS,
  NIGHT_OVERLAY_ALPHA,
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
} from '../config/constants';
import { DayPhaseChange, getDayPhase } from '../state/gameState';
import { gameEvents } from '../state/gameEvents';

/**
 * Phase 34: the night half of the day/night cycle, rendered as one
 * screen-space rectangle rather than by re-tinting every sprite on the map.
 *
 * Depth 900 puts it above everything in the world (buildings 10, units 12, HP
 * bars 13) but below the HUD band at 999/1000 - the resource panel, timer,
 * minimap and raid notice must stay fully legible at midnight, since night is
 * exactly when the player needs to read them.
 *
 * setScrollFactor(0) plus a rect sized to the viewport (not the map) means the
 * overlay costs one quad regardless of camera position or zoom, and can never
 * fail to cover the screen the way a world-space map-sized rect would at low
 * zoom.
 *
 * Extracted into its own file instead of MainScene because the scene is
 * already ~2350 lines and this is a self-contained widget with one input
 * (the phase event) and no other coupling.
 */
const NIGHT_OVERLAY_DEPTH = 900;
const NIGHT_TINT_COLOR = 0x0b1a3a;

export class NightOverlay {
  private rect: Phaser.GameObjects.Rectangle;
  private tween: Phaser.Tweens.Tween | null = null;

  constructor(private scene: Phaser.Scene) {
    this.rect = scene.add
      .rectangle(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, NIGHT_TINT_COLOR, 1)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(NIGHT_OVERLAY_DEPTH)
      .setAlpha(0);

    // Nothing in the world should be clickable "through" a HUD element, but a
    // full-screen rect is the one that would actually swallow every click if
    // it were interactive - it never is, so this is only a guard against a
    // future setInteractive creeping in.
    this.rect.disableInteractive();

    this.applyPhase(getDayPhase(), true);

    gameEvents.on('day-phase-changed', ({ phase }: DayPhaseChange) => this.applyPhase(phase, false));
    // resetGame emits 'day-phase-changed' (day 1, day) just before
    // 'game-reset', which would otherwise start a 20-second dawn fade out of
    // the previous run's midnight. A new run starts in daylight, immediately.
    gameEvents.on('game-reset', () => this.applyPhase('day', true));
  }

  /**
   * Dusk and dawn are the same tween in opposite directions. `immediate` is
   * used for the initial state and for game-reset, where snapping to full
   * daylight is correct - a 20s fade out of last run's midnight would be a
   * bug, not a transition.
   */
  private applyPhase(phase: 'day' | 'night', immediate: boolean): void {
    const target = phase === 'night' ? NIGHT_OVERLAY_ALPHA : 0;

    this.tween?.stop();
    this.tween = null;

    if (immediate) {
      this.rect.setAlpha(target);
      return;
    }

    this.tween = this.scene.tweens.add({
      targets: this.rect,
      alpha: target,
      duration: DAY_NIGHT_TRANSITION_MS,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.tween = null;
      },
    });
  }

  /** 0 at full daylight, 1 at full night; drives the per-building night accents in MainScene. */
  getNightFactor(): number {
    return this.rect.alpha / NIGHT_OVERLAY_ALPHA;
  }

  destroy(): void {
    this.tween?.stop();
    this.rect.destroy();
  }
}
