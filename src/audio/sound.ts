import { DAY_NIGHT_TRANSITION_MS } from '../config/constants';
import { DayPhase, DayPhaseChange, getDayPhase } from '../state/gameState';
import { gameEvents } from '../state/gameEvents';

/**
 * Phase 34: audio engine.
 *
 * What was here before (Phases 1-33) was 27 lines: a bare lazily-created
 * AudioContext and one square-wave blip fired straight at ctx.destination on
 * building placement. That was fine for exactly one sound triggered by a user
 * gesture, and wrong for everything this phase adds - combat volleys (up to
 * 10-15 shots resolved in a single tick), per-animal ambience, and footsteps -
 * all of which are triggered by timers rather than clicks, can stack
 * arbitrarily, and have a world position that may not even be on screen.
 *
 * So the engine owns five things the old file had none of:
 *
 *  - A master GainNode every voice routes through, so mute/volume is one node
 *    rather than N call sites remembering to scale their own gain.
 *  - Explicit unlocking. A context created outside a user gesture starts
 *    'suspended'; the pre-Phase-34 code got away with it because its only
 *    sound WAS a click. Timer-driven sounds would have silently played into a
 *    suspended context forever, so first pointerdown/keydown resumes it (and
 *    visibilitychange re-resumes after a tab switch, which suspends it again).
 *  - A hard concurrent-voice budget. Web Audio will happily start hundreds of
 *    oscillators; a raid volley plus animals plus footsteps is exactly the
 *    situation that turns into clipped mush.
 *  - Viewport culling + stereo panning. A world sound whose source is off
 *    screen is dropped entirely (it's also the cheapest possible culling:
 *    no nodes are created at all), and one that is on screen is panned by how
 *    far left/right of centre it sits.
 *  - Game-speed awareness. At 0x (paused) everything is muted. At 2x/4x the
 *    engine deliberately does NOT scale trigger rates - the callers are
 *    already firing more often because the timers they hang off are running
 *    faster, and multiplying that again is what makes fast-forward unbearable.
 *
 * Phase 59: ambient soundtrack & soundscape.
 *
 * Everything above is a *transient* voice: one-shot, budget-limited, and
 * triggered by a discrete event (a click, a shot, a footstep). Music and
 * ambience are the opposite - always-on, self-scheduling background layers -
 * so they get their own bus (`musicGain`, a second GainNode feeding
 * `ctx.destination` alongside `masterGain`, mixed at a lower default volume
 * than SFX) and deliberately bypass `play()`/`MAX_CONCURRENT_VOICES`/
 * `activeVoices` entirely: that budget exists so a raid volley can't clip
 * into mush, not to throttle a background loop that should never be dropped
 * just because a firefight is using up SFX voice slots. Under `musicGain` sit
 * four crossfade sub-buses (`musicMelodyBus`/`musicAmbientBus`, each with a
 * `day`/`night` GainNode) - both variants of the melody and both variants of
 * the wind/cricket texture are always scheduling notes, just silent at
 * gain 0, so a day/night boundary is a gain ramp on already-running loops
 * (mirroring `NightOverlay.ts`'s alpha-tween crossfade, over the same
 * `DAY_NIGHT_TRANSITION_MS`) rather than a stop/restart that could glitch.
 * Music only starts once `installAudioUnlock`'s first resume() actually
 * succeeds - same gate as SFX, so there is no attempted autoplay before a
 * user gesture. A raid's opening stinger reuses the ordinary SFX voice path
 * (it IS a discrete one-shot) but additionally ducks `musicGain` for its
 * duration via `duckMusicForStinger`, then restores it, so the sting reads
 * clearly over the ambient loop instead of fighting it.
 */

