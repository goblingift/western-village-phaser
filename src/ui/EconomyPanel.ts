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
import { RIFLE_AMMO_PER_SHOT, RIFLE_DAMAGE_MULTIPLIER } from '../config/constants';
import { getResourceConsumers, getResourceProducerLabels } from '../config/resourceGraph';
import { gameEvents } from '../state/gameEvents';
import { getResourceTrends, getResources, getWaterLedger } from '../state/gameState';
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
      ${this.renderWaterLedger()}
      <h3>Goods you can sell</h3>
      <table class="economy-table">
        <tr><th>Good</th><th>Stock</th><th>Rate</th><th>Price now</th><th>Sold at</th></tr>
        ${sellable.map((key) => this.renderSellableRow(key)).join('')}
      </table>
      <div class="economy-note">
        Rifles are the exception: they sell for the most of anything, but every shot your units and
        Watchtowers fire spends ${RIFLE_AMMO_PER_SHOT} of one to hit ${RIFLE_DAMAGE_MULTIPLIER}x as hard.
        Selling your armoury is a real decision, not free money.
      </div>
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

  /**
   * Phase 97: the water ledger. Houses pay the town's first and steadiest
   * income (Phase 92's Tier-1 tax) and they pay it ONLY on a tick where their
   * Water need is met - but a Well's real output falls off with its distance
   * to water, so a town can quietly outgrow its wells and lose that income
   * entirely. Nothing in the game showed this: a Tier-1 House cannot drop a
   * tier, so even the tier-change notification never fired.
   *
   * Shown at the top of the economy panel rather than in a new overlay because
   * this IS the town's ledger - where the money comes from and why it stopped.
   */
  private renderWaterLedger(): string {
    const ledger = getWaterLedger();
    if (ledger.totalHouses === 0) {
      return '';
    }

    const shortfall = Math.round((ledger.houseDemandPerTick - ledger.supplyPerTick) * 100) / 100;
    const dry = ledger.dryHouses > 0;
    const short = shortfall > 0;

    const verdict = dry
      ? `<strong class="economy-bad">${ledger.dryHouses} of ${ledger.totalHouses} houses are dry</strong> &mdash;
         a dry house pays no tax at all. Build another Well (closer to water is better) or fewer houses.`
      : short
        ? `<strong class="economy-warn">Wells are behind demand by ${shortfall}/tick</strong> &mdash;
           houses are still paying from the stockpile, but that will run out.`
        : `<strong class="economy-good">Supply covers every house.</strong>`;

    return `
      <h3>Water ledger &mdash; the town's tax base</h3>
      <table class="economy-table">
        <tr><th>Well output (last tick)</th><th>House demand</th><th>Other use</th><th>Houses dry</th></tr>
        <tr>
          <td>${ledger.supplyPerTick}/tick</td>
          <td>${ledger.houseDemandPerTick}/tick</td>
          <td>${ledger.otherDemandPerTick}/tick</td>
          <td class="${dry ? 'economy-bad' : ''}">${ledger.dryHouses} of ${ledger.totalHouses}</td>
        </tr>
      </table>
      <div class="economy-note">${verdict}</div>
    `;
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
