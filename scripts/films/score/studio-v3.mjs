// Sample-free studio-v3: layered drums, interlocking bass, tonal harmony and a
// short procedural room. Ported from the approved P8 lab; no speech sidechain.
// A resolving cadence is a paragraph landing, not a drop. This is visual
// event metadata only; keep the existing synthesis gains and PCM unchanged.
const RESOLVE_ENDING_ACCENT_STRENGTH = 0.6;
const SR = 48000;
const TAU = 2 * Math.PI;
const sine = (x) => Math.sin(TAU * x);
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const unique = (frames) => [...new Set(frames)].sort((a, b) => a - b);

const noiseSource = (seed) => {
  let state = seed >>> 0 || 1;
  const uniform = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) + 0.5) / 4294967296;
  };
  // Box–Muller replaces numpy's generator, keeping the Gaussian excitation.
  return () => Math.sqrt(-2 * Math.log(uniform())) * Math.cos(TAU * uniform());
};

/** Stateful second-order Butterworth section, used only during generation. */
const filter = (cutoff, highpass = false) => {
  const w = (TAU * cutoff) / SR;
  const c = Math.cos(w);
  const alpha = Math.sin(w) / Math.SQRT2;
  const a0 = 1 + alpha;
  const b0 = (highpass ? 1 + c : 1 - c) / (2 * a0);
  const b1 = (highpass ? -(1 + c) : 1 - c) / a0;
  const a1 = (-2 * c) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  return (x) => {
    const y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
};

export const arrangeV3Score = (settings, arrangement, fpb, add, marks) => {
  const scale =
    arrangement.mode === "minor"
      ? [0, 2, 3, 5, 7, 8, 10]
      : [0, 2, 4, 5, 7, 9, 11];
  const tonic = 48 + arrangement.tonicPitchClass;
  const note = (degree) =>
    tonic + scale[degree % 7] + 12 * Math.floor(degree / 7);
  let firstBar = 0;
  for (const section of arrangement.sections) {
    const endBar = firstBar + section.bars;
    const endFrame = Math.round(endBar * settings.beatsPerBar * fpb);
    const voices = new Set(section.instruments);
    marks.sections.push({
      startFrame: Math.round(firstBar * settings.beatsPerBar * fpb),
      bars: section.bars,
      energy: section.energy,
    });
    const play = (type, at, pitch, gain, beats) => {
      if (voices.has(type) && Math.round(at * fpb) < endFrame)
        add(type, at, pitch, gain * section.energy, beats, endFrame);
    };
    for (let bar = firstBar; bar < endBar; bar++) {
      const degree =
        arrangement.progression[
          Math.floor(bar / 2) % arrangement.progression.length
        ] - 1;
      const chord = [note(degree), note(degree + 2), note(degree + 4)];
      const start = bar * settings.beatsPerBar;
      for (const pitch of chord)
        play("pad", start, pitch, 0.12 / 3, settings.beatsPerBar);
      for (let beat = 0; beat < settings.beatsPerBar; beat++) {
        const at = start + beat;
        play("kick", at, 36, 0.8, 0.85);
        if (beat % 2 === 1) {
          play("snare", at, 50, 0.4, 0.4);
          play("clap", at, 50, 0.18, 0.3);
        }
        for (const offset of [0, 0.5]) {
          if (offset === 0 && section.density < 0.4 && beat % 2) continue;
          play(
            "hat",
            at + offset + (offset ? arrangement.swing : 0),
            beat === settings.beatsPerBar - 1 && offset ? 46 : 42,
            offset ? 0.21 : 0.14,
            offset ? 0.45 : 0.15,
          );
        }
        // The root shares the kick; short pickups answer it instead of doubling it.
        for (const offset of beat % 2 === 0 ? [0, 0.75] : [0.5])
          if (offset === 0 || section.density >= 0.4)
            play(
              "bass",
              at + offset,
              chord[0] - 12,
              offset === 0 ? 0.4 : 0.28,
              0.5,
            );
        if (section.density >= 0.5 || beat % 2 === 0) {
          play("pluck", at + 0.5, chord[(beat + bar) % 3] + 12, 0.12, 1);
          play("lead", at + 0.5, chord[(beat + bar) % 3] + 12, 0.14, 1);
        }
        play("guitar", at, chord[0], 0.14, 0.8);
      }
    }
    firstBar = endBar;
  }
};

/** Finalize after storyboard controls so fills, rests and audio share one schedule. */
export const finalizeV3Timeline = (timeline, recipe) => {
  const window = timeline.musicWindowInFrames ?? timeline.durationInFrames;
  const end = timeline.ending?.landFrame ?? window;
  const breaks = timeline.breaks ?? [];
  const sections = timeline.sections ?? [];
  const framesPerBeat = (60 * timeline.fps) / timeline.bpm;
  const allowed = (type, at) =>
    at >= 0 &&
    at < window &&
    !breaks.some(
      (gap) => at >= gap.from && at < gap.to && !gap.keep.includes(type),
    );
  const music = timeline.music.filter((event) =>
    allowed(event.type, event.frame),
  );
  const add = (type, frame, note, gain, length) => {
    if (allowed(type, frame))
      music.push({
        type,
        frame,
        note,
        gain,
        durationInFrames: Math.max(
          1,
          Math.min(window - frame, Math.round(length)),
        ),
      });
  };
  const boundaries = unique([
    ...breaks.map((gap) => gap.from),
    ...sections
      .filter((section, i) => i > 0 && section.energy > sections[i - 1].energy)
      .map((section) => section.startFrame),
    ...(timeline.ending?.cadence === "resolve" ? [end] : []),
  ]);
  const fills = [];
  const hasDrums = recipe.arrangement.sections.some((section) =>
    section.instruments.some((type) =>
      ["kick", "snare", "clap"].includes(type),
    ),
  );
  for (const to of boundaries) {
    const previous = [...sections]
      .reverse()
      .find((section) => section.startFrame < to);
    const authored =
      previous && recipe.arrangement.sections[sections.indexOf(previous)];
    if (!hasDrums || !authored?.instruments.length) continue;
    const from = Math.max(0, Math.round(to - framesPerBeat));
    if (
      breaks.some((gap) => from < gap.to && to > gap.from) ||
      fills.some((fill) => from < fill.to && to > fill.from)
    )
      continue;
    fills.push({ from, to });
    const step = Math.max(1, Math.round(framesPerBeat / 8));
    for (let at = from; at < to; at += step)
      add(
        "snare",
        at,
        50,
        0.15 + (0.2 * (at - from)) / (to - from),
        Math.min(timeline.fps * 0.11, to - at),
      );
  }
  const strengths = new Map();
  const accent = (frame, strength) => {
    if (allowed("crash", frame))
      strengths.set(frame, Math.max(strengths.get(frame) ?? 0, strength));
  };
  for (const section of sections)
    if (section.startFrame < end) accent(section.startFrame, section.energy);
  for (const hit of timeline.hits ?? []) accent(hit.frame, hit.intensity);
  if (timeline.ending?.cadence === "resolve") accent(end, 1);
  const accents = [...strengths]
    .sort(([a], [b]) => a - b)
    .map(([frame, strength]) => ({ frame, strength }));
  // Every exported accent/section is an audible, pitched impact, even in a pad section.
  const tonic =
    music.find((event) => ["pad", "bass", "pluck"].includes(event.type))
      ?.note ?? 48;
  for (const { frame, strength } of accents)
    add("crash", frame, tonic, 0.75 * strength, timeline.fps * 0.42);
  music.sort((a, b) => a.frame - b.frame);
  return {
    ...timeline,
    music,
    fills,
    accents: accents.map((event) =>
      timeline.ending?.cadence === "resolve" && event.frame === end
        ? { ...event, strength: RESOLVE_ENDING_ACCENT_STRENGTH }
        : event,
    ),
    accentFrames: accents.map((entry) => entry.frame),
    breaks,
    loop: false,
  };
};

const voice = (event, fps, noise) => {
  const duration = event.durationInFrames / fps;
  const count = Math.max(1, Math.ceil(duration * SR));
  const left = new Float64Array(count);
  const right = new Float64Array(count);
  const high = filter(
    event.type === "kick" ? 4800 : event.type === "hat" ? 6500 : 1400,
    true,
  );
  const low = filter(
    event.type === "hat"
      ? 17000
      : event.type === "snare" || event.type === "clap"
        ? 10500
        : 5200,
  );
  const impactLow = filter(1700);
  const freq = hz(event.note);
  let phase = 0;
  const tonal = ["pad", "pluck", "lead", "bass", "guitar"].includes(event.type);
  for (let i = 0; i < count; i++) {
    const t = i / SR;
    let value = 0;
    switch (event.type) {
      case "kick": {
        phase += (47 + 112 * Math.exp(-t * 40)) / SR;
        const body = sine(phase) * Math.exp(-t * 10);
        const click = high(noise()) * Math.exp(-t * 370) * 0.24;
        value = Math.tanh((body + click) * 1.5) * 0.8 * Math.min(t * 1200, 1);
        break;
      }
      case "snare":
      case "clap": {
        const body = (sine(183 * t) + 0.35 * sine(331 * t)) * Math.exp(-t * 35);
        const hiss = low(high(noise())) * Math.exp(-t * 22);
        value = (body * 0.45 + hiss * 0.55) * Math.min(t * 1800, 1);
        break;
      }
      case "hat": {
        const metal = (sine(6317 * t) + sine(8039 * t) + sine(11113 * t)) / 6;
        value =
          (low(high(noise())) * 0.4 + metal) *
          Math.exp(-t * (event.note === 46 ? 20 : 65)) *
          Math.min(t * 2200, 1);
        break;
      }
      case "crash": {
        phase += (38 + 80 * Math.exp(-t * 32)) / SR;
        value =
          (sine(phase) * Math.exp(-t * 12) +
            impactLow(noise()) * Math.exp(-t * 25) * 0.4 +
            sine(freq * t) * Math.exp(-t * 7) * 0.24) *
          Math.min(t * 1600, 1);
        break;
      }
      case "riser":
        value = low(high(noise())) * (t / duration) ** 2 * 0.4;
        break;
      case "tom":
        value =
          sine(freq * t + 3 * (1 - Math.exp(-t * 20))) *
          Math.exp(-t * 18) *
          Math.min(t * 1800, 1);
        break;
      default: {
        const harmonics =
          sine(freq * t) +
          0.26 * sine(freq * 2 * t) +
          0.12 * sine(freq * 3 * t);
        value =
          harmonics *
          Math.min(t * (event.type === "pluck" ? 350 : 300), 1) *
          Math.exp(-t * (event.type === "pluck" ? 7 : 5));
        if (event.type === "pad")
          value =
            (sine(freq * 0.999 * t) + 0.15 * sine(freq * 2 * t)) *
            Math.min(t / 0.2, 1) *
            Math.min((duration - t) / 0.45, 1);
        if (event.type === "guitar")
          value =
            Math.tanh(harmonics * 2) * Math.min(t * 300, 1) * Math.exp(-t * 6);
      }
    }
    const edge = Math.max(0, Math.min(1, (duration - t) * 200));
    const pan =
      event.type === "hat"
        ? event.note === 46
          ? -0.22
          : 0.25
        : event.type === "pluck"
          ? ((event.note % 3) - 1) * 0.5
          : 0;
    left[i] = value * edge * event.gain * Math.sqrt((1 - pan) / 2);
    right[i] =
      event.type === "pad"
        ? sine(freq * 1.001 * t + 0.15) *
          Math.min(t / 0.2, 1) *
          Math.max(0, Math.min((duration - t) / 0.45, 1)) *
          event.gain *
          Math.SQRT1_2
        : value * edge * event.gain * Math.sqrt((1 + pan) / 2);
    if (!tonal && i === 0) left[i] = right[i] = 0;
  }
  return { left, right };
};

// Iterative radix-2 FFT keeps the lab's dense, seeded room convolution practical
// in JavaScript. There is no platform FFT, worker scheduling or external library.
const fft = (re, im, inverse) => {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let length = 2; length <= n; length *= 2) {
    const angle = (inverse ? TAU : -TAU) / length;
    const wr = Math.cos(angle),
      wi = Math.sin(angle);
    for (let start = 0; start < n; start += length) {
      let ur = 1,
        ui = 0;
      for (let j = 0; j < length / 2; j++) {
        const a = start + j,
          b = a + length / 2;
        const vr = re[b] * ur - im[b] * ui,
          vi = re[b] * ui + im[b] * ur;
        re[b] = re[a] - vr;
        im[b] = im[a] - vi;
        re[a] += vr;
        im[a] += vi;
        const next = ur * wr - ui * wi;
        ui = ur * wi + ui * wr;
        ur = next;
      }
    }
  }
  if (inverse)
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
};

