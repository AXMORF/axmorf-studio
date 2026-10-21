// AXMORF studio-v2 score engine: deterministic arrangement and DSP for original film scores.
// Recipes opt in with `engine: "studio-v2"`; older recipes keep the original synth-score engine.

export const SR = 48_000;

export const STUDIO_INSTRUMENTS = Object.freeze([
  "kick",
  "snare",
  "clap",
  "hat",
  "bass",
  "pad",
  "pluck",
  "lead",
  "guitar",
]);

const TWO_PI = 2 * Math.PI;
const midiHz = (note) => 440 * 2 ** ((note - 69) / 12);

/** xorshift32 so every seed produces the same arrangement and noise. */
const rng = (seed) => {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
};

// ---------------------------------------------------------------------------
// Arrangement: sections, drums, harmony, motif, transitions.
// ---------------------------------------------------------------------------

const scaleFor = (mode) =>
  mode === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];

/** Two-bar rhythmic cells in eighth-note steps (0–15); the seed picks one per score. */
const MOTIF_RHYTHMS = [
  [0, 3, 6, 8, 10],
  [0, 2, 4, 7, 10, 12],
  [0, 3, 4, 6, 8, 11],
  [0, 4, 6, 7, 10],
  [0, 2, 3, 6, 8, 12, 14],
];

