import { BUILDING_DEFINITIONS, BuildingType, PlacedBuilding, ResourceKey } from '../config/buildingConfig';
import { gameEvents } from '../state/gameEvents';
import { DayPhase, getResources, getStorageCap } from '../state/gameState';

/**
 * Phase 64: first-run tutorial.
 *
 * The game ships 36 building types, 16 resources and ~18 hotkeys with no
 * in-game guidance at all, so a brand-new player has no idea what the first
 * click should be. This walks them through the shortest path to a working
 * economy and then gets out of the way.
 *
 * Design decisions worth stating, since they're easy to get wrong:
 *  - Steps advance off REAL gameplay events ('building-placed' of the right
 *    type, 'animal-bought'), not a "Next" button, so the overlay reacts to
 *    what the player actually did rather than asking them to read ahead.
 *  - It is a small docked card, NOT a modal backdrop. A modal would have to
 *    be dismissed before the player could do the very thing it's asking for.
 *  - It docks bottom-center, the one band left free by the eight existing
 *    panels (HUD/minimap top-left, statistics top-right, objectives
 *    top-center, info panel bottom-right, notification log bottom-left).
 *
 * Phase 96 extends this in two ways rather than one:
 *  - the linear script now covers the things a player CANNOT get started
 *    without: the fence pen (previously deferred and merely mentioned - but
 *    an animal genuinely cannot be bought without one, so deferring it left
 *    the old step 4 unachievable for a player who didn't already know) and
 *    the Market Stall (nothing in this game is ever clicked to sell, so
 *    without a seller a player can watch goods pile up and money fall);
 *  - everything else is a CONTEXTUAL ONE-SHOT TIP fired by a real event
 *    ('building-placed', 'building-unlocked', 'day-phase-changed', a
 *    resource hitting the storage cap) rather than more linear steps. A tip
 *    fires at the moment it's relevant, once ever, and is never replayed -
 *    the same don't-nag contract the seen-flag gives the main script.
 */

const TUTORIAL_SEEN_KEY = 'western-village-tutorial-seen';
/** Phase 96: which contextual tips this player has already been shown, so none of them ever fires twice. */
const TIPS_SEEN_KEY = 'western-village-tips-seen';

interface TutorialStep {
  title: string;
  body: string;
  /** Fired when this step's goal is met; the step advances itself. */
  isComplete?: (event: TutorialProgressEvent) => boolean;
  /** Steps with no completion condition (intro/outro) show a Continue button instead. */
  manualAdvance?: boolean;
}

type TutorialProgressEvent =
  | { kind: 'building-placed'; type: BuildingType }
  | { kind: 'animal-bought' };

const STEPS: TutorialStep[] = [
  {
    title: 'Welcome to Western Village',
    body: 'Build a town, keep it fed and watered, and defend it when the raiders come at night. This guide covers the first few minutes - you can skip it any time.',
    manualAdvance: true,
  },
  {
    title: 'Step 1 - Build a House',
    body: 'Houses provide the workers every other building needs. Pick <b>House</b> from the building bar, then click an empty tile to place it.',
    isComplete: (event) => event.kind === 'building-placed' && event.type === BuildingType.House,
  },
  {
    title: 'Step 2 - Build a Well',
    body: 'Houses need Water, so place a <b>Well</b> next. Wells must sit within a few tiles of water - the placement preview turns red and tells you why if a spot is invalid.',
    isComplete: (event) => event.kind === 'building-placed' && event.type === BuildingType.Well,
  },
  {
    title: 'Step 3 - Build a Chicken Farm',
    body: 'Now some food. A <b>Chicken Farm</b> is the cheap starter livestock building - small, fast to pay off, and available from the very beginning.',
    isComplete: (event) => event.kind === 'building-placed' && event.type === BuildingType.ChickenFarm,
  },
  {
    title: 'Step 4 - Fence a pen around it',
    body: 'Animals need somewhere to live: a <b>fully closed</b> loop of <b>Fence</b> around the farm, with no gaps. Pick Fence and <b>drag</b> to lay a whole line at once. The farm\'s info panel shows "Enclosure: ..." and tells you exactly what is still wrong.',
    isComplete: (event) => event.kind === 'building-placed' && event.type === BuildingType.Fence,
  },
  {
    title: 'Step 5 - Stock it with animals',
    body: 'Now select the farm and press <b>Buy Animal</b> in its info panel. If the button is disabled it says why - usually the pen is still open somewhere, or too small for another animal.',
    isComplete: (event) => event.kind === 'animal-bought',
  },
  {
    title: 'Step 6 - Build a Market Stall',
    body: 'Eggs are worth nothing until someone sells them, and <b>nothing in this game is ever clicked to sell</b>. A staffed <b>Market Stall</b> sells your basic goods automatically, every tick. Without a seller your money only ever goes down.',
    isComplete: (event) => event.kind === 'building-placed' && event.type === BuildingType.MarketStall,
  },
  {
    title: "You're running",
    body: 'That is the whole loop: produce, sell, reinvest. Press <b>M</b> for what every good is worth and which building buys it, or <b>H</b> for hotkeys and the full chain reference. Tips will pop up as new things happen.',
    manualAdvance: true,
  },
];

