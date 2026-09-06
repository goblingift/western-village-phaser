import Phaser from 'phaser';
import {
  RESOURCE_ICONS_ATLAS_KEY,
  RESOURCE_ICON_SIZE,
  RESOURCE_LABELS,
  ResourceKey,
  resourceIconTextureKey,
} from '../config/buildingConfig';
import { getResourceConsumerLabels, getResourceProducerLabels } from '../config/resourceGraph';
import { gameEvents } from '../state/gameEvents';
import {
  getEmployedPopulation,
  getIdlePopulation,
  getLaborShortfall,
  getMoney,
  getResourceTrends,
  getResources,
  getStorageCap,
  getTotalPopulation,
} from '../state/gameState';

/**
 * Phase 33: the resource readout used to be three ever-lengthening lines of
 * concatenated text that collided with the minimap every time a resource was
 * added. It's now a laid-out panel: a header line for the town-level numbers
 * (money/population/storage) and a two-column icon grid for the eleven
 * resources, each showing its current stock and its change over the last
 * completed tick.
 *
 * Extracted from MainScene rather than added to it - the scene is already the
 * largest file in the project and owns raids, units, input and visuals; a
 * self-contained HUD widget has no business growing it further. The scene
 * only needs its constructor, refresh() and getBottomY() (which the minimap
 * uses to position itself beneath the panel, whatever height it ends up).
 *
 * Phase 48: each row also gets an invisible interactive Zone (rather than
 * making the icon/text Images themselves interactive - a Zone covering the
 * full row is far more forgiving to hover/click) driving a small DOM tooltip
 * (stock/net-rate/producers/consumers, sourced from config/resourceGraph.ts)
 * and a click-to-select that emits 'resource-selected' for MainScene's
 * chain-view map highlight. The panel is a Phaser canvas widget, so the
 * building bar's native `title`-attribute tooltip trick doesn't apply here -
 * this is a small new DOM element instead, styled to match the existing
 * dark-panel look (#building-info-panel et al).
 */
const PANEL_X = 8;
const PANEL_Y = 8;
const PANEL_PADDING = 8;
const COLUMN_WIDTH = 150;
const COLUMNS = 2;
const ROW_HEIGHT = 17;
const ICON_TEXT_GAP = 4;
const HEADER_HEIGHT = 22;
const PANEL_DEPTH = 999;
const PANEL_CONTENT_DEPTH = 1000;
const PANEL_BG_COLOR = 0x2b1d12;
const PANEL_BG_ALPHA = 0.85;
const PANEL_BORDER_COLOR = 0x8d6e4a;
const TREND_UP_COLOR = '#8bc34a';
const TREND_DOWN_COLOR = '#ef5350';
const TREND_FLAT_COLOR = '#8d7f6e';
const SELECTED_ROW_COLOR = 0xffd54f;
/** Offset (px) of the DOM tooltip from the cursor, in the same game-pixel space pointer.x/y already report (Scale.NONE means 1:1 with #stage's CSS pixels). */
const TOOLTIP_OFFSET_PX = 14;

const round1 = (n: number) => Math.round(n * 10) / 10;

interface ResourceRow {
  icon: Phaser.GameObjects.Image;
  valueText: Phaser.GameObjects.Text;
  trendText: Phaser.GameObjects.Text;
  zone: Phaser.GameObjects.Zone;
  rowX: number;
  rowY: number;
}

export class ResourceHudPanel {
  private background: Phaser.GameObjects.Graphics;
  private headerText: Phaser.GameObjects.Text;
  private rows = new Map<ResourceKey, ResourceRow>();
  private panelWidth: number;
  private panelHeight: number;
  private tooltip: HTMLDivElement;
  private hoveredKey: ResourceKey | null = null;
  private selectedKey: ResourceKey | null = null;

