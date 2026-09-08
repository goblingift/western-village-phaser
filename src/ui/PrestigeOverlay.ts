import { TOWN_RANK_LABELS } from '../config/townRank';
import {
  PRESTIGE_MIN_DAY,
  PRESTIGE_MIN_RANK,
  canEstablishNewTown,
  establishNewTown,
  getDayNumber,
  getTownRank,
} from '../state/gameState';
import { gameEvents } from '../state/gameEvents';
import {
  PRESTIGE_UPGRADES,
  PrestigeUpgrade,
  getLegacyPoints,
  getNextUpgradeCost,
  getOwnedStackCount,
  purchaseUpgrade,
} from '../state/prestige';

/**
 * Phase 84: the Prestige shop + "Establish a New Town" action. Follows
 * HelpOverlay/SaveLoadOverlay's exact construction/show-hide pattern - a
 * centered modal is appropriate here too, since spending legacy points or
 * cashing out a run are both deliberate, look-then-act decisions rather than
 * something done passively while the modal stays open.
 *
 * Reachable from two places (per the phase's entry-point requirement): mid-
 * run via BuildingBar's "Legacy" button, and pre-run via
 * DifficultySelectOverlay's shop link - both just emit the same
 * 'toggle-prestige-overlay' this class is the sole listener for, so a player
 * can spend banked legacy before a fresh run starts, not only mid-run.
 */
export class PrestigeOverlay {
  private overlay: HTMLDivElement;
  private content: HTMLDivElement;
  private visible = false;

  constructor(container: HTMLElement) {
    this.overlay = document.createElement('div');
    this.overlay.id = 'prestige-overlay';
    this.overlay.hidden = true;

    this.content = document.createElement('div');
    this.content.id = 'prestige-panel';
    this.overlay.appendChild(this.content);
    container.appendChild(this.overlay);

    this.overlay.addEventListener('click', (event) => {
      if (event.target === this.overlay) {
        this.hide();
      }
    });

    gameEvents.on('toggle-prestige-overlay', () => this.toggle());
    // A cash-out performs a full resetGame() itself - re-render so the
    // balance/shop reflect the just-banked legacy and the gate re-evaluates
    // against the brand new (rank camp, day 1) town.
    gameEvents.on('town-established', (payload: { legacyEarned: number }) =>
      this.onTownEstablished(payload.legacyEarned),
    );
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
    this.render();
    this.visible = true;
    this.overlay.hidden = false;
  }

  private onTownEstablished(legacyEarned: number): void {
    if (!this.visible) {
      return;
    }
    this.render(`New town founded! +${legacyEarned} legacy banked.`);
  }

  private render(banner?: string): void {
    const legacyPoints = getLegacyPoints();
    const gate = canEstablishNewTown();

    this.content.innerHTML = `
      <h2>Prestige</h2>
      ${banner ? `<div class="prestige-banner">${banner}</div>` : ''}
      <div class="stat">Legacy Points: ${legacyPoints}</div>
      <div class="help-note">Spend legacy on permanent upgrades that carry into every future town. Legacy is earned when a run ends (death, time-up, or a voluntary cash-out below).</div>
      <h3>Upgrades</h3>
      <table class="prestige-table">${this.renderUpgradeRows(legacyPoints)}</table>
      <h3>Establish a New Town</h3>
      <div class="help-note">Voluntarily ends the current run for a bonus legacy payout, then starts a brand new town on a fresh map - buildings, resources and the day count all reset. Purchased upgrades and legacy points are kept.</div>
      <div class="stat">Requires ${TOWN_RANK_LABELS[PRESTIGE_MIN_RANK]} rank or Day ${PRESTIGE_MIN_DAY} (currently ${TOWN_RANK_LABELS[getTownRank()]}, Day ${getDayNumber()}).</div>
      <button id="prestige-establish-button" ${gate.allowed ? '' : 'disabled'}>Establish a New Town</button>
      ${gate.allowed ? '' : `<div class="prestige-gate-reason">${gate.reason ?? ''}</div>`}
      <div class="save-load-actions">
        <button type="button" id="prestige-close">Close</button>
      </div>
    `;

    this.attachHandlers();
  }

  private renderUpgradeRows(legacyPoints: number): string {
    return PRESTIGE_UPGRADES.map((upgrade) => this.renderUpgradeRow(upgrade, legacyPoints)).join('');
  }

  private renderUpgradeRow(upgrade: PrestigeUpgrade, legacyPoints: number): string {
    const owned = getOwnedStackCount(upgrade.id);
    const nextCost = getNextUpgradeCost(upgrade.id);
    const maxedOut = nextCost === null;
    const affordable = nextCost !== null && legacyPoints >= nextCost;

    const stackLabel = upgrade.maxStacks > 1 ? ` (${owned}/${upgrade.maxStacks})` : owned > 0 ? ' (Owned)' : '';
    const buttonLabel = maxedOut ? 'Maxed' : `Buy - ${nextCost} pts`;

    return `
      <tr class="prestige-row${maxedOut ? ' prestige-row-maxed' : ''}">
        <td>
          <b>${upgrade.label}${stackLabel}</b><br>
          <span class="prestige-desc">${upgrade.description}</span>
        </td>
        <td class="prestige-actions-cell">
          <button type="button" class="prestige-buy" data-upgrade="${upgrade.id}" ${maxedOut || !affordable ? 'disabled' : ''}>${buttonLabel}</button>
        </td>
      </tr>
    `;
  }

  private attachHandlers(): void {
    this.content.querySelectorAll<HTMLButtonElement>('.prestige-buy').forEach((button) => {
      button.addEventListener('click', () => {
        const upgradeId = button.dataset.upgrade;
        if (!upgradeId) {
          return;
        }
        purchaseUpgrade(upgradeId);
        this.render();
      });
    });

    this.content.querySelector('#prestige-establish-button')?.addEventListener('click', () => {
      const gate = canEstablishNewTown();
      if (!gate.allowed) {
        return;
      }
      // Destructive to the current run - matches SaveLoadOverlay's native-
      // dialog convention (window.prompt for a save label) with the
      // confirm/cancel equivalent for a destructive action, since no
      // in-house confirm dialog component exists in this codebase.
      const confirmed = window.confirm(
        'Establish a new town now? This ends your current run (buildings, resources and terrain all reset) in exchange for a bonus legacy payout. This cannot be undone.',
      );
      if (!confirmed) {
        return;
      }
      establishNewTown();
      // 'town-established' (emitted by establishNewTown) re-renders with the
      // confirmation banner; the overlay itself stays open so the player can
      // immediately spend the newly banked legacy on the fresh town.
    });

    this.content.querySelector('#prestige-close')?.addEventListener('click', () => this.hide());
  }
}