export const arrangeStudioScore = (settings, arrangement, fpb, add, marks) => {
  if (settings.style === "drive") {
    arrangeDriveScore(settings, arrangement, fpb, add, marks);
    return;
  }
  const random = rng(settings.seed ^ 0x5f3759df);
  const scale = scaleFor(arrangement.mode);
  const tonicPc = arrangement.tonicPitchClass;
  const note = (degree, octave) =>
    12 * (octave + 1) +
    tonicPc +
    scale[((degree % 7) + 7) % 7] +
    12 * Math.floor(degree / 7);
  const electronic = settings.style === "electronic";
  const beatsPerBar = settings.beatsPerBar;
  const eighth = 0.5;
  const swingAt = (step) => (step % 2 === 1 ? arrangement.swing : 0);

  // One motif per score keeps the film recognisable; sections vary it, never replace it.
  const rhythm = MOTIF_RHYTHMS[Math.floor(random() * MOTIF_RHYTHMS.length)];
  const contour = rhythm.map((_, index) =>
    index === 0 ? 0 : Math.round((random() - 0.45) * 4),
  );

  let firstBar = 0;
  const sections = arrangement.sections;
  sections.forEach((section, sectionIndex) => {
    const voices = new Set(section.instruments);
    const next = sections[sectionIndex + 1];
    const previous = sections[sectionIndex - 1];
    const endBar = firstBar + section.bars;
    const endFrame = Math.round(endBar * beatsPerBar * fpb);
    const drums = ["kick", "snare", "clap", "hat"];
    const hasDrums = drums.some((type) => voices.has(type));
    const nextHasDrums = next !== undefined && drums.some((type) => next.instruments.includes(type));
    // A lift is a rise into a drum section: it earns a fill and a riser before the arrival.
    const lift = next !== undefined && next.energy > section.energy + 0.05 && nextHasDrums;
    const arrives = previous === undefined || section.energy > previous.energy + 0.05;
    const play = (type, at, pitch, gain, beats) => {
      if (Math.round(at * fpb) >= endFrame) return;
      add(type, at, pitch, gain * (0.35 + 0.65 * section.energy), beats, endFrame);
    };
    marks.sections.push({
      startFrame: Math.round(firstBar * beatsPerBar * fpb),
      bars: section.bars,
      energy: section.energy,
    });
    if (arrives && hasDrums && firstBar > 0) {
      add("crash", firstBar * beatsPerBar, 49, 0.32 * section.energy, beatsPerBar * 2);
      marks.accents.push(Math.round(firstBar * beatsPerBar * fpb));
    }

    for (let bar = firstBar; bar < endBar; bar++) {
      const start = bar * beatsPerBar;
      const degree = arrangement.progression[bar % arrangement.progression.length] - 1;
      const chord = [degree, degree + 2, degree + 4];
      const lastBar = bar === endBar - 1;
      const phraseBar = (bar - firstBar) % 4;

      if (voices.has("pad")) {
        for (const [index, chordDegree] of chord.entries()) {
          play("pad", start, note(chordDegree, 3), index === 0 ? 0.12 : 0.1, beatsPerBar);
        }
        if (section.energy > 0.6) play("pad", start, note(chord[0], 4), 0.06, beatsPerBar);
      }

      for (let step = 0; step < beatsPerBar * 2; step++) {
        const at = start + step * eighth + swingAt(step);
        const beat = step / 2;
        const onBeat = step % 2 === 0;
        const backbeat = onBeat && beatsPerBar >= 4 && (beat === 1 || beat === 3);
        const fillZone = lastBar && lift && beat >= beatsPerBar - 1;

        if (voices.has("kick") && onBeat && !fillZone) {
          const pattern = electronic
            ? true
            : beat === 0 || beat === 2 || (random() < section.density * 0.35 && !backbeat);
          if (pattern) play("kick", at, 36, beat === 0 ? 1 : 0.85, 0.5);
        }
        if (!electronic && voices.has("kick") && !onBeat && step === 5 && random() < section.density * 0.6) {
          play("kick", at, 36, 0.6, 0.4);
        }
        if (backbeat && !fillZone) {
          if (voices.has("snare")) play("snare", at, 38, 0.8, 0.5);
          if (voices.has("clap")) play("clap", at, 39, 0.6, 0.5);
        }
        if (voices.has("hat")) {
          const open = electronic && !onBeat && section.energy > 0.55;
          const keep = onBeat ? section.density > 0.35 : true;
          if (keep) play("hat", at, open ? 46 : 42, open ? 0.22 : onBeat ? 0.15 : 0.21, open ? 0.4 : 0.15);
          if (section.density > 0.75 && !onBeat) play("hat", at + 0.25, 42, 0.11, 0.12);
        }
        if (voices.has("bass")) {
          const root = note(chord[0], 2);
          if (electronic) {
            if (!onBeat) play("bass", at, root, 0.75, 0.42);
            else if (beat === 0) play("bass", at, root, 0.65, 0.3);
          } else if (onBeat && (beat === 0 || random() < section.density * 0.7)) {
            const walk = beat === beatsPerBar - 1 && random() < 0.5 ? note(chord[2], 2) : root;
            play("bass", at, walk, 0.8, beat === 0 ? 1.4 : 0.8);
          }
        }
        if (voices.has("pluck")) {
          const arp = [0, 1, 2, 1, 2, 3, 2, 1][step % 8];
          const pitch = arp === 3 ? note(chord[0] + 7, 4) : note(chord[arp], 4);
          if (random() < 0.35 + section.density * 0.65) {
            play("pluck", at, pitch, onBeat ? 0.55 : 0.4, electronic ? 0.4 : 1.2);
          }
        }
        if (fillZone) {
          // A short snare/tom fill pulls the ear into the next, stronger section.
          for (let sub = 0; sub < 2; sub++) {
            const fillAt = at + sub * 0.25;
            // Sixteenth notes over the final beat, rising from soft to full.
            const progress = (fillAt - (start + beatsPerBar - 1)) / 0.75;
            play("snare", fillAt, 38, 0.3 + 0.5 * Math.min(1, progress), 0.25);
          }
        }
      }

      if (voices.has("lead")) {
        const answer = phraseBar >= 2;
        const half = phraseBar % 2;
        for (const [index, stepInTwoBars] of rhythm.entries()) {
          if (Math.floor(stepInTwoBars / 8) !== half) continue;
          const step = stepInTwoBars % 8;
          if (section.density < 0.5 && index % 2 === 1) continue;
          let degreeOffset = contour.slice(0, index + 1).reduce((sum, value) => sum + value, 0);
          // The answer phrase resolves towards the chord root instead of repeating the call.
          if (answer && index === rhythm.length - 1) degreeOffset = 0;
          if (answer && index > 0 && index < rhythm.length - 1) degreeOffset -= 1;
          const pitch = note(chord[0] + degreeOffset, 4);
          const nextStep = rhythm[index + 1] ?? 16;
          const length = Math.min(2, Math.max(0.5, (nextStep - stepInTwoBars) * eighth));
          play("lead", start + step * eighth + swingAt(step), pitch, 0.5, length * 0.9);
        }
      }
    }

    if (lift) {
      const riserBeats = Math.min(beatsPerBar * 2, section.bars * beatsPerBar);
      add("riser", endBar * beatsPerBar - riserBeats, 60, 0.32 * next.energy, riserBeats, endFrame);
    }
    firstBar = endBar;
  });
};