const MASTER_VOLUME_DEFAULT = 0.6;
/** Music/ambience sit under SFX in the mix - a loop should never compete with a gunshot for attention. */
const MUSIC_VOLUME_DEFAULT = 0.32;
/** Hard ceiling on simultaneously-playing SFX voices; new requests past it are dropped, not queued. Music/ambience notes never touch this counter - see the Phase 59 doc comment above. */
const MAX_CONCURRENT_VOICES = 12;
/** Beyond this many pixels left/right of the viewport centre, a sound is panned fully to that side. */
const PAN_FULL_AT_PX = 480;

export type SoundName =
  | 'placement'
  | 'clear'
  | 'gunshot'
  | 'volley'
  | 'raiderHit'
  | 'unitDeath'
  | 'buildingCollapse'
  | 'moveConfirm'
  | 'footstep'
  | 'animalChicken'
  | 'animalPig'
  | 'animalCow'
  | 'raidStinger';

interface SoundDefinition {
  /** Base gain before master volume; kept per-sound so a gunshot doesn't drown a footstep. */
  gain: number;
  /** Minimum ms between two plays of this sound, globally. 0 = unthrottled. */
  minGapMs: number;
  render: (ctx: AudioContext, destination: AudioNode, gain: number) => void;
}

let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
let muted = false;
let volume = MASTER_VOLUME_DEFAULT;
let musicVolume = MUSIC_VOLUME_DEFAULT;
let gameSpeed = 1;
let activeVoices = 0;
let unlockInstalled = false;
const lastPlayedAt = new Map<SoundName, number>();

/** Camera worldView, pushed in by MainScene each frame; null until the scene runs. */
let listenerRect: { x: number; y: number; width: number; height: number } | null = null;

/** Phase 59: one GainNode per crossfaded pair, e.g. the day melody loop and the night melody loop sharing one bus. */
interface CrossfadeBus {
  day: GainNode;
  night: GainNode;
}

/** Phase 59: music/ambience state. All null until the graph is lazily built in ensureMusicGraph. */
let musicGain: GainNode | null = null;
let musicMelodyBus: CrossfadeBus | null = null;
let musicAmbientBus: CrossfadeBus | null = null;
let musicStarted = false;
const melodyTimers: Record<DayPhase, ReturnType<typeof setTimeout> | null> = { day: null, night: null };
const ambientTimers: Record<DayPhase, ReturnType<typeof setTimeout> | null> = { day: null, night: null };

function getAudioContext(): AudioContext | null {
  if (audioContext) {
    return audioContext;
  }
  try {
    audioContext = new AudioContext();
  } catch {
    // No Web Audio (or blocked): the whole engine no-ops rather than throwing
    // into every caller's hot path.
    return null;
  }
  masterGain = audioContext.createGain();
  masterGain.gain.value = effectiveMasterGain();
  masterGain.connect(audioContext.destination);
  ensureMusicGraph(audioContext);
  return audioContext;
}

function effectiveMasterGain(): number {
  return muted || gameSpeed === 0 ? 0 : volume;
}

function effectiveMusicGain(): number {
  return muted || gameSpeed === 0 ? 0 : musicVolume;
}

function applyMasterGain(): void {
  if (!masterGain || !audioContext) {
    return;
  }
  // Short ramp instead of a step so muting mid-voice doesn't click.
  masterGain.gain.setTargetAtTime(effectiveMasterGain(), audioContext.currentTime, 0.02);
}

function applyMusicGain(): void {
  if (!musicGain || !audioContext) {
    return;
  }
  musicGain.gain.setTargetAtTime(effectiveMusicGain(), audioContext.currentTime, 0.02);
}

/**
 * Phase 59: builds the always-on music/ambience graph once, the first time an
 * AudioContext exists. Both day and night sub-buses of both loops are created
 * up front (rather than created/torn down per phase) so a day/night boundary
 * is a gain ramp on already-running nodes, not a start/stop that could pop.
 * Seeded from gameState's current phase (not a hardcoded 'day') so resuming
 * mid-run doesn't start the graph silently crossfaded to the wrong variant.
 */