const room = (input, channel, seed) => {
  const length = Math.round(SR * 0.48);
  let n = 1;
  while (n < input.length + length - 1) n *= 2;
  const re = new Float64Array(n),
    im = new Float64Array(n);
  const kr = new Float64Array(n),
    ki = new Float64Array(n);
  const noise = noiseSource(seed + channel + 813);
  const low = filter(5200);
  let power = 0;
  const delay = Math.round((0.022 + channel * 0.007) * SR);
  for (let i = 0; i < length; i++) {
    const value = low(noise()) * Math.exp((-i * 17) / SR);
    if (i >= delay) {
      kr[i] = value;
      power += value * value;
    }
  }
  const scale = 1 / Math.max(Math.sqrt(power), 1e-9);
  for (let i = 0; i < length; i++) kr[i] *= scale;
  re.set(input);
  fft(re, im, false);
  fft(kr, ki, false);
  for (let i = 0; i < n; i++) {
    const value = re[i] * kr[i] - im[i] * ki[i];
    im[i] = re[i] * ki[i] + im[i] * kr[i];
    re[i] = value;
  }
  fft(re, im, true);
  // Roundoff from FFT must not invent a sound before the first causal reflection.
  const first = input.findIndex((sample) => sample !== 0);
  re.fill(0, 0, first < 0 ? re.length : first + delay);
  return re.subarray(0, input.length);
};