  constructor(private scene: Phaser.Scene) {
    const keys = Object.keys(RESOURCE_LABELS) as ResourceKey[];
    const rowCount = Math.ceil(keys.length / COLUMNS);

    this.panelWidth = COLUMN_WIDTH * COLUMNS + PANEL_PADDING * 2;
    this.panelHeight = HEADER_HEIGHT + rowCount * ROW_HEIGHT + PANEL_PADDING * 2;

    this.background = scene.add.graphics().setScrollFactor(0).setDepth(PANEL_DEPTH);
    this.drawBackground();

    this.headerText = scene.add
      .text(PANEL_X + PANEL_PADDING, PANEL_Y + PANEL_PADDING, '', {
        fontSize: '13px',
        color: '#ffd54f',
      })
      .setScrollFactor(0)
      .setDepth(PANEL_CONTENT_DEPTH);

    this.tooltip = this.createTooltipElement();

    keys.forEach((key, index) => {
      const column = index % COLUMNS;
      const row = Math.floor(index / COLUMNS);
      const x = PANEL_X + PANEL_PADDING + column * COLUMN_WIDTH;
      const y = PANEL_Y + PANEL_PADDING + HEADER_HEIGHT + row * ROW_HEIGHT;

      const icon = scene.add
        .image(x, y + ROW_HEIGHT / 2, RESOURCE_ICONS_ATLAS_KEY, resourceIconTextureKey(key))
        .setOrigin(0, 0.5)
        .setScrollFactor(0)
        .setDepth(PANEL_CONTENT_DEPTH);

      const valueText = scene.add
        .text(x + RESOURCE_ICON_SIZE + ICON_TEXT_GAP, y + 1, '', {
          fontSize: '12px',
          color: '#f2e6d8',
        })
        .setScrollFactor(0)
        .setDepth(PANEL_CONTENT_DEPTH);

      // Right-aligned against the column edge so the trend column stays a
      // straight visual line regardless of how long the value text gets.
      const trendText = scene.add
        .text(x + COLUMN_WIDTH - ICON_TEXT_GAP * 2, y + 1, '', {
          fontSize: '11px',
          color: TREND_FLAT_COLOR,
        })
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(PANEL_CONTENT_DEPTH);

      const zone = scene.add
        .zone(x - ICON_TEXT_GAP, y, COLUMN_WIDTH - PANEL_PADDING, ROW_HEIGHT)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });

      zone.on('pointerover', () => {
        this.hoveredKey = key;
        this.renderTooltip(key);
        this.tooltip.style.display = 'block';
      });
      zone.on('pointermove', (pointer: Phaser.Input.Pointer) => this.positionTooltip(pointer));
      zone.on('pointerout', () => {
        if (this.hoveredKey === key) {
          this.hoveredKey = null;
        }
        this.tooltip.style.display = 'none';
      });
      zone.on('pointerdown', () => {
        const next = this.selectedKey === key ? null : key;
        gameEvents.emit('resource-selected', next);
      });

      this.rows.set(key, { icon, valueText, trendText, zone, rowX: x - ICON_TEXT_GAP, rowY: y });
    });

    // Phase 48: MainScene's Escape/'C' hotkey handling is the other writer of
    // this selection (clearing it, or toggling the overlay's visibility
    // without forgetting it) - listening here rather than exposing a setter
    // keeps 'who owns the selected resource' answerable by "whoever last
    // emitted this event", with a single source of truth for both this
    // panel's row highlight and MainScene's map overlay.
    gameEvents.on('resource-selected', (key: ResourceKey | null) => {
      this.selectedKey = key;
      this.drawBackground();
    });

    this.refresh();
  }

  private createTooltipElement(): HTMLDivElement {
    const stageEl = document.getElementById('stage') ?? document.body;
    const tooltip = document.createElement('div');
    tooltip.id = 'resource-tooltip';
    tooltip.style.display = 'none';
    stageEl.appendChild(tooltip);
    return tooltip;
  }

  private positionTooltip(pointer: Phaser.Input.Pointer): void {
    this.tooltip.style.left = `${pointer.x + TOOLTIP_OFFSET_PX}px`;
    this.tooltip.style.top = `${pointer.y + TOOLTIP_OFFSET_PX}px`;
  }

  private renderTooltip(key: ResourceKey): void {
    const resources = getResources();
    const trends = getResourceTrends();
    const stock = round1(resources[key]);
    const trend = round1(trends[key]);
    const trendText = trend > 0 ? `+${trend}/tick` : `${trend}/tick`;
    const producers = getResourceProducerLabels(key);
    const consumers = getResourceConsumerLabels(key);

    this.tooltip.innerHTML = `
      <strong>${RESOURCE_LABELS[key]}</strong>
      <div>Stock: ${stock}</div>
      <div>Net rate: ${trendText}</div>
      <div>Produced by: ${producers.length > 0 ? producers.join(', ') : 'Nothing yet'}</div>
      <div>Consumed by: ${consumers.length > 0 ? consumers.join(', ') : 'Nothing yet'}</div>
      <div class="hint">Click: highlight on map | Esc: clear | C: toggle</div>
    `;
  }

  private drawBackground(): void {
    this.background.clear();
    this.background.fillStyle(PANEL_BG_COLOR, PANEL_BG_ALPHA);
    this.background.fillRoundedRect(PANEL_X, PANEL_Y, this.panelWidth, this.panelHeight, 6);
    this.background.lineStyle(1, PANEL_BORDER_COLOR, 0.9);
    this.background.strokeRoundedRect(PANEL_X, PANEL_Y, this.panelWidth, this.panelHeight, 6);

    if (this.selectedKey) {
      const row = this.rows.get(this.selectedKey);
      if (row) {
        this.background.lineStyle(2, SELECTED_ROW_COLOR, 1);
        this.background.strokeRoundedRect(row.rowX, row.rowY, COLUMN_WIDTH - PANEL_PADDING + ICON_TEXT_GAP, ROW_HEIGHT, 3);
      }
    }
  }

  /** Y coordinate just below the panel, used by the minimap to sit under it. */
  getBottomY(): number {
    return PANEL_Y + this.panelHeight;
  }

  getWidth(): number {
    return this.panelWidth;
  }

  refresh(): void {
    // Phase 34: idle population is surfaced here for the first time.
    // gameState has computed it every tick since Phase 12 and nothing ever
    // read it, while "why is my building not working" (answer: no spare
    // workers) stayed invisible. Shown only when non-zero so the common case
    // doesn't carry a permanent "Idle 0".
    const idle = getIdlePopulation();
    const idleText = idle > 0 ? `   Idle ${idle}` : '';
    // Phase 42: town-wide labor shortage (demand across every priority-
    // eligible building minus total population) - distinct from idle, which
    // is spare workers with no job rather than jobs with no worker.
    const shortfall = getLaborShortfall();
    const shortfallText = shortfall > 0 ? ` (short by ${shortfall})` : '';
    this.headerText.setText(
      `$${round1(getMoney())}   Pop ${getEmployedPopulation()}/${getTotalPopulation()}${shortfallText}${idleText}   Cap ${getStorageCap()}`,
    );

    const resources = getResources();
    const trends = getResourceTrends();

    for (const [key, row] of this.rows) {
      row.valueText.setText(`${RESOURCE_LABELS[key]} ${round1(resources[key])}`);

      const trend = round1(trends[key]);
      if (trend > 0) {
        row.trendText.setText(`+${trend}`);
        row.trendText.setColor(TREND_UP_COLOR);
      } else if (trend < 0) {
        row.trendText.setText(`${trend}`);
        row.trendText.setColor(TREND_DOWN_COLOR);
      } else {
        row.trendText.setText('0');
        row.trendText.setColor(TREND_FLAT_COLOR);
      }
    }

    // Keep an open tooltip's stock/rate numbers live rather than frozen at
    // whatever they were when the pointer first entered the row.
    if (this.hoveredKey) {
      this.renderTooltip(this.hoveredKey);
    }
  }

  destroy(): void {
    this.background.destroy();
    this.headerText.destroy();
    for (const { icon, valueText, trendText, zone } of this.rows.values()) {
      icon.destroy();
      valueText.destroy();
      trendText.destroy();
      zone.destroy();
    }
    this.rows.clear();
    this.tooltip.remove();
    void this.scene;
  }
}