// ---------------------------------------------------------------------------
// Drive: a band arrangement for openings and high-energy films. Energy picks
// the tier (verse < 0.5 ≤ build < 0.8 ≤ chorus); instruments still gate voices.
// ---------------------------------------------------------------------------

/** Hook rhythms in eighth-note steps over two bars; syncopated and repeatable. */
const DRIVE_HOOKS = [
  [0, 2, 3, 5, 8, 10, 11, 14],
  [0, 3, 6, 8, 9, 11, 14],
  [0, 2, 4, 5, 7, 8, 11, 12],
];

const arrangeDriveScore = (settings, arrangement, fpb, add, marks) => {
  const random = rng(settings.seed ^ 0x2545f491);
  const scale = scaleFor(arrangement.mode);
  const note = (degree, octave) =>
    12 * (octave + 1) +
    arrangement.tonicPitchClass +
    scale[((degree % 7) + 7) % 7] +
    12 * Math.floor(degree / 7);
  const beatsPerBar = settings.beatsPerBar;
  const steps = beatsPerBar * 2;
  const hook = DRIVE_HOOKS[Math.floor(random() * DRIVE_HOOKS.length)];
  // Chord-tone indices (0 root, 1 third, 2 fifth, 3 octave) give a singable contour.
  const hookTones = hook.map(() => Math.floor(random() * 4));
  hookTones[0] = 2;
  const drums = ["kick", "snare", "clap", "hat"];

  let firstBar = 0;
  arrangement.sections.forEach((section, sectionIndex) => {
    const voices = new Set(section.instruments);
    const next = arrangement.sections[sectionIndex + 1];
    const previous = arrangement.sections[sectionIndex - 1];
    const endBar = firstBar + section.bars;
    const endFrame = Math.round(endBar * beatsPerBar * fpb);
    const tier = section.energy < 0.5 ? 0 : section.energy < 0.8 ? 1 : 2;
    const hasDrums = drums.some((type) => voices.has(type));
    const nextHasDrums = next !== undefined && drums.some((type) => next.instruments.includes(type));
    const lift = next !== undefined && next.energy > section.energy + 0.05 && nextHasDrums;
    const arrives = previous === undefined || section.energy > previous.energy + 0.05;
    const play = (type, at, pitch, gain, beats) => {
      if (Math.round(at * fpb) >= endFrame) return;
      add(type, at, pitch, Math.min(1, gain * (0.45 + 0.55 * section.energy)), beats, endFrame);
    };
    marks.sections.push({
      startFrame: Math.round(firstBar * beatsPerBar * fpb),
      bars: section.bars,
      energy: section.energy,
    });
    if (arrives && hasDrums && firstBar > 0) {
      add("crash", firstBar * beatsPerBar, 49, 0.4 * section.energy, beatsPerBar * 2);
      marks.accents.push(Math.round(firstBar * beatsPerBar * fpb));
    }

    for (let bar = firstBar; bar < endBar; bar++) {
      const start = bar * beatsPerBar;
      const degree = arrangement.progression[bar % arrangement.progression.length] - 1;
      const chord = [degree, degree + 2, degree + 4, degree + 7];
      const phraseBar = (bar - firstBar) % 4;
      const lastBar = bar === endBar - 1;
      // Section changes get a two-beat tom run; other phrase ends a one-beat fill.
      const fillBeats = lastBar && lift ? 2 : phraseBar === 3 && tier > 0 && hasDrums ? 1 : 0;
      const fillFrom = start + beatsPerBar - fillBeats;

      if (voices.has("pad")) {
        for (const [index, chordDegree] of chord.slice(0, 3).entries()) {
          play("pad", start, note(chordDegree, 3), tier === 2 ? 0.05 : 0.08 - index * 0.01, beatsPerBar);
        }
      }
      if (tier === 2 && hasDrums && phraseBar % 2 === 0 && bar !== firstBar) {
        add("crash", start, 49, 0.22 * section.energy, beatsPerBar);
      }

      for (let step = 0; step < steps; step++) {
        const at = start + step * 0.5;
        const beat = step / 2;
        const onBeat = step % 2 === 0;
        const inFill = fillBeats > 0 && at >= fillFrom;
        const backbeat = onBeat && (beat % 2 === 1);

        if (voices.has("kick") && !inFill) {
          const pattern = [
            [0, 4, ...(section.density > 0.5 ? [5] : [])],
            [0, 3, 4, 7],
            [0, 2, 3, 4, 6, 7],
          ][tier];
          if (pattern.includes(step % 8)) play("kick", at, 36, step === 0 ? 1 : 0.85, 0.4);
        }
        if (backbeat && !inFill) {
          if (voices.has("snare")) play("snare", at, 38, 0.95, 0.5);
          if (voices.has("clap")) play("clap", at, 39, 0.5, 0.5);
        }
        if (voices.has("hat") && !inFill) {
          // Verse: closed eighths. Build: sixteenths on the last beat. Chorus: open offbeats.
          const open = tier === 2 && !onBeat;
          play("hat", at, open ? 46 : 42, open ? 0.14 : onBeat ? 0.15 : 0.11, open ? 0.3 : 0.12);
          if (tier >= 1 && (beat >= beatsPerBar - 1 || section.density > 0.8)) {
            play("hat", at + 0.25, 42, 0.1, 0.1);
          }
        }
        if (voices.has("bass")) {
          const root = note(chord[0], 2);
          if (tier === 0) {
            if (onBeat) play("bass", at, root, 0.8, 0.9);
          } else {
            const pickup = step === steps - 1 ? note(arrangement.progression[(bar + 1) % arrangement.progression.length] - 1 + 7, 1) : null;
            play("bass", at, pickup ?? (step === 3 ? root + 12 : root), onBeat ? 0.85 : 0.7, 0.45);
          }
        }
        if (voices.has("guitar")) {
          const root = note(chord[0], 2);
          if (tier === 0) {
            // Palm-muted chugs: short events render darker and tighter.
            play("guitar", at, root, step === 0 ? 0.7 : 0.5, step === 0 ? 0.45 : 0.2);
          } else if (tier === 1) {
            play("guitar", at, root, onBeat ? 0.7 : 0.55, onBeat ? 0.45 : 0.2);
          } else if (step === 0 || step === 3 || step === 6) {
            play("guitar", at, root, 0.68, step === 0 ? 1.4 : 1.2);
          } else if (!onBeat) {
            play("guitar", at, root, 0.5, 0.2);
          }
        }
        if (voices.has("pluck")) {
          // Sixteenth arpeggios push the build; eighths keep the chorus open for the hook.
          const subdivisions = tier === 1 ? 2 : 1;
          for (let sub = 0; sub < subdivisions; sub++) {
            const index = (step * subdivisions + sub) % 4;
            const pitch = note(chord[[0, 1, 2, 3][index]], tier === 0 ? 4 : 5);
            if (tier === 0 && !onBeat && random() > section.density) continue;
            play("pluck", at + sub * 0.25, pitch, sub === 0 ? 0.42 : 0.32, 0.22);
          }
        }
        if (inFill && hasDrums) {
          for (let sub = 0; sub < 2; sub++) {
            const fillAt = at + sub * 0.25;
            const progress = (fillAt - fillFrom) / fillBeats;
            // Snare on the way in, then toms falling from high to low.
            const tom = progress < 0.25 ? null : progress < 0.5 ? 50 : progress < 0.75 ? 47 : 43;
            if (tom === null) play("snare", fillAt, 38, 0.6 + 0.3 * progress, 0.25);
            else play("tom", fillAt, tom, 0.75 + 0.2 * progress, 0.3);
          }
        }
      }

      if (voices.has("lead")) {
        // The same two-bar hook twice, then an answer that lands on the root: easy to remember.
        const half = phraseBar % 2;
        const answer = phraseBar === 3;
        for (const [index, hookStep] of hook.entries()) {
          if (Math.floor(hookStep / 8) !== half) continue;
          if (section.density < 0.5 && index % 2 === 1) continue;
          const nextStep = hook[index + 1] ?? 16;
          const tone = answer && index === hook.length - 1 ? 0 : hookTones[index];
          const length = Math.min(2, Math.max(0.5, (nextStep - hookStep) * 0.5));
          play("lead", start + (hookStep % 8) * 0.5, note(chord[tone], 5), 0.55, length * 0.92);
        }
      }
    }

    if (lift) {
      const riserBeats = Math.min(beatsPerBar * 2, section.bars * beatsPerBar);
      add("riser", endBar * beatsPerBar - riserBeats, 60, 0.3 * next.energy, riserBeats, endFrame);
    }
    firstBar = endBar;
  });
};

