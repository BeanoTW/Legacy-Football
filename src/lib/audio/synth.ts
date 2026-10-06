type Ctx = BaseAudioContext;

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

let cachedNoise: AudioBuffer | null = null;
export function noiseBuffer(ctx: Ctx): AudioBuffer {
  if (cachedNoise && cachedNoise.sampleRate === ctx.sampleRate) return cachedNoise;
  const length = Math.max(1, Math.floor(ctx.sampleRate * 2));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let x = 0x12345678;
  for (let i = 0; i < data.length; i += 1) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    data[i] = ((x >>> 0) / 0xffffffff) * 2 - 1;
  }
  cachedNoise = buffer;
  return buffer;
}

function env(gain: GainNode, t: number, attack: number, peak: number, decay: number) {
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function filteredNoise(ctx: Ctx, dest: AudioNode, t: number, duration: number, frequency: number, q: number, volume: number) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = frequency;
  filter.Q.value = q;
  const gain = ctx.createGain();
  env(gain, t, 0.02, volume, Math.max(0.03, duration - 0.02));
  src.connect(filter).connect(gain).connect(dest);
  src.start(t);
  src.stop(t + duration + 0.05);
}

export type WhistlePattern = "short" | "kickoff" | "halftime" | "fulltime";

function whistleBlast(ctx: Ctx, dest: AudioNode, t: number, duration: number) {
  const gain = ctx.createGain();
  env(gain, t, 0.012, 0.32, Math.max(0.03, duration - 0.012));
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 1200;
  gain.connect(filter).connect(dest);

  for (const [freq, level] of [[2350, 1], [4700, 0.2], [7050, 0.08]] as const) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.linearRampToValueAtTime(freq * 1.025, t + duration * 0.45);
    osc.frequency.linearRampToValueAtTime(freq * 0.992, t + duration);
    g.gain.value = level;
    osc.connect(g).connect(gain);
    osc.start(t);
    osc.stop(t + duration + 0.03);
  }
  filteredNoise(ctx, gain, t, duration, 3300, 2.5, 0.05);
}

export function whistle(ctx: Ctx, dest: AudioNode, t0: number, pattern: WhistlePattern): number {
  const blasts: Array<[number, number]> =
    pattern === "short" ? [[0, 0.18]]
      : pattern === "kickoff" ? [[0, 0.28]]
      : pattern === "halftime" ? [[0, 0.22], [0.34, 0.42]]
      : [[0, 0.22], [0.34, 0.22], [0.72, 0.55]];
  let end = t0;
  for (const [offset, dur] of blasts) {
    whistleBlast(ctx, dest, t0 + offset, dur);
    end = Math.max(end, t0 + offset + dur);
  }
  return end;
}

export interface CrowdBedProfile {
  density: number;
  size: number;
  enclosure: number;
}

export interface CrowdBed {
  setIntensity(value: number): void;
  setProfile(profile: CrowdBedProfile): void;
  stop(): void;
}

export function crowdBed(ctx: Ctx, dest: AudioNode, t0: number): CrowdBed {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const low = ctx.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.value = 1400;
  const high = ctx.createBiquadFilter();
  high.type = "highpass";
  high.frequency.value = 90;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);

  // A short reflected path gives covered/enclosed grounds a little roof slap
  // without turning the synthetic crowd into a cavernous reverb wash.
  const echoDelay = ctx.createDelay(0.2);
  const echoFilter = ctx.createBiquadFilter();
  echoFilter.type = "lowpass";
  echoFilter.frequency.value = 1800;
  const echoGain = ctx.createGain();
  echoGain.gain.setValueAtTime(0.0001, t0);

  src.connect(high).connect(low).connect(gain);
  gain.connect(dest);
  gain.connect(echoDelay).connect(echoFilter).connect(echoGain).connect(dest);
  src.start(t0);

  let stopped = false;
  let intensity = 0.25;
  let profile: CrowdBedProfile = { density: 0.65, size: 0.25, enclosure: 0.25 };

  const apply = () => {
    if (stopped) return;
    const v = clamp(intensity);
    const density = clamp(profile.density);
    const size = clamp(profile.size);
    const enclosure = clamp(profile.enclosure);
    const now = ctx.currentTime;

    // A packed little covered ground can feel fierce without simply becoming
    // louder than a 50,000-seat stadium. Size affects scale; density and
    // enclosure affect presence and reflected energy.
    const scale = (0.74 + size * 0.24) * (0.68 + density * 0.42) * (0.92 + enclosure * 0.16);
    low.frequency.setTargetAtTime(620 + v * 1780 + enclosure * 220, now, 0.18);
    gain.gain.setTargetAtTime((0.016 + v * 0.108) * scale, now, 0.22);
    echoDelay.delayTime.setTargetAtTime(0.035 + enclosure * 0.045, now, 0.2);
    echoFilter.frequency.setTargetAtTime(1250 + enclosure * 1450, now, 0.2);
    echoGain.gain.setTargetAtTime(0.002 + enclosure * (0.012 + v * 0.024), now, 0.24);
  };

  apply();
  return {
    setIntensity(value: number) {
      intensity = clamp(value);
      apply();
    },
    setProfile(next: CrowdBedProfile) {
      profile = {
        density: clamp(next.density),
        size: clamp(next.size),
        enclosure: clamp(next.enclosure),
      };
      apply();
    },
    stop() {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      gain.gain.setTargetAtTime(0.0001, now, 0.18);
      echoGain.gain.setTargetAtTime(0.0001, now, 0.12);
      src.stop(now + 0.8);
    },
  };
}

