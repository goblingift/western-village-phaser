import Phaser from 'phaser';
import { BuildingType, buildingAtlasKey, buildingTextureKey } from '../config/buildingConfig';
import { publishBuildingIcons } from '../ui/buildingIcons';

/**
 * Rasterises building atlas frames into data URLs for the DOM building bar.
 *
 * Phase 91: extracted out of BootScene so it can run TWICE - once in BootScene
 * for the eagerly-loaded (always-unlocked) buildings, and again from MainScene
 * as each deferred, unlock-gated atlas finishes loading in the background.
 * `publishBuildingIcons` merges rather than replaces, so the second call adds
 * to the first instead of clobbering it.
 *
 * Wrapped in try/catch, same as the original: a failed canvas read degrades to
 * BuildingBar's text-label fallback rather than breaking the bar.
 */
export function publishBuildingIconsForTypes(scene: Phaser.Scene, types: BuildingType[]): void {
  try {
    const icons: Partial<Record<BuildingType, string>> = {};
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    for (const type of types) {
      const atlasKey = buildingAtlasKey(type);
      if (!scene.textures.exists(atlasKey)) {
        continue;
      }
      const texture = scene.textures.get(atlasKey);
      const source = texture.getSourceImage();
      if (!(source instanceof HTMLCanvasElement) && !(source instanceof HTMLImageElement)) {
        continue;
      }
      const frame = texture.get(buildingTextureKey(type));
      canvas.width = frame.width;
      canvas.height = frame.height;
      context.clearRect(0, 0, frame.width, frame.height);
      context.drawImage(source, frame.cutX, frame.cutY, frame.width, frame.height, 0, 0, frame.width, frame.height);
      icons[type] = canvas.toDataURL();
    }

    publishBuildingIcons(icons);
  } catch {
    // Icons stay as-is; BuildingBar renders its text-label fallback.
  }
}
