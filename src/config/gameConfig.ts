import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { MainScene } from '../scenes/MainScene';
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from './constants';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'stage',
  width: VIEWPORT_WIDTH,
  height: VIEWPORT_HEIGHT,
  backgroundColor: '#2d2d2d',
  scene: [BootScene, MainScene],
  /**
   * Phase 65 (regression fix). Must stay false. With the default `true`,
   * ScaleManager.getParent() runs before the canvas is injected, measures the
   * still-empty #stage as 0px tall, concludes "clearly no CSS has been set on
   * it" and writes `width: 100%; height: 100%` as an INLINE style directly
   * onto #stage. Inline styles beat the stylesheet, so #stage was pinned to
   * the full width of #app regardless of what index.html asked for; #app's
   * `align-items: center` then had a full-width item to "center" (a no-op)
   * and the letterboxed canvas rendered hard against the top-left with dead
   * space to the right, while the narrower building bar centered correctly -
   * the exact visible symptom. #stage is sized by our own CSS
   * (`width/height: fit-content`), so Phaser expanding it is never wanted.
   */
  expandParent: false,
  /**
   * Phase 64: responsive scaling. Was Scale.NONE with a hardcoded
   * VIEWPORT_WIDTH x VIEWPORT_HEIGHT canvas, which clipped the game on any
   * window smaller than 960x640 and left dead space on larger ones. FIT keeps
   * the internal resolution at exactly VIEWPORT_WIDTH x VIEWPORT_HEIGHT
   * (so every hardcoded game-space coordinate in the codebase - the minimap
   * rect, the HUD panel layout, the night/dust overlay rects - stays valid)
   * and only scales the canvas's CSS size, letterboxing to preserve aspect.
   *
   * This is safe for input because Phaser's ScaleManager already divides
   * browser coordinates by the canvas scale before it populates
   * Pointer.x/Pointer.y, so those remain in 0..VIEWPORT_WIDTH game space
   * under FIT exactly as they were under NONE - which is what every camera
   * getWorldPoint call, the drag-delta math and isPointerInMinimap all rely
   * on. The one place that genuinely had to change is ResourceHudPanel's DOM
   * tooltip, which positions a real HTML element and therefore needs game
   * pixels converted back into CSS pixels (see its own comment).
   */
  scale: {
    mode: Phaser.Scale.FIT,
    /**
     * Centering is done by #app's flexbox, NOT by the ScaleManager.
     * autoCenter: CENTER_BOTH centers by writing margins onto the canvas,
     * which would push the canvas away from its #stage wrapper's edges and
     * drag every #stage-anchored DOM overlay (info panel, notification log,
     * statistics, objectives) out of alignment with the play area. Letting
     * #stage shrink-wrap the canvas and centering the wrapper instead keeps
     * canvas and overlays in exactly one coordinate frame.
     *
     * That shrink-wrap is NOT automatic: it requires #stage's explicit
     * `width/height: fit-content` (see index.html). Without it the wrapper
     * stretches to its containing block's full width, #app's `align-items:
     * center` becomes a no-op, and the canvas renders top-left-docked. This
     * NO_CENTER + fit-content pairing is load-bearing - changing either half
     * alone reintroduces that regression.
     */
    autoCenter: Phaser.Scale.NO_CENTER,
  },
};