function ensureMusicGraph(ctx: AudioContext): void {
  if (musicGain) {
    return;
  }
  musicGain = ctx.createGain();
  musicGain.gain.value = effectiveMusicGain();
  musicGain.connect(ctx.destination);

  const phase = getDayPhase();
  musicMelodyBus = { day: ctx.createGain(), night: ctx.createGain() };
  musicAmbientBus = { day: ctx.createGain(), night: ctx.createGain() };
  for (const bus of [musicMelodyBus, musicAmbientBus]) {
    bus.day.gain.value = phase === 'day' ? 1 : 0;
    bus.night.gain.value = phase === 'night' ? 1 : 0;
    bus.day.connect(musicGain);
    bus.night.connect(musicGain);
  }
}

/** Ramps both GainNodes of a crossfade bus toward the given phase; `immediate` snaps (used on game-reset, matching NightOverlay's own reset handling). */
function crossfadeBusToPhase(bus: CrossfadeBus, phase: DayPhase, ctx: AudioContext, immediate: boolean): void {
  rampGain(bus.day, phase === 'day' ? 1 : 0, ctx, immediate);
  rampGain(bus.night, phase === 'night' ? 1 : 0, ctx, immediate);
}

function rampGain(node: GainNode, target: number, ctx: AudioContext, immediate: boolean): void {
  const now = ctx.currentTime;
  node.gain.cancelScheduledValues(now);
  node.gain.setValueAtTime(node.gain.value, now);
  if (immediate) {
    node.gain.setValueAtTime(target, now);
  } else {
    node.gain.linearRampToValueAtTime(target, now + DAY_NIGHT_TRANSITION_MS / 1000);
  }
}

// Phase 59: these two listeners live at module scope (registered exactly once
// per page load, same as every other module-level `const` here) rather than
// inside a function some caller has to remember to invoke - the crossfade
// must react to every phase change for the life of the page, not just while
// some scene happens to be listening.
gameEvents.on('day-phase-changed', ({ phase }: DayPhaseChange) => {
  if (!audioContext || !musicMelodyBus || !musicAmbientBus) {
    return;
  }
  crossfadeBusToPhase(musicMelodyBus, phase, audioContext, false);
  crossfadeBusToPhase(musicAmbientBus, phase, audioContext, false);
});
gameEvents.on('game-reset', () => {
  // Mirrors NightOverlay: resetGame emits 'day-phase-changed' (day 1, day)
  // right before 'game-reset', which would otherwise crossfade out of last
  // run's midnight over 20s. A new run starts in daylight immediately.
  if (!audioContext || !musicMelodyBus || !musicAmbientBus) {
    return;
  }
  crossfadeBusToPhase(musicMelodyBus, 'day', audioContext, true);
  crossfadeBusToPhase(musicAmbientBus, 'day', audioContext, true);
});

/**
 * Installed once, on the first call from anywhere. Browsers start an
 * AudioContext created outside a gesture in 'suspended' state, and a
 * background tab suspends it again - both are silent failures rather than
 * errors, which is exactly the kind of bug that eats an afternoon.
 */
export function installAudioUnlock(): void {
  if (unlockInstalled) {
    return;
  }
  unlockInstalled = true;

  const resume = () => {
    const ctx = getAudioContext();
    if (!ctx) {
      return;
    }
    if (ctx.state === 'suspended') {
      void ctx.resume().then(() => startMusicIfNeeded(ctx));
    } else {
      startMusicIfNeeded(ctx);
    }
  };

  window.addEventListener('pointerdown', resume);
  window.addEventListener('keydown', resume);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      resume();
    }
  });
}

export function setAudioMuted(next: boolean): void {
  muted = next;
  applyMasterGain();
  applyMusicGain();
  gameEvents.emit('audio-settings-changed', { muted, volume, musicVolume });
}

export function isAudioMuted(): boolean {
  return muted;
}

