import {
  BUILDING_DEFINITIONS,
  BuildingType,
  FIXED_RATE_SELL_TABLES,
  MARKETABLE_RESOURCE_KEYS,
  RESOURCE_LABELS,
  RESOURCE_VALUES,
  ResourceKey,
  isMarketableResource,
} from '../config/buildingConfig';
import { getResourceConsumers, getResourceProducerLabels } from '../config/resourceGraph';
import { gameEvents } from '../state/gameEvents';
import { getResourceTrends, getResources } from '../state/gameState';
import { getCurrentMarketPrice } from '../state/market';

/**
 * Phase 93: "what do I get for each good, and where do I sell it?"
 *
 * The economy was already fully discoverable in principle - the resource HUD
 * tooltip (Phase 48) lists producers/consumers, the Help panel lists chains,
 * the Statistics panel tracks rates - but none of them ever answered the one
 * question the player actually asked, which is what a good is WORTH and which
 * building turns it into money. "Consumed by: Supermarket" is technically the
 * answer and reads like the good is being eaten.
 *
 * So this panel is explicitly a SELL-oriented view: one row per resource,
 * sorted so the goods you can sell right now come first, showing live stock,
 * net rate, the live market price, and - the point of the whole thing - which
 * buildings buy it, at what per-tick rate, versus the goods that have no buyer
 * at all and exist only as an input.
 *
 * Everything is DERIVED (BUILDING_DEFINITIONS, the three fixed-rate sell
 * tables, resourceGraph, state/market), never hand-listed, so it cannot drift
 * from the real economy the next time a chain is added - the same rule
 * HelpOverlay follows.
 *
 * A modal like HelpOverlay rather than a docked panel: it's a read-then-close
 * reference, and every screen corner is already occupied by one of the nine
 * existing panels.
 */

interface SellOutlet {
  label: string;
  amountPerTick: number;
  basePrice: number;
}

/** Which buildings buy `key`, at what rate - straight off the fixed-rate sell tables. */
function getSellOutlets(key: ResourceKey): SellOutlet[] {
  const outlets: SellOutlet[] = [];
  for (const [type, rates] of Object.entries(FIXED_RATE_SELL_TABLES) as [
    BuildingType,
    Record<string, { amount: number; price: number }>,
  ][]) {
    const rate = rates[key];
    if (rate) {
      outlets.push({
        label: BUILDING_DEFINITIONS[type].label,
        amountPerTick: rate.amount,
        basePrice: rate.price,
      });
    }
  }
  return outlets;
}

export class EconomyPanel {
  private overlay: HTMLDivElement;
  private content: HTMLDivElement;
  private visible = false;

  constructor(container: HTMLElement) {
    this.overlay = document.createElement('div');
    this.overlay.id = 'economy-overlay';
    this.overlay.hidden = true;

    this.content = document.createElement('div');
    this.content.id = 'economy-panel';
    this.overlay.appendChild(this.content);
    container.appendChild(this.overlay);

    this.overlay.addEventListener('click', (event) => {
      if (event.target === this.overlay) {
        this.hide();
      }
    });

    gameEvents.on('toggle-economy-panel', () => this.toggle());
    // Live numbers (stock/rate/price) while it's open; gated on `visible` so a
    // closed panel costs nothing per tick, matching StatisticsPanel.
    gameEvents.on('production-tick', () => {
      if (this.visible) {
        this.render();
      }
    });
  }

  private toggle(): void {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  private hide(): void {
    this.visible = false;
    this.overlay.hidden = true;
  }

  private show(): void {
    this.visible = true;
    this.overlay.hidden = false;
    this.render();
  }

  private render(): void {
    const sellable: ResourceKey[] = [];
    const inputsOnly: ResourceKey[] = [];
    for (const key of Object.keys(RESOURCE_LABELS) as ResourceKey[]) {
      (getSellOutlets(key).length > 0 || isMarketableResource(key) ? sellable : inputsOnly).push(key);
    }

    this.content.innerHTML = `
      <h2>Economy &mdash; what sells where</h2>
      <div class="economy-note">
        Money comes from selling goods. A seller building sells its listed goods automatically,
        every tick, as long as it is staffed &mdash; you never click to sell.
        Prices fluctuate: dumping a lot of one good pushes its price down for a while.
      </div>
      <h3>Goods you can sell</h3>
      <table class="economy-table">
        <tr><th>Good</th><th>Stock</th><th>Rate</th><th>Price now</th><th>Sold at</th></tr>
        ${sellable.map((key) => this.renderSellableRow(key)).join('')}
      </table>
      <h3>Goods with no buyer (inputs only)</h3>
      <div class="economy-note">
        These are never worth money directly &mdash; they only matter as inputs to something else,
        so build the consumer or you are stockpiling for nothing.
      </div>
      <table class="economy-table">
        <tr><th>Good</th><th>Stock</th><th>Made by</th><th>Needed by</th></tr>
        ${inputsOnly.map((key) => this.renderInputRow(key)).join('')}
      </table>
      <div class="economy-actions"><button type="button" id="economy-close">Close</button></div>
    `;

    this.content.querySelector('#economy-close')?.addEventListener('click', () => this.hide());
  }

  private renderSellableRow(key: ResourceKey): string {
    const stock = Math.round(getResources()[key] * 10) / 10;
    const trend = Math.round(getResourceTrends()[key] * 10) / 10;
    const trendText = trend > 0 ? `+${trend}` : `${trend}`;
    const price = isMarketableResource(key) ? `$${(Math.round(getCurrentMarketPrice(key) * 100) / 100).toFixed(2)}` : '-';

    const outlets = getSellOutlets(key);
    const outletText = outlets
      .map((outlet) => `${outlet.label} (${outlet.amountPerTick}/tick, ~$${outlet.basePrice})`)
      .join('<br>');
    const tradingPost = (MARKETABLE_RESOURCE_KEYS as ResourceKey[]).includes(key)
      ? `${outlets.length > 0 ? '<br>' : ''}Trading Post (manual order)`
      : '';

    return `<tr>
      <td class="economy-key">${RESOURCE_LABELS[key]}</td>
      <td>${stock}</td>
      <td>${trendText}/tick</td>
      <td>${price}</td>
      <td>${outletText}${tradingPost}</td>
    </tr>`;
  }

  private renderInputRow(key: ResourceKey): string {
    const stock = Math.round(getResources()[key] * 10) / 10;
    const producers = getResourceProducerLabels(key);
    // Sellers are filtered out here by construction (this row only exists for
    // goods with no outlet), so every consumer left is a genuine input use.
    const consumers = getResourceConsumers(key).map((type) => BUILDING_DEFINITIONS[type].label);
    return `<tr>
      <td class="economy-key">${RESOURCE_LABELS[key]}</td>
      <td>${stock}</td>
      <td>${producers.length > 0 ? producers.join(', ') : '-'}</td>
      <td>${consumers.length > 0 ? consumers.join(', ') : `nothing yet (worth $${RESOURCE_VALUES[key]} toward net worth)`}</td>
    </tr>`;
  }
}
