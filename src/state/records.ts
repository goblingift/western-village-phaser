import { Difficulty, RunMode } from '../config/constants';
import { GameOverReason } from './gameState';

/**
 * Phase 64: Run Summary & Persistent Records.
 *
 * Until now a finished run showed its net worth once on the game-over screen
 * and then vanished, so there was no reason to replay for a better result.
 * This module is a small, standalone localStorage-backed store of personal
 * bests, deliberately kept separate from persistence.ts: that file
 * round-trips an *in-progress* run (a resumable savegame), while this one
 * keeps a permanent, tiny scoreboard that must survive every save being
 * deleted. It never imports gameState's mutable run state - callers hand it a
 * finished result - which keeps it free of the import cycles the other
 * standalone state modules (vegetation/market/notifications) also avoid.
 *
 * Records are keyed per (difficulty, run mode) pair because those settings
 * change the run so much that a single global best would be meaningless: an
 * Endless run on Easy has no business competing with a Fixed run on Hard.
 */

/** Bumped only if the stored shape changes incompatibly; a mismatch is discarded rather than migrated (a lost scoreboard is a cosmetic loss, unlike a lost savegame). */
const RECORDS_VERSION = 1;

/** Matches persistence.ts's `western-village-save-` prefix convention. */
const RECORDS_STORAGE_KEY = 'western-village-records';

export interface RunRecord {
  /** Best net worth ($) achieved on this difficulty+mode. */
  bestNetWorth: number;
  /** Longest survival time (in-game seconds) on this difficulty+mode. */
  longestSurvivalSeconds: number;
  /** Highest day number reached on this difficulty+mode. */
  mostDaysSurvived: number;
  /** How many runs have been completed on this difficulty+mode. */
  runsCompleted: number;
}

/** Key shape: `${difficulty}:${mode}`. Kept as a flat string map so the whole store is one small JSON blob. */
export type RunRecordKey = string;

interface RecordsSaveState {
  version: number;
  records: Record<RunRecordKey, RunRecord>;
}

/** Which fields a just-finished run beat. All false means the run set no new record. */
export interface RecordComparison {
  netWorth: boolean;
  survivalSeconds: boolean;
  daysSurvived: boolean;
  /** True when this difficulty+mode had no prior record at all - the first run always "sets" every record, which reads better as "first run" than as three separate NEW BESTs. */
  isFirstRun: boolean;
}

export interface FinishedRun {
  difficulty: Difficulty;
  mode: RunMode;
  netWorth: number;
  elapsedSeconds: number;
  daysSurvived: number;
  reason: GameOverReason;
}

export function recordKey(difficulty: Difficulty, mode: RunMode): RunRecordKey {
  return `${difficulty}:${mode}`;
}

function emptyRecord(): RunRecord {
  return { bestNetWorth: 0, longestSurvivalSeconds: 0, mostDaysSurvived: 0, runsCompleted: 0 };
}

/**
 * Reads the whole store, tolerating every failure mode a browser can throw at
 * it (localStorage disabled/full in private mode, a corrupt or foreign value
 * under our key, a future version). Any of those degrade to "no records yet"
 * rather than crashing the game-over screen, matching persistence.ts's own
 * "a corrupt localStorage value must never crash the scene" rule.
 */
function readStore(): Record<RunRecordKey, RunRecord> {
  try {
    const raw = localStorage.getItem(RECORDS_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as RecordsSaveState;
    if (!parsed || parsed.version !== RECORDS_VERSION || typeof parsed.records !== 'object') {
      return {};
    }
    return parsed.records ?? {};
  } catch {
    return {};
  }
}

function writeStore(records: Record<RunRecordKey, RunRecord>): void {
  try {
    const payload: RecordsSaveState = { version: RECORDS_VERSION, records };
    localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage unavailable or full - records are a nice-to-have, so failing to
    // persist one must never interrupt the run's game-over flow.
  }
}

/** The stored best for one difficulty+mode, or null when nothing has been recorded there yet. */
export function getRecord(difficulty: Difficulty, mode: RunMode): RunRecord | null {
  const store = readStore();
  return store[recordKey(difficulty, mode)] ?? null;
}

/** Every stored record, for DifficultySelectOverlay's pre-run summary list. */
export function getAllRecords(): Record<RunRecordKey, RunRecord> {
  return readStore();
}

/**
 * Folds a finished run into the store and reports which bests it beat.
 *
 * Each metric is compared and kept independently (strictly greater than, so
 * merely tying an existing best is not announced as a new one): a run can set
 * a new net-worth best while falling short of the longest survival, which is
 * exactly what happens when a player rushes economy and then loses the town.
 */
export function submitRunResult(run: FinishedRun): RecordComparison {
  const store = readStore();
  const key = recordKey(run.difficulty, run.mode);
  const existing = store[key];
  const previous = existing ?? emptyRecord();

  const comparison: RecordComparison = {
    netWorth: run.netWorth > previous.bestNetWorth,
    survivalSeconds: run.elapsedSeconds > previous.longestSurvivalSeconds,
    daysSurvived: run.daysSurvived > previous.mostDaysSurvived,
    isFirstRun: existing === undefined,
  };

  store[key] = {
    bestNetWorth: Math.max(previous.bestNetWorth, run.netWorth),
    longestSurvivalSeconds: Math.max(previous.longestSurvivalSeconds, run.elapsedSeconds),
    mostDaysSurvived: Math.max(previous.mostDaysSurvived, run.daysSurvived),
    runsCompleted: previous.runsCompleted + 1,
  };
  writeStore(store);

  return comparison;
}

/** Renders an in-game second count as "12:30" - shared by the game-over screen and the pre-run records list so the two never drift in format. */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Test/debug hook, and the natural home for any future "clear my records" UI. */
export function clearRecords(): void {
  try {
    localStorage.removeItem(RECORDS_STORAGE_KEY);
  } catch {
    // Same rationale as writeStore's swallow.
  }
}