export function setAudioVolume(next: number): void {
  volume = Math.max(0, Math.min(1, next));
  applyMasterGain();
  gameEvents.emit('audio-settings-changed', { muted, volume, musicVolume });
}

export function getAudioVolume(): number {
  return volume;
}

/** Phase 59: independent from SFX volume - the building bar's second slider drives this. */
export function setMusicVolume(next: number): void {
  musicVolume = Math.max(0, Math.min(1, next));
  applyMusicGain();
  gameEvents.emit('audio-settings-changed', { muted, volume, musicVolume });
}

export function getMusicVolume(): number {
  return musicVolume;
}

/** 0 (paused) mutes outright; other speeds only affect gain via this same check. */
export function setAudioGameSpeed(speed: number): void {
  gameSpeed = speed;
  applyMasterGain();
  applyMusicGain();
}

export function setAudioListenerRect(rect: { x: number; y: number; width: number; height: number }): void {
  listenerRect = rect;
}

function isInViewport(x: number, y: number): boolean {
  if (!listenerRect) {
    return true;
  }
  return (
    x >= listenerRect.x &&
    x <= listenerRect.x + listenerRect.width &&
    y >= listenerRect.y &&
    y <= listenerRect.y + listenerRect.height
  );
}

function panFor(x: number): number {
  if (!listenerRect) {
    return 0;
  }
  const centerX = listenerRect.x + listenerRect.width / 2;
  return Math.max(-1, Math.min(1, (x - centerX) / PAN_FULL_AT_PX));
}

/**
 * Every voice ends up here. The oscillator/noise nodes are created by the
 * sound's own `render`, but the budget counter, the throttle and the pan node
 * are shared - a sound definition can't forget to respect them.
 */
function play(name: SoundName, pan = 0): void {
  installAudioUnlock();

  const definition = SOUND_DEFINITIONS[name];
  if (!definition || effectiveMasterGain() === 0) {
    return;
  }

  const ctx = getAudioContext();
  if (!ctx || !masterGain) {
    return;
  }
  if (ctx.state === 'suspended') {
    // Not yet unlocked: dropping is correct, queueing would dump a backlog of
    // stale sounds the instant the player first clicks.
    return;
  }

  const now = ctx.currentTime * 1000;
  const last = lastPlayedAt.get(name);
  if (definition.minGapMs > 0 && last !== undefined && now - last < definition.minGapMs) {
    return;
  }
  if (activeVoices >= MAX_CONCURRENT_VOICES) {
    return;
  }

  lastPlayedAt.set(name, now);
  activeVoices += 1;

  let destination: AudioNode = masterGain;
  if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(masterGain);
    destination = panner;
  }

  definition.render(ctx, destination, definition.gain);
}

/** Called by each definition's last-ending node so the budget is released exactly once. */
function releaseVoiceOn(node: AudioScheduledSourceNode): void {
  node.onended = () => {
    activeVoices = Math.max(0, activeVoices - 1);
  };
}

/** Screen-space-agnostic UI sound (placement, move confirm, ...). */
export function playUiSound(name: SoundName): void {
  play(name, 0);
}

/**
 * World sound: dropped outright when its source is off camera, otherwise
 * panned by its horizontal offset from the viewport centre.
 */
export function playWorldSound(name: SoundName, x: number, y: number): void {
  if (!isInViewport(x, y)) {
    return;
  }
  play(name, panFor(x));
}

/** Kept for API compatibility with every pre-Phase-34 call site. */
export function playPlacementSound(): void {
  playUiSound('placement');
}

/**
 * Phase 59: fired once when a raid wave starts (MainScene.startRaid). Routed
 * through the ordinary SFX voice path - it IS a discrete one-shot, budget and
 * throttle included - but additionally ducks the separate music bus for the
 * sting's duration so it reads clearly over the ambient loop.
 */
export function playRaidStinger(): void {
  playUiSound('raidStinger');
}

function createNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/**
 * A gunshot is a filtered noise burst, not a tone: a short bright crack that
 * decays instantly. Reused (with a longer tail and lower filter) for the
 * volley and the building collapse, which are the same physical idea at
 * different scales.
 */
function renderNoiseBurst(
  ctx: AudioContext,
  destination: AudioNode,
  gain: number,
  options: { duration: number; filterHz: number; filterEndHz?: number; type?: BiquadFilterType },
): void {
  const source = ctx.createBufferSource();
  source.buffer = createNoiseBuffer(ctx, options.duration);

  const filter = ctx.createBiquadFilter();
  filter.type = options.type ?? 'bandpass';
  filter.frequency.setValueAtTime(options.filterHz, ctx.currentTime);
  if (options.filterEndHz) {
    filter.frequency.exponentialRampToValueAtTime(options.filterEndHz, ctx.currentTime + options.duration);
  }

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(gain, ctx.currentTime);
  envelope.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + options.duration);

  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(destination);

  releaseVoiceOn(source);
  source.start();
  source.stop(ctx.currentTime + options.duration);
}

function renderTone(
  ctx: AudioContext,
  destination: AudioNode,
  gain: number,
  options: { type: OscillatorType; from: number; to: number; duration: number },
): void {
  const oscillator = ctx.createOscillator();
  oscillator.type = options.type;
  oscillator.frequency.setValueAtTime(options.from, ctx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(1, options.to),
    ctx.currentTime + options.duration,
  );

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(gain, ctx.currentTime);
  envelope.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + options.duration);

  oscillator.connect(envelope);
  envelope.connect(destination);

  releaseVoiceOn(oscillator);
  oscillator.start();
  oscillator.stop(ctx.currentTime + options.duration);
}

/** Duration of the raid-stinger chord itself, shared by its render and its music-duck window. */
const RAID_STINGER_DURATION_S = 1.1;
/** How far musicGain dips during a stinger, as a fraction of its current target level. */
const MUSIC_DUCK_LEVEL_FACTOR = 0.25;
/** Extra tail after the stinger ends before the music bus is back at full level - an instant snap-back reads as choppy. */
const MUSIC_DUCK_RELEASE_S = 0.6;

/** Phase 59: briefly pulls the whole music bus down and back up around a stinger, independent of the day/night crossfade weights (which are left untouched). */
function duckMusicForStinger(ctx: AudioContext): void {
  if (!musicGain) {
    return;
  }
  const now = ctx.currentTime;
  const target = effectiveMusicGain();
  musicGain.gain.cancelScheduledValues(now);
  musicGain.gain.setValueAtTime(musicGain.gain.value, now);
  musicGain.gain.linearRampToValueAtTime(target * MUSIC_DUCK_LEVEL_FACTOR, now + 0.1);
  musicGain.gain.linearRampToValueAtTime(target, now + RAID_STINGER_DURATION_S + MUSIC_DUCK_RELEASE_S);
}

/**
 * A tense, dissonant dyad (a minor second apart) both sliding upward reads as
 * "trouble incoming" without needing a sampled sting - the same
 * envelope-plus-oscillator recipe as renderTone, just two detuned voices.
 */
function renderRaidStingerChord(ctx: AudioContext, destination: AudioNode, gain: number): void {
  const duration = RAID_STINGER_DURATION_S;
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.0001, ctx.currentTime);
  envelope.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + 0.06);
  envelope.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  envelope.connect(destination);

  const frequencies = [196, 207.65];
  frequencies.forEach((freq, index) => {
    const oscillator = ctx.createOscillator();
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(freq, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(freq * 1.4, ctx.currentTime + duration);
    oscillator.connect(envelope);
    oscillator.start();
    oscillator.stop(ctx.currentTime + duration);
    if (index === frequencies.length - 1) {
      // One release call per play() invocation, exactly like every other
      // multi-node SoundDefinition in this file - the budget slot is per
      // *call*, not per oscillator.
      releaseVoiceOn(oscillator);
    }
  });
}