// ---------------------------------------------------------------------------
// DSP voices.
// ---------------------------------------------------------------------------

/** PolyBLEP saw keeps detuned stacks smooth instead of harsh and aliased. */
const polyBlep = (t, dt) => {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
};

/** Topology-preserving state-variable filter; returns lowpass and bandpass outputs. */
const createSvf = () => {
  let ic1 = 0;
  let ic2 = 0;
  return (input, cutoff, resonance) => {
    const g = Math.tan((Math.PI * Math.min(cutoff, SR * 0.45)) / SR);
    const k = 2 - 2 * resonance;
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    const v3 = input - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    return { low: v2, band: v1, high: input - k * v1 - v2 };
  };
};

const adsr = (t, length, attack, decay, sustain, release) => {
  let level;
  if (t < attack) level = t / attack;
  else if (t < attack + decay) level = 1 - ((t - attack) / decay) * (1 - sustain);
  else level = sustain;
  if (t > length) level *= Math.max(0, 1 - (t - length) / release);
  return level;
};

const VOICES = {
  kick: { bus: "drums", pan: 0, reverb: 0.02, tail: 0.45 },
  snare: { bus: "drums", pan: 0.04, reverb: 0.18, tail: 0.4 },
  clap: { bus: "drums", pan: -0.06, reverb: 0.22, tail: 0.4 },
  hat: { bus: "drums", pan: 0.22, reverb: 0.05, tail: 0.5 },
  crash: { bus: "drums", pan: -0.15, reverb: 0.25, tail: 2.2 },
  riser: { bus: "music", pan: 0, reverb: 0.35, tail: 0.3 },
  bass: { bus: "music", pan: 0, reverb: 0, tail: 0.3, pumped: true },
  pad: { bus: "music", pan: 0, reverb: 0.4, tail: 1.4, pumped: true, wide: true },
  pluck: { bus: "music", pan: 0, reverb: 0.25, delay: 0.22, tail: 1.2, pumped: true },
  lead: { bus: "music", pan: 0.08, reverb: 0.28, delay: 0.3, tail: 0.6, pumped: true },
  guitar: { bus: "music", pan: 0, reverb: 0.06, tail: 0.12 },
  tom: { bus: "drums", pan: 0, reverb: 0.15, tail: 0.5, wide: true },
};