/**
 * Contextual one-shot tips. Each fires from a real gameplay event the first
 * time it ever happens for this player, and never again.
 *
 * Deliberately NOT more linear steps: these cover things that happen on the
 * game's schedule rather than the player's (an unlock, nightfall, a full
 * warehouse), so a script would either block waiting for them or explain them
 * minutes before they matter.
 */
interface TutorialTip {
  id: string;
  title: string;
  body: string;
}

const TIPS: Record<string, TutorialTip> = {
  construction: {
    id: 'construction',
    title: 'Buildings take time to build',
    body: 'A new building sits inert behind scaffolding for a few seconds before it works - it produces nothing, employs nobody and costs no upkeep until it is finished. Its info panel counts the ticks down. It can still be attacked while it is going up.',
  },
  unlock: {
    id: 'unlock',
    title: 'New buildings unlocked',
    body: 'Most buildings are locked until your town is big or rich enough. A locked button is greyed out with a padlock and its tooltip tells you the exact requirement - so the building bar doubles as a to-do list.',
  },
  storageCap: {
    id: 'storageCap',
    title: 'Storage is full',
    body: 'Every resource shares a storage cap, and production above it is thrown away. Build a <b>Granary</b> (cheap, always available) or a <b>Warehouse</b> (much bigger, unlocks later) - or sell the surplus, which is usually better.',
  },
  night: {
    id: 'night',
    title: 'Night falls',
    body: 'Raiders only attack at night, and never in the first few minutes. Before then, put up a <b>Barracks</b> to train Cowboys, or a <b>Watchtower</b>, which shoots on its own. Right-click a raider with units selected to focus fire.',
  },
  chain: {
    id: 'chain',
    title: 'Raw goods are worth more processed',
    body: 'Raw Meat sells for very little on its own. A <b>Butcher</b> turns Raw Meat + Water into Meat, worth several times as much - and building it near its suppliers gives it a production bonus. Press <b>M</b> to see every chain and price.',
  },
};

export class TutorialOverlay {
  private panel: HTMLDivElement;
  private stepIndex = 0;
  private active = false;
  /** Phase 96: tip ids already shown to this player, ever (persisted). */
  private readonly shownTipIds = loadSeenTips();
  private readonly pendingTips: (keyof typeof TIPS)[] = [];
  private activeTipId: keyof typeof TIPS | null = null;

  constructor(container: HTMLElement) {
    this.panel = document.createElement('div');
    this.panel.id = 'tutorial-panel';
    this.panel.hidden = true;
    container.appendChild(this.panel);

    gameEvents.on('building-placed', (building: PlacedBuilding) => {
      this.handleProgress({ kind: 'building-placed', type: building.type });
      // Phase 96: the construction delay reads as a bug ("I built it and
      // nothing happened") the very first time it's seen, so the tip fires on
      // the first building the player ever places.
      this.queueTip('construction');
      if (this.producesRawMeat(building.type)) {
        this.queueTip('chain');
      }
    });
    gameEvents.on('animal-bought', () => this.handleProgress({ kind: 'animal-bought' }));

    // Phase 96 contextual tips, each fired by a real event rather than a timer.
    gameEvents.on('building-unlocked', () => this.queueTip('unlock'));
    gameEvents.on('day-phase-changed', (change: { phase: DayPhase }) => {
      if (change.phase === 'night') {
        this.queueTip('night');
      }
    });
    gameEvents.on('production-tick', () => this.checkStorageCapTip());

    // Replay on demand from the Help panel, regardless of the seen-flag.
    gameEvents.on('start-tutorial', () => this.start());

    // A fresh run auto-starts the tutorial only for a player who has never
    // finished or skipped it before.
    gameEvents.on('game-reset', () => {
      // A queued-but-unshown tip from the previous run is stale; drop it.
      this.pendingTips.length = 0;
      if (!hasSeenTutorial()) {
        this.start();
      }
    });
  }