const SOUND_DEFINITIONS: Record<SoundName, SoundDefinition> = {
  // The original Phase 7 placement blip, unchanged in character - now just
  // routed through the master bus like everything else.
  placement: {
    gain: 0.15,
    minGapMs: 0,
    render: (ctx, destination, gain) =>
      renderTone(ctx, destination, gain, { type: 'square', from: 440, to: 220, duration: 0.12 }),
  },
  clear: {
    gain: 0.18,
    minGapMs: 60,
    render: (ctx, destination, gain) =>
      renderNoiseBurst(ctx, destination, gain, { duration: 0.25, filterHz: 900, filterEndHz: 200 }),
  },
  gunshot: {
    gain: 0.22,
    // Individual shots are already staggered by the caller; this is a floor so
    // a huge volley can't machine-gun.
    minGapMs: 25,
    render: (ctx, destination, gain) =>
      renderNoiseBurst(ctx, destination, gain, { duration: 0.09, filterHz: 1800, filterEndHz: 400 }),
  },
  // One louder, longer crack standing in for a whole line of cowboys firing at
  // once - see MainScene.playCombatVolley for why N individual voices is the
  // wrong answer above a handful of shooters.
  volley: {
    gain: 0.3,
    minGapMs: 200,
    render: (ctx, destination, gain) =>
      renderNoiseBurst(ctx, destination, gain, { duration: 0.22, filterHz: 1400, filterEndHz: 250 }),
  },
  raiderHit: {
    gain: 0.14,
    minGapMs: 40,
    render: (ctx, destination, gain) =>
      renderTone(ctx, destination, gain, { type: 'triangle', from: 320, to: 140, duration: 0.1 }),
  },
  unitDeath: {
    gain: 0.2,
    minGapMs: 80,
    render: (ctx, destination, gain) =>
      renderTone(ctx, destination, gain, { type: 'sawtooth', from: 260, to: 60, duration: 0.35 }),
  },
  buildingCollapse: {
    gain: 0.3,
    minGapMs: 120,
    render: (ctx, destination, gain) =>
      renderNoiseBurst(ctx, destination, gain, {
        duration: 0.7,
        filterHz: 600,
        filterEndHz: 90,
        type: 'lowpass',
      }),
  },
  // Spur-jingle-ish: a bright, very short chirp pair reads as "order received"
  // without needing a sample.
  moveConfirm: {
    gain: 0.16,
    minGapMs: 90,
    render: (ctx, destination, gain) =>
      renderTone(ctx, destination, gain, { type: 'triangle', from: 900, to: 1500, duration: 0.09 }),
  },
  footstep: {
    gain: 0.07,
    minGapMs: 110,
    render: (ctx, destination, gain) =>
      renderNoiseBurst(ctx, destination, gain, { duration: 0.06, filterHz: 320, filterEndHz: 140 }),
  },
  animalChicken: {
    gain: 0.12,
    minGapMs: 900,
    render: (ctx, destination, gain) =>
      renderTone(ctx, destination, gain, { type: 'square', from: 1200, to: 700, duration: 0.12 }),
  },
  animalPig: {
    gain: 0.14,
    minGapMs: 900,
    render: (ctx, destination, gain) =>
      renderTone(ctx, destination, gain, { type: 'sawtooth', from: 260, to: 170, duration: 0.18 }),
  },
  animalCow: {
    gain: 0.15,
    minGapMs: 900,
    render: (ctx, destination, gain) =>
      renderTone(ctx, destination, gain, { type: 'sawtooth', from: 180, to: 110, duration: 0.5 }),
  },
  // Phase 59: one per raid wave (throttled to at most one per 3s so an
  // escalated multi-camp raid can't stack chords), duck-then-chord as
  // described in the file-level Phase 59 doc comment.
  raidStinger: {
    gain: 0.24,
    minGapMs: 3000,
    render: (ctx, destination, gain) => {
      duckMusicForStinger(ctx);
      renderRaidStingerChord(ctx, destination, gain);
    },
  },
};