export type CrowdReaction = "goal" | "concede" | "ooh" | "applause";

function crowdBurst(ctx: Ctx, dest: AudioNode, t: number, duration: number, level: number, centre: number) {
  filteredNoise(ctx, dest, t, duration, centre, 0.45, level);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(95, t + duration);
  env(g, t, 0.03, level * 0.24, duration * 0.85);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

export function crowdReaction(ctx: Ctx, dest: AudioNode, t0: number, kind: CrowdReaction): number {
  if (kind === "goal") {
    crowdBurst(ctx, dest, t0, 2.6, 0.28, 760);
    crowdBurst(ctx, dest, t0 + 0.15, 2.2, 0.18, 1450);
    return t0 + 2.8;
  }
  if (kind === "concede") {
    crowdBurst(ctx, dest, t0, 1.7, 0.12, 420);
    crowdBurst(ctx, dest, t0 + 0.28, 1.8, 0.09, 1250);
    return t0 + 2.2;
  }
  if (kind === "ooh") {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(210, t0);
    osc.frequency.exponentialRampToValueAtTime(135, t0 + 0.95);
    env(g, t0, 0.08, 0.065, 0.95);
    osc.connect(g).connect(dest);
    osc.start(t0);
    osc.stop(t0 + 1.1);
    crowdBurst(ctx, dest, t0, 1.1, 0.075, 950);
    return t0 + 1.15;
  }
  for (let i = 0; i < 5; i += 1) {
    const t = t0 + i * 0.17;
    filteredNoise(ctx, dest, t, 0.09, 1300 + i * 90, 1.2, 0.07);
  }
  return t0 + 1.1;
}

export function kick(ctx: Ctx, dest: AudioNode, t0: number, strength = 1): void {
  const level = clamp(strength, 0.2, 1.4);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(135, t0);
  osc.frequency.exponentialRampToValueAtTime(58, t0 + 0.08);
  env(gain, t0, 0.002, 0.18 * level, 0.11);
  osc.connect(gain).connect(dest);
  osc.start(t0);
  osc.stop(t0 + 0.14);
  filteredNoise(ctx, dest, t0, 0.08, 850, 0.8, 0.045 * level);
}

export const THEME_BPM = 94;
export const THEME_BARS = 16;
const beatSeconds = () => 60 / THEME_BPM;
export const themeBarSeconds = () => beatSeconds() * 4;

function noteFrequency(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function note(ctx: Ctx, dest: AudioNode, when: number, midi: number, duration: number, level: number, type: OscillatorType = "triangle") {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = noteFrequency(midi);
  env(gain, when, 0.02, level, Math.max(0.05, duration - 0.02));
  osc.connect(gain).connect(dest);
  osc.start(when);
  osc.stop(when + duration + 0.05);
}

function hat(ctx: Ctx, dest: AudioNode, when: number, level: number) {
  filteredNoise(ctx, dest, when, 0.06, 6200, 0.8, level);
}

function drum(ctx: Ctx, dest: AudioNode, when: number, level: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(95, when);
  osc.frequency.exponentialRampToValueAtTime(45, when + 0.18);
  env(gain, when, 0.004, level, 0.18);
  osc.connect(gain).connect(dest);
  osc.start(when);
  osc.stop(when + 0.22);
}

const CHORDS = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [48, 52, 55], // C
  [55, 59, 62], // G
] as const;
const LEAD = [69, 72, 76, 72, 67, 69, 72, 74, 76, 74, 72, 69, 67, 64, 67, 69];

export function scheduleThemeBar(ctx: Ctx, dest: AudioNode, t: number, bar: number): void {
  const beat = beatSeconds();
  const chord = CHORDS[bar % CHORDS.length];
  const bass = chord[0] - 12;
  for (const midi of chord) note(ctx, dest, t, midi, beat * 3.7, 0.028, "sine");
  note(ctx, dest, t, bass, beat * 1.65, 0.055, "triangle");
  note(ctx, dest, t + beat * 2, bass + (bar % 4 === 3 ? 2 : 0), beat * 1.6, 0.05, "triangle");
  drum(ctx, dest, t, 0.07);
  drum(ctx, dest, t + beat * 2, 0.055);
  for (let i = 0; i < 8; i += 1) hat(ctx, dest, t + i * beat * 0.5, i % 2 ? 0.012 : 0.018);
  const lead = LEAD[bar % LEAD.length];
  note(ctx, dest, t + beat * 0.5, lead, beat * 0.65, 0.038, "square");
  note(ctx, dest, t + beat * 1.5, lead + (bar % 2 ? 2 : -2), beat * 0.65, 0.033, "square");
  note(ctx, dest, t + beat * 2.5, lead, beat * 1.0, 0.036, "square");
}
