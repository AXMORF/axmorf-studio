import { Buffer } from "node:buffer";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const sampleRate = 48_000;
const channels = 2;

const clamp = (value, minimum, maximum) =>
  Math.max(minimum, Math.min(maximum, value));

const smoothstep = (start, end, value) => {
  const progress = clamp((value - start) / (end - start), 0, 1);
  return progress * progress * (3 - 2 * progress);
};

const envelope = (time, attack, releaseStart, duration) =>
  smoothstep(0, attack, time) * (1 - smoothstep(releaseStart, duration, time));

const createNoise = () => {
  let state = 0x41584d4f;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000 / 0.5 - 1;
  };
};

const writeWav = async ({ durationInSeconds, outputPath, render }) => {
  const sampleCount = Math.round(durationInSeconds * sampleRate);
  const pcm = Buffer.alloc(sampleCount * channels * 2);
  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    const [left, right] = render(time, index);
    pcm.writeInt16LE(
      Math.round(clamp(left, -1, 1) * 32_767),
      index * channels * 2,
    );
    pcm.writeInt16LE(
      Math.round(clamp(right, -1, 1) * 32_767),
      index * channels * 2 + 2,
    );
  }

  const wav = Buffer.alloc(44 + pcm.length);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * channels * 2, 28);
  wav.writeUInt16LE(channels * 2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(pcm.length, 40);
  pcm.copy(wav, 44);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, wav);
};

const renderCinematicImpact = () => {
  const noise = createNoise();
  let smoothedNoise = 0;
  return (time) => {
    smoothedNoise = smoothedNoise * 0.93 + noise() * 0.07;
    const impactEnvelope = Math.exp(-time * 1.35);
    const subPhase =
      2 *
      Math.PI *
      (39 * time + ((86 - 39) * (1 - Math.exp(-time * 2.8))) / 2.8);
    const body =
      Math.sin(subPhase) * 0.48 +
      Math.sin(subPhase * 2.01 + 0.3) * 0.16 +
      Math.sin(subPhase * 3.98 + 1.2) * 0.06;
    const hit = smoothedNoise * Math.exp(-time * 8.5) * 1.7;
    const shimmerEnvelope =
      smoothstep(0.04, 0.12, time) * Math.exp(-Math.max(0, time - 0.08) * 1.6);
    const shimmerLeft =
      (Math.sin(2 * Math.PI * 523.25 * time) +
        Math.sin(2 * Math.PI * 783.99 * time + 0.7) * 0.55 +
        Math.sin(2 * Math.PI * 1_174.66 * time + 1.3) * 0.28) *
      0.12 *
      shimmerEnvelope;
    const shimmerRight =
      (Math.sin(2 * Math.PI * 523.25 * time + 0.08) +
        Math.sin(2 * Math.PI * 783.99 * time + 0.82) * 0.55 +
        Math.sin(2 * Math.PI * 1_174.66 * time + 1.46) * 0.28) *
      0.12 *
      shimmerEnvelope;
    const tail = envelope(time, 0.005, 3.35, 4) * impactEnvelope;
    return [
      (body + hit + shimmerLeft) * tail * 0.88,
      (body + hit * 0.94 + shimmerRight) * tail * 0.88,
    ];
  };
};

const chordFrequencies = [
  [220, 261.626, 329.628],
  [174.614, 220, 261.626],
  [261.626, 329.628, 391.995],
  [195.998, 246.942, 293.665],
];
const bassFrequencies = [55, 43.654, 65.406, 48.999];

const renderClosingPulse = () => (time) => {
  const section = Math.min(3, Math.floor(time / 2));
  const chord = chordFrequencies[section];
  const sectionTime = time - section * 2;
  const trackEnvelope = envelope(time, 0.18, 7.35, 8);
  const chordEnvelope =
    smoothstep(0, 0.12, sectionTime) * (1 - smoothstep(1.72, 2, sectionTime));
  const padLeft = chord.reduce(
    (sum, frequency, index) =>
      sum +
      Math.sin(2 * Math.PI * frequency * time + index * 0.37) * 0.095 +
      Math.sin(2 * Math.PI * frequency * 2.002 * time + index * 0.61) * 0.022,
    0,
  );
  const padRight = chord.reduce(
    (sum, frequency, index) =>
      sum +
      Math.sin(2 * Math.PI * frequency * time + index * 0.37 + 0.06) * 0.095 +
      Math.sin(2 * Math.PI * frequency * 1.998 * time + index * 0.61 + 0.1) *
        0.022,
    0,
  );

  const beatTime = time % 0.5;
  const bass =
    Math.sin(2 * Math.PI * bassFrequencies[section] * time) *
    Math.exp(-beatTime * 4.8) *
    0.21;
  const kickPhase =
    2 *
    Math.PI *
    (48 * beatTime + ((112 - 48) * (1 - Math.exp(-beatTime * 18))) / 18);
  const kick = Math.sin(kickPhase) * Math.exp(-beatTime * 14) * 0.24;

  const eighth = Math.floor(time / 0.25);
  const arpFrequency = chord[eighth % chord.length] * 2;
  const arpTime = time % 0.25;
  const arpeggio =
    Math.sin(2 * Math.PI * arpFrequency * time) *
    Math.exp(-arpTime * 13) *
    0.09;
  const width = Math.sin(2 * Math.PI * time * 0.18) * 0.018;

  return [
    (padLeft * chordEnvelope + bass + kick + arpeggio * (1 - width)) *
      trackEnvelope,
    (padRight * chordEnvelope + bass + kick + arpeggio * (1 + width)) *
      trackEnvelope,
  ];
};

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const audioRoot = join(
  packageRoot,
  "src/runtime/workspace-seed/files/public/assets/axmorf-shared/audio",
);

await writeWav({
  durationInSeconds: 4,
  outputPath: join(audioRoot, "sound-effects/axmorf-cinematic-impact-v1.wav"),
  render: renderCinematicImpact(),
});
await writeWav({
  durationInSeconds: 8,
  outputPath: join(audioRoot, "music/axmorf-closing-pulse-v1.wav"),
  render: renderClosingPulse(),
});

process.stdout.write("Generated tracked AXMORF Workspace audio.\n");