// ---------------------------------------------------------------------------
// Phase 59: procedural western ambient loop + wind/cricket soundscape.
//
// Both live entirely outside the SOUND_DEFINITIONS/play() machinery above:
// they are self-rescheduling (via plain setTimeout, deliberately NOT
// Phaser's this.time so this module stays scene-independent, matching the
// existing "listenerRect is pushed in, never read from a scene reference"
// convention), always running once started, and never touch activeVoices.
// ---------------------------------------------------------------------------

/** A minor pentatonic across roughly an octave and a third - reads as "western" without needing a full harmonic model. */
const PENTATONIC_SCALE_HZ = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33];

interface MelodyVariantConfig {
  beatMsRange: [number, number];
  /** Sparse on purpose - most beats rest, so this is closer to a wind chime than a tune. */
  noteProbability: number;
  scaleHz: number[];
  noteDuration: number;
  oscType: OscillatorType;
}

const MELODY_VARIANTS: Record<DayPhase, MelodyVariantConfig> = {
  // Day: brighter (upper octave) and slightly faster/denser.
  day: {
    beatMsRange: [650, 950],
    noteProbability: 0.55,
    scaleHz: PENTATONIC_SCALE_HZ.map((hz) => hz * 2),
    noteDuration: 0.9,
    oscType: 'triangle',
  },
  // Night: slower, sparser, dropped a register - ambient rather than melodic.
  night: {
    beatMsRange: [1100, 1650],
    noteProbability: 0.3,
    scaleHz: PENTATONIC_SCALE_HZ,
    noteDuration: 1.6,
    oscType: 'sine',
  },
};

/** Per-note peak gain before the crossfade bus / music bus scale it down further. */
const MUSIC_NOTE_GAIN = 0.09;

/**
 * A short attack + exponentially-decaying lowpass sweep reads as a plucked
 * string rather than a held organ tone - the same "envelope on an oscillator"
 * idea as renderTone, with an extra filter sweep for warmth.
 */
function renderPluckedNote(
  ctx: AudioContext,
  destination: AudioNode,
  gain: number,
  options: { frequency: number; duration: number; oscType: OscillatorType },
): void {
  const oscillator = ctx.createOscillator();
  oscillator.type = options.oscType;
  oscillator.frequency.setValueAtTime(options.frequency, ctx.currentTime);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(options.frequency * 4, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(options.frequency * 1.2, ctx.currentTime + options.duration);

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.0001, ctx.currentTime);
  envelope.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + options.duration);

  oscillator.connect(filter);
  filter.connect(envelope);
  envelope.connect(destination);

  oscillator.start();
  oscillator.stop(ctx.currentTime + options.duration);
  // Deliberately no releaseVoiceOn/activeVoices bookkeeping - see the
  // file-level Phase 59 doc comment: music is a separate always-on bus, not
  // a transient competing for the SFX budget.
}

function scheduleMelodyLoop(phase: DayPhase): void {
  const config = MELODY_VARIANTS[phase];
  const [minMs, maxMs] = config.beatMsRange;
  const delayMs = minMs + Math.random() * (maxMs - minMs);
  melodyTimers[phase] = setTimeout(() => {
    playMelodyBeat(phase, config);
    scheduleMelodyLoop(phase);
  }, delayMs);
}

function playMelodyBeat(phase: DayPhase, config: MelodyVariantConfig): void {
  const ctx = audioContext;
  const bus = musicMelodyBus?.[phase];
  // Suspended (not yet unlocked, or tab backgrounded) or missing graph: skip
  // this beat only, the chain keeps rescheduling so it resumes seamlessly.
  if (!ctx || !bus || ctx.state !== 'running') {
    return;
  }
  if (Math.random() > config.noteProbability) {
    return;
  }
  const frequency = config.scaleHz[Math.floor(Math.random() * config.scaleHz.length)];
  renderPluckedNote(ctx, bus, MUSIC_NOTE_GAIN, {
    frequency,
    duration: config.noteDuration,
    oscType: config.oscType,
  });
}