const average = (input, size) => {
  const out = new Float64Array(input.length);
  const half = Math.floor(size / 2);
  const at = (i) => input[Math.max(0, Math.min(input.length - 1, i))];
  let sum = 0;
  for (let i = -half; i < size - half; i++) sum += at(i);
  for (let i = 0; i < input.length; i++) {
    out[i] = sum / size;
    sum += at(i + size - half) - at(i - half);
  }
  return out;
};

export const synthesizeV3Timeline = (timeline) => {
  const count = Math.round((timeline.durationInFrames / timeline.fps) * SR);
  const left = new Float64Array(count),
    right = new Float64Array(count);
  const breaks = timeline.breaks ?? [];
  const sample = (frame) => Math.ceil((frame * SR) / timeline.fps);
  // Voices with identical rest masks share a room bus. This preserves selective
  // breaks after reverb without convolving every individual instrument.
  const groups = new Map();
  for (const type of new Set(timeline.music.map((event) => event.type))) {
    const mask = breaks.map((gap) => !gap.keep.includes(type));
    const key = JSON.stringify(mask);
    if (!groups.has(key))
      groups.set(key, {
        mask,
        types: [],
        left: new Float64Array(count),
        right: new Float64Array(count),
        wetL: new Float64Array(count),
        wetR: new Float64Array(count),
      });
    groups.get(key).types.push(type);
  }
  const noise = noiseSource(timeline.seed);
  for (const event of timeline.music) {
    const bus = [...groups.values()].find((group) =>
      group.types.includes(event.type),
    );
    const start = sample(event.frame);
    const sound = voice(event, timeline.fps, noise);
    const wet = ["kick", "snare", "clap", "hat", "tom", "crash"].includes(
      event.type,
    )
      ? 0.3
      : event.type === "bass"
        ? 0
        : 1;
    for (let i = 0; i < sound.left.length && start + i < count; i++) {
      bus.left[start + i] += sound.left[i];
      bus.right[start + i] += sound.right[i];
      bus.wetL[start + i] += sound.left[i] * wet;
      bus.wetR[start + i] += sound.right[i] * wet;
    }
  }
  for (const bus of groups.values()) {
    const gate = (channels) => {
      breaks.forEach((gap, index) => {
        if (!bus.mask[index]) return;
        const from = sample(gap.from),
          to = sample(gap.to);
        for (const channel of channels) {
          const fade = Math.min(sample(2), from);
          for (let i = 0; i < fade; i++)
            channel[from - fade + i] *= 1 - i / fade;
          channel.fill(0, from, to);
        }
      });
    };
    gate([bus.left, bus.right, bus.wetL, bus.wetR]);
    const wetL = room(bus.wetL, 0, timeline.seed),
      wetR = room(bus.wetR, 1, timeline.seed);
    gate([wetL, wetR]);
    for (let i = 0; i < count; i++) {
      left[i] += bus.left[i] + wetL[i] * 0.13;
      right[i] += bus.right[i] + wetR[i] * 0.13;
    }
  }
  const energy = Float64Array.from(
    left,
    (value, i) => (value * value + right[i] * right[i]) / 2,
  );
  const rms = average(energy, Math.round(SR * 0.008));
  const reduction = Float64Array.from(
    rms,
    (value) =>
      Math.max(
        20 * Math.log10(Math.sqrt(Math.max(0, value) + 1e-12) + 1e-9) + 15,
        0,
      ) *
      (1 - 1 / 3),
  );
  const smooth = average(reduction, Math.round(SR * 0.11));
  const window = sample(
    timeline.musicWindowInFrames ?? timeline.durationInFrames,
  );
  const land = timeline.ending && sample(timeline.ending.landFrame);
  let peak = 0;
  for (let i = 0; i < count; i++) {
    let gain = 10 ** (-smooth[i] / 20);
    if (
      i >= window ||
      (land !== undefined && timeline.ending.cadence === "cut" && i >= land)
    )
      gain = 0;
    else if (
      land !== undefined &&
      timeline.ending.cadence === "resolve" &&
      i >= land
    )
      gain *= Math.exp(-(i - land) / (SR * 0.2));
    const ceiling = 10 ** (-1.5 / 20);
    gain *= Math.min(
      1,
      ceiling /
        Math.max(Math.abs(left[i] * gain), Math.abs(right[i] * gain), 1e-9),
    );
    left[i] *= gain;
    right[i] *= gain;
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  return { left, right, peak };
};
