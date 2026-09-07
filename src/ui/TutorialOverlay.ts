import { BuildingType, PlacedBuilding } from '../config/buildingConfig';
import { gameEvents } from '../state/gameEvents';

/**
 * Phase 64: first-run tutorial.
 *
 * The game ships 28 building types, 14 resources and ~15 hotkeys with no
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
 *  - Fence/enclosure is deliberately NOT taught here. Buying an animal needs
 *    a closed pen, which is a genuinely fiddly multi-tile build; the animal
 *    step explains the requirement and links it to the Help panel rather than
 *    trying to choreograph a whole fence loop in a 6-step tutorial.
 */

const TUTORIAL_SEEN_KEY = 'western-village-tutorial-seen';

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
    title: 'Step 4 - Stock it with animals',
    body: 'A farm makes nothing until it has animals. Select the farm and press <b>Buy</b> in its info panel. Animals need a closed <b>Fence</b> pen around them, so build a fence loop first if the button says so.',
    isComplete: (event) => event.kind === 'animal-bought',
  },
  {
    title: "You're running",
    body: 'Production ticks every couple of seconds. Watch the storage cap in the top-left - a <b>Granary</b> raises it cheaply. Press <b>H</b> any time for hotkeys and the full resource chain reference.',
    manualAdvance: true,
  },
];

export class TutorialOverlay {
  private panel: HTMLDivElement;
  private stepIndex = 0;
  private active = false;

  constructor(container: HTMLElement) {
    this.panel = document.createElement('div');
    this.panel.id = 'tutorial-panel';
    this.panel.hidden = true;
    container.appendChild(this.panel);

    gameEvents.on('building-placed', (building: PlacedBuilding) =>
      this.handleProgress({ kind: 'building-placed', type: building.type }),
    );
    gameEvents.on('animal-bought', () => this.handleProgress({ kind: 'animal-bought' }));

    // Replay on demand from the Help panel, regardless of the seen-flag.
    gameEvents.on('start-tutorial', () => this.start());

    // A fresh run auto-starts the tutorial only for a player who has never
    // finished or skipped it before.
    gameEvents.on('game-reset', () => {
      if (!hasSeenTutorial()) {
        this.start();
      }
    });
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

export function markTutorialSeen(): void {
  try {
    localStorage.setItem(TUTORIAL_SEEN_KEY, '1');
  } catch {
    // Private-mode/full storage: the tutorial will simply offer itself again
    // next run, which is a far better failure than crashing the run start.
  }
}
