import { BuildingType } from '../config/buildingConfig';
import { gameEvents } from '../state/gameEvents';

/**
 * Phase 33: bridges the Phaser-generated building atlas into the DOM building
 * bar, so its icon buttons show the same pixel art the map does instead of a
 * second, hand-maintained set of icons.
 *
 * BootScene rasterises each building frame into a data URL once (all sprites
 * are procedurally generated into a canvas texture, so this is a cheap
 * one-time canvas read, not an asset load) and publishes it here. The bar may
 * be constructed before or after that happens, hence the small
 * publish/subscribe shape: late subscribers get the icons immediately, early
 * ones get them on 'building-icons-ready'.
 */
type BuildingIconMap = Partial<Record<BuildingType, string>>;

let icons: BuildingIconMap = {};
let ready = false;

/**
 * Phase 91: MERGES rather than replaces, and can be called repeatedly. Icons
 * now arrive in two (or more) waves - BootScene publishes the eagerly-loaded
 * always-unlocked buildings, then MainScene publishes each unlock-gated
 * building as its atlas finishes loading in the background.
 */
export function publishBuildingIcons(next: BuildingIconMap): void {
  icons = { ...icons, ...next };
  ready = true;
  gameEvents.emit('building-icons-ready');
}

export function getBuildingIcon(type: BuildingType): string | null {
  return icons[type] ?? null;
}

/**
 * Phase 91: subscribes for EVERY publish, not just the first - a bar built
 * before the deferred atlases land would otherwise keep its text fallback
 * forever for the 27 unlock-gated buildings. Fires immediately as well if
 * icons are already available, so late subscribers still get them.
 */
export function onBuildingIconsReady(callback: () => void): void {
  if (ready) {
    callback();
  }
  gameEvents.on('building-icons-ready', callback);
}
