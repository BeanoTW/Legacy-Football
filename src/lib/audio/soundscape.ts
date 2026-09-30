import {
  crowdBed,
  crowdReaction,
  kick,
  scheduleThemeBar,
  themeBarSeconds,
  THEME_BARS,
  whistle,
  type CrowdBed,
  type CrowdReaction,
  type WhistlePattern,
} from "./synth";

export interface SoundSettings {
  effects: boolean;
  crowd: boolean;
  music: boolean;
  volume: number;
}

const STORAGE_KEY = "legacy-football.sound.v1";
const CHANGE_EVENT = "legacy-football:sound";
export const DEFAULT_SOUND: SoundSettings = { effects: true, crowd: true, music: false, volume: 0.7 };

let settings: SoundSettings = DEFAULT_SOUND;
let loaded = false;

function load(): SoundSettings {
  if (loaded || typeof window === "undefined") return settings;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SoundSettings>;
      settings = {
        effects: parsed.effects ?? DEFAULT_SOUND.effects,
        crowd: parsed.crowd ?? DEFAULT_SOUND.crowd,
        music: parsed.music ?? DEFAULT_SOUND.music,
        volume: typeof parsed.volume === "number"
          ? Math.max(0, Math.min(1, parsed.volume))
          : DEFAULT_SOUND.volume,
      };
    }
  } catch {
    settings = DEFAULT_SOUND;
  }
  return settings;
}

export function soundSettings(): SoundSettings {
  return load();
}

export function updateSoundSettings(patch: Partial<SoundSettings>): void {
  settings = { ...load(), ...patch };
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private browsing may make localStorage unavailable; keep session settings.
  }
  applySettings();
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

export function onSoundSettingsChange(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}

interface Graph {
  ctx: AudioContext;
  master: GainNode;
  music: GainNode;
  crowd: GainNode;
  effects: GainNode;
}

let graph: Graph | null = null;
let inMatch = false;
let bed: CrowdBed | null = null;
let themeTimer: number | null = null;
let themeBar = 0;
let themeNextAt = 0;

function ensureGraph(): Graph | null {
  if (graph) return graph;
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;

  const ctx = new AC();
  const master = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.ratio.value = 6;
  master.connect(limiter).connect(ctx.destination);

  const bus = () => {
    const gain = ctx.createGain();
    gain.connect(master);
    return gain;
  };

  graph = { ctx, master, music: bus(), crowd: bus(), effects: bus() };
  applySettings();
  return graph;
}

function applySettings(): void {
  if (!graph) return;
  const s = load();
  const now = graph.ctx.currentTime;
  graph.master.gain.setTargetAtTime(s.volume, now, 0.05);
  graph.effects.gain.setTargetAtTime(s.effects ? 0.9 : 0, now, 0.05);
  graph.crowd.gain.setTargetAtTime(s.crowd ? 0.8 : 0, now, 0.3);
  graph.music.gain.setTargetAtTime(s.music && !inMatch ? 0.5 : 0, now, 0.6);
  if (s.music && !inMatch) startTheme();
  if (!s.music) stopThemeSoon();
}

export function unlockAudio(): void {
  const g = ensureGraph();
  if (!g) return;
  if (g.ctx.state === "suspended") void g.ctx.resume();
  applySettings();
}

let unlockInstalled = false;
export function installAudioUnlock(): void {
  if (unlockInstalled || typeof window === "undefined") return;
  unlockInstalled = true;
  const handler = () => {
    unlockAudio();
    window.removeEventListener("pointerdown", handler);
    window.removeEventListener("keydown", handler);
  };
  window.addEventListener("pointerdown", handler);
  window.addEventListener("keydown", handler);
}

function startTheme(): void {
  const g = graph;
  if (!g || themeTimer !== null) return;
  themeNextAt = Math.max(themeNextAt, g.ctx.currentTime + 0.1);
  const tick = () => {
    while (themeNextAt < g.ctx.currentTime + 1) {
      scheduleThemeBar(g.ctx, g.music, themeNextAt, themeBar);
      themeBar = (themeBar + 1) % THEME_BARS;
      themeNextAt += themeBarSeconds();
    }
  };
  tick();
  themeTimer = window.setInterval(tick, 250);
}

function stopThemeSoon(): void {
  if (themeTimer === null) return;
  window.clearInterval(themeTimer);
  themeTimer = null;
  themeBar = 0;
  themeNextAt = 0;
}

export function enterMatch(): void {
  inMatch = true;
  const g = ensureGraph();
  if (!g) return;
  applySettings();
  stopThemeSoon();
  if (!bed) {
    bed = crowdBed(g.ctx, g.crowd, g.ctx.currentTime);
    bed.setIntensity(0.25);
  }
}

export function exitMatch(): void {
  inMatch = false;
  if (bed) {
    bed.stop();
    bed = null;
  }
  applySettings();
}

export function setCrowdIntensity(value: number): void {
  bed?.setIntensity(value);
}

export function playWhistle(pattern: WhistlePattern): void {
  const g = graph;
  if (!g || !load().effects) return;
  whistle(g.ctx, g.effects, g.ctx.currentTime + 0.02, pattern);
}

export function playReaction(kind: CrowdReaction): void {
  const g = graph;
  if (!g || !load().crowd) return;
  crowdReaction(g.ctx, g.crowd, g.ctx.currentTime + 0.02, kind);
}

export function playKick(strength = 1): void {
  const g = graph;
  if (!g || !load().effects) return;
  kick(g.ctx, g.effects, g.ctx.currentTime + 0.01, strength);
}

export function previewSounds(): void {
  unlockAudio();
  const g = graph;
  if (!g) return;
  const t = g.ctx.currentTime + 0.05;
  const t2 = whistle(g.ctx, g.effects, t, "kickoff");
  crowdReaction(g.ctx, g.crowd, t2 + 0.3, "goal");
}