interface AmbientVariantConfig {
  intervalMsRange: [number, number];
  render: (ctx: AudioContext, destination: AudioNode) => void;
}

/** Peak gain of an ambience texture burst - quieter than a music note, this is background-of-background. */
const AMBIENT_NOTE_GAIN = 0.05;

/** A gentle bandpass-filtered noise swell - the "filtered noise burst" recipe already used for gunshots/collapses, just slow and quiet instead of sharp and loud. */
function renderWindGust(ctx: AudioContext, destination: AudioNode): void {
  const duration = 2 + Math.random() * 1.5;
  const source = ctx.createBufferSource();
  source.buffer = createNoiseBuffer(ctx, duration);

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(280 + Math.random() * 220, ctx.currentTime);
  filter.Q.value = 0.6;

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.0001, ctx.currentTime);
  envelope.gain.linearRampToValueAtTime(AMBIENT_NOTE_GAIN, ctx.currentTime + duration * 0.4);
  envelope.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(destination);

  source.start();
  source.stop(ctx.currentTime + duration);
}

/** A cricket chirp is a handful of short high-pitched pulses back-to-back, not one long tone. */
function renderCricketChirp(ctx: AudioContext, destination: AudioNode): void {
  const pulses = 2 + Math.floor(Math.random() * 3);
  const pulseDuration = 0.05;
  const gap = 0.07;

  for (let i = 0; i < pulses; i++) {
    const start = ctx.currentTime + i * (pulseDuration + gap);
    const oscillator = ctx.createOscillator();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(2600 + Math.random() * 400, start);

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.linearRampToValueAtTime(AMBIENT_NOTE_GAIN * 0.8, start + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + pulseDuration);

    oscillator.connect(envelope);
    envelope.connect(destination);
    oscillator.start(start);
    oscillator.stop(start + pulseDuration);
  }
}

const AMBIENT_VARIANTS: Record<DayPhase, AmbientVariantConfig> = {
  // Day: a light, infrequent wind texture.
  day: { intervalMsRange: [4000, 8000], render: renderWindGust },
  // Night: crickets, noticeably more frequent than the day's wind.
  night: { intervalMsRange: [1500, 4000], render: renderCricketChirp },
};

function scheduleAmbientLoop(phase: DayPhase): void {
  const config = AMBIENT_VARIANTS[phase];
  const [minMs, maxMs] = config.intervalMsRange;
  const delayMs = minMs + Math.random() * (maxMs - minMs);
  ambientTimers[phase] = setTimeout(() => {
    playAmbientBeat(phase, config);
    scheduleAmbientLoop(phase);
  }, delayMs);
}

function playAmbientBeat(phase: DayPhase, config: AmbientVariantConfig): void {
  const ctx = audioContext;
  const bus = musicAmbientBus?.[phase];
  if (!ctx || !bus || ctx.state !== 'running') {
    return;
  }
  config.render(ctx, bus);
}

/**
 * Starts all four self-rescheduling loops (day/night melody, day/night
 * ambience) exactly once, the first time the context is confirmed 'running'
 * rather than merely constructed - matching the SFX engine's own rule that
 * nothing plays before the user's first gesture actually unlocks audio.
 */
function startMusicIfNeeded(ctx: AudioContext): void {
  if (musicStarted) {
    return;
  }
  musicStarted = true;
  ensureMusicGraph(ctx);
  scheduleMelodyLoop('day');
  scheduleMelodyLoop('night');
  scheduleAmbientLoop('day');
  scheduleAmbientLoop('night');
}
