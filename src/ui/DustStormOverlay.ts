import Phaser from 'phaser';
import {
  DUST_STORM_OVERLAY_ALPHA,
  DUST_STORM_TRANSITION_MS,
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
} from '../config/constants';
import { gameEvents } from '../state/gameEvents';
import { WorldEventType } from '../state/worldEvents';

/**
 * Phase 55: Random World Events - the Dust Storm event's cosmetic half.
 * Mirrors ui/NightOverlay.ts's shape exactly (one screen-space rect,
 * setScrollFactor(0), same depth band) since there is no fog-of-war/vision
 * system to actually dim - "reduced vision" is interpreted as a low-alpha
 * tan/brown screen tint. The matching gameplay half (a small flat production
 * dip on every building) lives in gameState.ts's getDustStormProductionMultiplier
 * call site, not here.
 *
 * Depth 899 - one below NightOverlay's 900, so a dust storm that (rarely)
 * overlaps nightfall tints first and darkens on top of that, rather than the
 * two fighting over which wins.
 *
 * Listens directly to state/worldEvents.ts's 'world-event-started'/
 * 'world-event-ended' (filtered to type === 'dustStorm') rather than going
 * through gameState, matching NightOverlay's direct gameEvents subscription.
 * 'game-reset' snaps to alpha 0 immediately instead of fading - world events
 * are never persisted/carried across a reset (see worldEvents.ts), so a
 * lingering fade out of the previous run's dust storm would be a bug.
 */
const DUST_STORM_OVERLAY_DEPTH = 899;
const DUST_STORM_TINT_COLOR = 0xb08a4e;

export class DustStormOverlay {
  private rect: Phaser.GameObjects.Rectangle;
  private tween: Phaser.Tweens.Tween | null = null;

  constructor(private scene: Phaser.Scene) {
    this.rect = scene.add
      .rectangle(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, DUST_STORM_TINT_COLOR, 1)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(DUST_STORM_OVERLAY_DEPTH)
      .setAlpha(0);
    this.rect.disableInteractive();

    gameEvents.on('world-event-started', ({ type }: { type: WorldEventType }) => {
      if (type === 'dustStorm') {
        this.applyVisible(true, false);
      }
    });
    gameEvents.on('world-event-ended', ({ type }: { type: WorldEventType }) => {
      if (type === 'dustStorm') {
        this.applyVisible(false, false);
      }
    });
    gameEvents.on('game-reset', () => this.applyVisible(false, true));
  }

  private applyVisible(visible: boolean, immediate: boolean): void {
    const target = visible ? DUST_STORM_OVERLAY_ALPHA : 0;

    this.tween?.stop();
    this.tween = null;

    if (immediate) {
      this.rect.setAlpha(target);
      return;
    }

    this.tween = this.scene.tweens.add({
      targets: this.rect,
      alpha: target,
      duration: DUST_STORM_TRANSITION_MS,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.tween = null;
      },
    });
  }

  destroy(): void {
    this.tween?.stop();
    this.rect.destroy();
  }
}