/** Renders one event into its own stereo buffer at sample offset zero. */
const renderVoice = (event, fps, style, noise) => {
  const voice = VOICES[event.type];
  const length = event.durationInFrames / fps;
  const total = Math.ceil((length + voice.tail) * SR);
  const left = new Float32Array(total);
  const right = new Float32Array(total);
  const frequency = midiHz(event.note);
  const filters = [createSvf(), createSvf(), createSvf(), createSvf()];
  const organic = style === "organic";
  const drive = style === "drive";
  const phases = [0, 0, 0, 0, 0, 0];
  // Karplus–Strong delay line for organic plucks.
  const ksLength = Math.max(2, Math.round(SR / frequency));
  const ks = event.type === "pluck" && organic ? new Float32Array(ksLength) : null;
  if (ks) for (let i = 0; i < ksLength; i++) ks[i] = noise() * 2 - 1;
  let ksIndex = 0;
  let ksLast = 0;

  for (let i = 0; i < total; i++) {
    const t = i / SR;
    let l = 0;
    let r = 0;
    switch (event.type) {
      case "kick": {
        const pitch = 46 + 110 * Math.exp(-t / 0.035);
        phases[0] += pitch / SR;
        const body = Math.sin(TWO_PI * phases[0]) * Math.exp(-t / (organic ? 0.22 : drive ? 0.18 : 0.3));
        const click = (noise() * 2 - 1) * Math.exp(-t / 0.0025) * (drive ? 0.6 : 0.35);
        l = r = Math.tanh(1.6 * body + click);
        break;
      }
      case "snare": {
        phases[0] += 185 / SR;
        const tone = Math.sin(TWO_PI * phases[0]) * Math.exp(-t / 0.06) * 0.55;
        const wire = filters[0]((noise() * 2 - 1), 4200, 0.35).band * Math.exp(-t / (organic ? 0.13 : drive ? 0.2 : 0.17));
        // Drive snares carry more body so the backbeat cuts through the guitars.
        l = r = drive ? Math.tanh(1.3 * (tone * 1.4 + 1.6 * wire)) : tone + 1.4 * wire;
        break;
      }
      case "clap": {
        const burst = [0, 0.011, 0.023].reduce(
          (sum, offset) => (t >= offset ? sum + Math.exp(-(t - offset) / 0.009) : sum),
          0,
        );
        const tail = t > 0.023 ? Math.exp(-(t - 0.023) / 0.11) * 0.6 : 0;
        const sound = filters[0](noise() * 2 - 1, 1300, 0.45).band;
        l = r = 1.8 * sound * (burst + tail);
        break;
      }
      case "hat": {
        const open = event.note === 46;
        const hp = filters[0](noise() * 2 - 1, 7800, 0.2).high;
        l = r = 0.9 * hp * Math.exp(-t / (open ? 0.12 : 0.03));
        break;
      }
      case "crash": {
        const hp = filters[0](noise() * 2 - 1, 5200, 0.1).high;
        const shimmer = filters[1](noise() * 2 - 1, 9000, 0.3).band;
        const env = Math.exp(-t / 0.9);
        l = (0.7 * hp + 0.3 * shimmer) * env;
        r = (0.6 * hp + 0.4 * shimmer) * env;
        break;
      }
      case "riser": {
        const progress = Math.min(1, t / Math.max(length, 0.01));
        const cutoff = 400 + 9000 * progress ** 2;
        const swept = filters[0](noise() * 2 - 1, cutoff, 0.55).band;
        phases[0] += (frequency * (0.5 + progress)) / SR;
        const tone = 0.15 * Math.sin(TWO_PI * phases[0]);
        const env = progress ** 2 * (t > length ? Math.max(0, 1 - (t - length) / 0.05) : 1);
        l = (swept + tone) * env;
        r = (swept * 0.9 + tone) * env;
        break;
      }
      case "bass": {
        const dt = frequency / SR;
        phases[0] = (phases[0] + dt) % 1;
        phases[1] = (phases[1] + dt / 2) % 1;
        const saw = 2 * phases[0] - 1 - polyBlep(phases[0], dt);
        const sub = Math.sin(TWO_PI * phases[1]) * 0.6 + Math.sin(TWO_PI * phases[0]) * 0.5;
        const cutoff = (organic ? 260 : 340) + 900 * Math.exp(-t / 0.08);
        const filtered = filters[0](saw * (organic ? 0.35 : 0.6), cutoff, 0.25).low;
        const env = adsr(t, length, 0.004, 0.12, 0.75, 0.06);
        l = r = Math.tanh(1.4 * (filtered + sub * 0.7)) * env;
        break;
      }
      case "pad": {
        const detunes = [-0.11, -0.04, 0.04, 0.11];
        let sumL = 0;
        let sumR = 0;
        detunes.forEach((cents, index) => {
          const f = frequency * 2 ** (cents / 12);
          const dt = f / SR;
          phases[index] = (phases[index] + dt) % 1;
          const saw = 2 * phases[index] - 1 - polyBlep(phases[index], dt);
          if (index % 2 === 0) sumL += saw;
          else sumR += saw;
        });
        const cutoff = (organic ? 900 : 1500) + 500 * Math.sin(TWO_PI * 0.15 * t);
        const env = adsr(t, length, 0.35, 0.6, 0.8, 1.2);
        l = filters[0](sumL * 0.5, cutoff, 0.15).low * env;
        r = filters[1](sumR * 0.5, cutoff, 0.15).low * env;
        break;
      }
      case "pluck": {
        if (ks) {
          const current = ks[ksIndex];
          const averaged = 0.497 * (current + ksLast);
          ksLast = current;
          ks[ksIndex] = averaged;
          ksIndex = (ksIndex + 1) % ksLength;
          const env = t > length ? Math.max(0, 1 - (t - length) / 0.4) : 1;
          l = r = current * 0.9 * env;
        } else {
          const dt = frequency / SR;
          phases[0] = (phases[0] + dt) % 1;
          const saw = 2 * phases[0] - 1 - polyBlep(phases[0], dt);
          const cutoff = 600 + 5200 * Math.exp(-t / 0.07);
          const env = adsr(t, length, 0.002, 0.25, 0.15, 0.25);
          l = r = filters[0](saw, cutoff, 0.35).low * env * 0.8;
        }
        break;
      }
      case "lead": {
        const vibrato = t > 0.18 ? 1 + 0.004 * Math.sin(TWO_PI * 5.2 * t) : 1;
        const f = frequency * vibrato;
        const dt = f / SR;
        phases[0] = (phases[0] + dt) % 1;
        phases[1] = (phases[1] + dt * 1.004) % 1;
        const saw = 2 * phases[0] - 1 - polyBlep(phases[0], dt);
        const square = (phases[1] < 0.5 ? 1 : -1) * 0.5;
        const cutoff = (organic ? 1800 : 2600) + 1600 * Math.exp(-t / 0.12);
        const env = adsr(t, length, 0.012, 0.18, 0.7, 0.18);
        l = r = filters[0](saw * 0.6 + square * 0.4, cutoff, 0.3).low * env * 0.7;
        break;
      }
      case "guitar": {
        // Power chord (root, fifth, octave), double-tracked left/right, driven into a cabinet filter.
        const muted = length < 0.16;
        let sumL = 0;
        let sumR = 0;
        [1, 1.4983, 2].forEach((ratio, index) => {
          for (const [side, cents] of [[0, -0.07], [1, 0.07]]) {
            const slot = index * 2 + side;
            const f = frequency * ratio * 2 ** (cents / 12);
            const dt = f / SR;
            phases[slot] = (phases[slot] + dt) % 1;
            const saw = 2 * phases[slot] - 1 - polyBlep(phases[slot], dt);
            if (side === 0) sumL += saw;
            else sumR += saw;
          }
        });
        const gainIn = muted ? 2.6 : 4.5;
        const cutoff = muted ? 700 + 1600 * Math.exp(-t / 0.025) : 2900 + 600 * Math.exp(-t / 0.05);
        const env = adsr(t, length, 0.002, muted ? 0.05 : 0.25, muted ? 0.35 : 0.8, 0.05);
        l = filters[1](filters[0](Math.tanh(gainIn * sumL / 3), cutoff, 0.2).low, 5200, 0.1).low * env * 0.55;
        r = filters[3](filters[2](Math.tanh(gainIn * sumR / 3), cutoff, 0.2).low, 5200, 0.1).low * env * 0.55;
        break;
      }
      case "tom": {
        const pitch = frequency * (1 + 0.6 * Math.exp(-t / 0.03));
        phases[0] += pitch / SR;
        const body = Math.sin(TWO_PI * phases[0]) * Math.exp(-t / 0.26);
        const stick = filters[0](noise() * 2 - 1, 3000, 0.3).band * Math.exp(-t / 0.012);
        l = r = Math.tanh(1.5 * body + 0.8 * stick);
        break;
      }
      default:
        throw new Error(`Unsupported studio voice: ${event.type}`);
    }
    left[i] = l * event.gain;
    right[i] = r * event.gain;
  }
  return { left, right, voice };
};

