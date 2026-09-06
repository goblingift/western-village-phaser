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
 */

const MASTER_VOLUME_DEFAULT = 0.6;
/** Hard ceiling on simultaneously-playing voices; new requests past it are dropped, not queued. */
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
  | 'animalCow';

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
let gameSpeed = 1;
let activeVoices = 0;
let unlockInstalled = false;
const lastPlayedAt = new Map<SoundName, number>();

/** Camera worldView, pushed in by MainScene each frame; null until the scene runs. */
let listenerRect: { x: number; y: number; width: number; height: number } | null = null;

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
  return audioContext;
}

function effectiveMasterGain(): number {
  return muted || gameSpeed === 0 ? 0 : volume;
}

function applyMasterGain(): void {
  if (!masterGain || !audioContext) {
    return;
  }
  // Short ramp instead of a step so muting mid-voice doesn't click.
  masterGain.gain.setTargetAtTime(effectiveMasterGain(), audioContext.currentTime, 0.02);
}

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
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume();
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
  gameEvents.emit('audio-settings-changed', { muted, volume });
}

export function isAudioMuted(): boolean {
  return muted;
}

export function setAudioVolume(next: number): void {
  volume = Math.max(0, Math.min(1, next));
  applyMasterGain();
  gameEvents.emit('audio-settings-changed', { muted, volume });
}

export function getAudioVolume(): number {
  return volume;
}

/** 0 (paused) mutes outright; other speeds only affect gain via this same check. */
export function setAudioGameSpeed(speed: number): void {
  gameSpeed = speed;
  applyMasterGain();
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
};