  /**
   * Shows a tip once ever, per player. Never interrupts the linear script (or
   * another tip) - it queues, and the queue drains as each card is dismissed,
   * so two things happening in the same tick can't clobber each other.
   */
  private queueTip(id: keyof typeof TIPS): void {
    if (this.shownTipIds.has(id) || this.pendingTips.includes(id)) {
      return;
    }
    this.shownTipIds.add(id);
    saveSeenTips(this.shownTipIds);
    this.pendingTips.push(id);
    this.showNextTipIfIdle();
  }

  private showNextTipIfIdle(): void {
    if (this.active || this.activeTipId !== null) {
      return;
    }
    const next = this.pendingTips.shift();
    if (!next) {
      return;
    }
    this.activeTipId = next;
    this.renderTip(TIPS[next]);
  }

  private dismissTip(): void {
    this.activeTipId = null;
    this.panel.hidden = true;
    this.showNextTipIfIdle();
  }

  /** Fires the storage-cap tip the first time any resource is actually sitting at the cap. */
  private checkStorageCapTip(): void {
    if (this.shownTipIds.has('storageCap')) {
      return;
    }
    const cap = getStorageCap();
    const resources = getResources();
    for (const value of Object.values(resources) as number[]) {
      if (value >= cap) {
        this.queueTip('storageCap');
        return;
      }
    }
  }

  private producesRawMeat(type: BuildingType): boolean {
    const outputs = BUILDING_DEFINITIONS[type].animal?.outputPerAnimal ?? {};
    return (Object.keys(outputs) as ResourceKey[]).includes('rawMeat');
  }

  private renderTip(tip: TutorialTip): void {
    this.panel.innerHTML = `
      <div class="tutorial-progress">Tip</div>
      <div class="tutorial-title">${tip.title}</div>
      <div class="tutorial-body">${tip.body}</div>
      <div class="tutorial-actions">
        <button type="button" class="tutorial-advance">Got it</button>
      </div>
    `;
    this.panel.querySelector('.tutorial-advance')?.addEventListener('click', () => this.dismissTip());
    this.panel.hidden = false;
  }

  private start(): void {
    this.stepIndex = 0;
    this.active = true;
    this.render();
  }

  private handleProgress(event: TutorialProgressEvent): void {
    if (!this.active) {
      return;
    }
    const step = STEPS[this.stepIndex];
    if (step?.isComplete?.(event)) {
      this.advance();
    }
  }

  private advance(): void {
    this.stepIndex += 1;
    if (this.stepIndex >= STEPS.length) {
      this.finish();
      return;
    }
    this.render();
  }

  /** Both "skip" and reaching the last step mark the tutorial seen, so neither replays automatically. */
  private finish(): void {
    this.active = false;
    this.panel.hidden = true;
    markTutorialSeen();
    // Anything that fired while the script was running shows now, in order.
    this.showNextTipIfIdle();
  }

  private render(): void {
    const step = STEPS[this.stepIndex];
    if (!step) {
      this.finish();
      return;
    }

    const advanceButton = step.manualAdvance
      ? '<button type="button" class="tutorial-advance">Continue</button>'
      : '';

    this.panel.innerHTML = `
      <div class="tutorial-progress">Step ${this.stepIndex + 1} of ${STEPS.length}</div>
      <div class="tutorial-title">${step.title}</div>
      <div class="tutorial-body">${step.body}</div>
      <div class="tutorial-actions">
        ${advanceButton}
        <button type="button" class="tutorial-skip">Skip tutorial</button>
      </div>
    `;

    this.panel.querySelector('.tutorial-advance')?.addEventListener('click', () => this.advance());
    this.panel.querySelector('.tutorial-skip')?.addEventListener('click', () => this.finish());

    this.panel.hidden = false;
  }
}

/** Kept module-level (not private methods) so the flag's storage shape stays in one place, and so a storage failure degrades to "always show" rather than throwing into the caller. */
export function hasSeenTutorial(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

/** Same storage-failure contract as the seen-flag: a failure means tips may repeat, never that the run crashes. */
function loadSeenTips(): Set<string> {
  try {
    const raw = localStorage.getItem(TIPS_SEEN_KEY);
    if (!raw) {
      return new Set();
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((id): id is string => typeof id === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

function saveSeenTips(ids: Set<string>): void {
  try {
    localStorage.setItem(TIPS_SEEN_KEY, JSON.stringify([...ids]));
  } catch {
    // Ignored for the same reason markTutorialSeen ignores it.
  }
}

export function markTutorialSeen(): void {
  try {
    localStorage.setItem(TUTORIAL_SEEN_KEY, '1');
  } catch {
    // Private-mode/full storage: the tutorial will simply offer itself again
    // next run, which is a far better failure than crashing the run start.
  }
}