// ---------------------------------------------------------------------------
// Buses: wrap-around mixing, reverb, tempo delay and kick sidechain.
// ---------------------------------------------------------------------------

/** Freeverb-style comb/allpass network with different lengths per side for width. */
const reverb = (input, count, seedOffset, room) => {
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((length) => ({
    buffer: new Float32Array(length + seedOffset),
    index: 0,
    store: 0,
  }));
  const allpasses = [556, 441, 341].map((length) => ({
    buffer: new Float32Array(length + Math.floor(seedOffset / 2)),
    index: 0,
  }));
  const output = new Float32Array(count);
  // Run two loop cycles so the tail of the end wraps seamlessly into frame zero.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < count; i++) {
      const x = input[i] * 0.015;
      let sum = 0;
      for (const comb of combs) {
        const y = comb.buffer[comb.index];
        comb.store = y * 0.8 + comb.store * 0.2;
        comb.buffer[comb.index] = x + comb.store * room;
        comb.index = (comb.index + 1) % comb.buffer.length;
        sum += y;
      }
      for (const allpass of allpasses) {
        const buffered = allpass.buffer[allpass.index];
        const y = -sum + buffered;
        allpass.buffer[allpass.index] = sum + buffered * 0.5;
        allpass.index = (allpass.index + 1) % allpass.buffer.length;
        sum = y;
      }
      if (pass === 1) output[i] = sum;
    }
  }
  return output;
};

/** Ping-pong dotted-eighth delay synced to the score tempo, wrapped for loops. */
const pingPong = (inputL, inputR, count, delaySamples) => {
  const outL = new Float32Array(count);
  const outR = new Float32Array(count);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < count; i++) {
      const j = (i - delaySamples + count) % count;
      const fromL = inputR[j] + outR[j] * 0.38;
      const fromR = inputL[j] + outL[j] * 0.38;
      outL[i] = fromL * 0.5;
      outR[i] = fromR * 0.5;
    }
  }
  return { left: outL, right: outR };
};

export const synthesizeStudioTimeline = (timeline) => {
  const count = Math.round((timeline.durationInFrames / timeline.fps) * SR);
  const random = rng(timeline.seed);
  const buses = {
    drumsL: new Float32Array(count),
    drumsR: new Float32Array(count),
    musicL: new Float32Array(count),
    musicR: new Float32Array(count),
    pumpedL: new Float32Array(count),
    pumpedR: new Float32Array(count),
    reverb: new Float32Array(count),
    delayL: new Float32Array(count),
    delayR: new Float32Array(count),
  };
  const kickStarts = [];
  for (const event of timeline.music) {
    // Exact beat onsets keep fast drum patterns tight; older timelines fall back to frames.
    const start =
      event.beat !== undefined
        ? Math.round(((event.beat * 60) / timeline.bpm) * SR)
        : Math.round((event.frame / timeline.fps) * SR);
    if (event.type === "kick") kickStarts.push(start);
    const { left, right, voice } = renderVoice(event, timeline.fps, timeline.style, random);
    // Wide voices alternate pitch-dependent panning; other voices use their fixed seat.
    const pan = voice.wide ? (((event.note % 5) - 2) / 2) * 0.35 : voice.pan;
    const gainL = Math.cos(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
    const gainR = Math.sin(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
    const dryL = voice.pumped ? buses.pumpedL : voice.bus === "drums" ? buses.drumsL : buses.musicL;
    const dryR = voice.pumped ? buses.pumpedR : voice.bus === "drums" ? buses.drumsR : buses.musicR;
    for (let i = 0; i < left.length; i++) {
      const index = (start + i) % count;
      const l = left[i] * gainL;
      const r = right[i] * gainR;
      dryL[index] += l;
      dryR[index] += r;
      buses.reverb[index] += (l + r) * voice.reverb;
      if (voice.delay) {
        buses.delayL[index] += l * voice.delay;
        buses.delayR[index] += r * voice.delay;
      }
    }
  }

  // Sidechain: tonal voices duck under each kick, giving electronic scores their pulse.
  const depth = timeline.style === "electronic" ? 0.55 : timeline.style === "drive" ? 0.12 : 0.2;
  const pump = new Float32Array(count).fill(1);
  for (const start of kickStarts) {
    for (let i = 0; i < SR * 0.3; i++) {
      const index = (start + i) % count;
      const attack = Math.min(1, i / (SR * 0.004));
      const duck = 1 - depth * attack * Math.exp(-i / (SR * 0.09));
      pump[index] = Math.min(pump[index], duck);
    }
  }

  const reverbL = reverb(buses.reverb, count, 0, timeline.style === "organic" ? 0.86 : 0.8);
  const reverbR = reverb(buses.reverb, count, 23, timeline.style === "organic" ? 0.86 : 0.8);
  const beatSamples = Math.round((60 / timeline.bpm) * SR);
  const echo = pingPong(buses.delayL, buses.delayR, count, Math.round(beatSamples * 0.75));

  const left = new Float32Array(count);
  const right = new Float32Array(count);
  let peak = 0;
  for (let i = 0; i < count; i++) {
    const l =
      buses.drumsL[i] +
      buses.musicL[i] +
      buses.pumpedL[i] * pump[i] +
      (reverbL[i] + echo.left[i]) * pump[i];
    const r =
      buses.drumsR[i] +
      buses.musicR[i] +
      buses.pumpedR[i] * pump[i] +
      (reverbR[i] + echo.right[i]) * pump[i];
    left[i] = Math.tanh(l * 0.9);
    right[i] = Math.tanh(r * 0.9);
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  return { left, right, peak };
};
