import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export const SOUND_EFFECT_SAMPLE_RATE = 48_000;
export const SOUND_EFFECT_PUBLIC_ROOT =
  "public/assets/axmorf-shared/audio/sound-effects";

export const soundEffectDefinitions = [
  { name: "ui-click", duration: 0.08, syncTime: 0, peak: 0.28 },
  { name: "soft-pop", duration: 0.18, syncTime: 0, peak: 0.36 },
  { name: "snap-lock", duration: 0.12, syncTime: 0, peak: 0.32 },
  { name: "whoosh-short", duration: 0.36, syncTime: 0.14, peak: 0.3 },
  { name: "whoosh-sweep", duration: 0.65, syncTime: 0.27, peak: 0.32 },
  { name: "soft-impact", duration: 0.32, syncTime: 0, peak: 0.42 },
  { name: "confirm-chime", duration: 0.5, syncTime: 0, peak: 0.3 },
  { name: "sparkle-accent", duration: 0.6, syncTime: 0, peak: 0.26 },
  { name: "mouse-down", duration: 0.085, syncTime: 0, peak: 0.32 },
  { name: "mouse-up", duration: 0.075, syncTime: 0, peak: 0.28 },
  { name: "mouse-click", duration: 0.15, syncTime: 0, peak: 0.34 },
  { name: "mouse-double-click", duration: 0.34, syncTime: 0, peak: 0.34 },
  { name: "mouse-right-click", duration: 0.16, syncTime: 0, peak: 0.34 },
  { name: "mouse-wheel-tick", duration: 0.1, syncTime: 0, peak: 0.26 },
  { name: "keyboard-tap", duration: 0.12, syncTime: 0, peak: 0.3 },
  { name: "typing-burst", duration: 0.55, syncTime: 0, peak: 0.3 },
  { name: "toggle-switch", duration: 0.15, syncTime: 0, peak: 0.3 },
  { name: "drag-pickup", duration: 0.2, syncTime: 0, peak: 0.28 },
  { name: "drop-settle", duration: 0.26, syncTime: 0, peak: 0.36 },
  { name: "swish-reverse", duration: 0.42, syncTime: 0.3, peak: 0.3 },
  { name: "card-flip", duration: 0.28, syncTime: 0.12, peak: 0.28 },
  { name: "notification-ping", duration: 0.45, syncTime: 0, peak: 0.28 },
  { name: "warning-blip", duration: 0.35, syncTime: 0, peak: 0.3 },
  { name: "success-arpeggio", duration: 0.7, syncTime: 0, peak: 0.3 },
] as const;

type SoundEffectDefinition = (typeof soundEffectDefinitions)[number];

export const soundEffectPublicPath = ({ name }: SoundEffectDefinition) =>
  `${SOUND_EFFECT_PUBLIC_ROOT}/axmorf-${name}-v1.wav`;

const sine = (cycles: number) => Math.sin(2 * Math.PI * cycles);

const envelope = (time: number, attack: number, decay: number) =>
  time < 0 ? 0 : Math.min(1, time / attack) * Math.exp(-time / decay);

const note = (time: number, frequency: number, decay: number) =>
  envelope(time, 0.002, decay) *
  (sine(frequency * time) + 0.12 * sine(2.01 * frequency * time));

const mechanicalClick = (
  time: number,
  frequency: number,
  decay: number,
  noise: number,
) =>
  envelope(time, 0.0007, decay) *
  (0.52 * sine(frequency * time) +
    0.2 * sine(2.63 * frequency * time) +
    0.65 * noise);

const createNoise = () => {
  let state = 0x41584d46;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x80000000 - 1;
  };
};

/** Offline synthesis only. Renderers consume the frozen WAV bytes from the seed. */
export const renderSoundEffectWav = (
  definition: SoundEffectDefinition,
): Buffer => {
  const { name, duration, peak } = definition;
  const sampleCount = Math.round(duration * SOUND_EFFECT_SAMPLE_RATE);
  const samples = new Float64Array(sampleCount * 2);
  const noise = createNoise();
  let lowNoise = 0;
  let bandNoise = 0;
  let maximum = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / SOUND_EFFECT_SAMPLE_RATE;
    const progress = index / (sampleCount - 1);
    const whiteNoise = noise();
    lowNoise += 0.035 * (whiteNoise - lowNoise);
    bandNoise += 0.24 * (whiteNoise - bandNoise);
    let sample: number;
    let pan = 0;
    switch (name) {
      case "ui-click":
        sample =
          envelope(time, 0.0008, 0.008) *
          (0.6 * (bandNoise - lowNoise) + 0.4 * sine(1650 * time));
        break;
      case "soft-pop":
        sample =
          envelope(time, 0.0018, 0.028) *
          (sine(160 * time + 420 * 0.02 * (1 - Math.exp(-time / 0.02))) +
            0.08 * bandNoise);
        break;
      case "snap-lock":
        sample =
          envelope(time, 0.0008, 0.009) *
            (0.7 * bandNoise + 0.3 * sine(2400 * time)) +
          0.28 * note(time - 0.026, 740, 0.014);
        break;
      case "whoosh-short":
      case "whoosh-sweep": {
        const width = name === "whoosh-short" ? 0.06 : 0.115;
        const swell = Math.exp(
          -0.5 * ((time - definition.syncTime) / width) ** 2,
        );
        sample =
          swell *
          (bandNoise -
            lowNoise +
            0.045 * sine(280 * time + (1200 * time * time) / duration));
        pan = -0.32 + 0.64 * progress;
        break;
      }
      case "soft-impact":
        sample =
          envelope(time, 0.0015, 0.065) *
            sine(62 * time + 95 * 0.025 * (1 - Math.exp(-time / 0.025))) +
          0.2 * envelope(time, 0.0008, 0.013) * bandNoise;
        break;
      case "confirm-chime":
        sample =
          note(time, 783.991, 0.085) +
          0.72 * note(time - 0.07, 1174.659, 0.105);
        break;
      case "sparkle-accent":
        sample =
          note(time, 1567.982, 0.105) +
          0.58 * note(time - 0.045, 2093.005, 0.13) +
          0.36 * note(time - 0.09, 2637.02, 0.15);
        pan = 0.2 * sine(progress);
        break;
      case "mouse-down":
        sample = mechanicalClick(time, 1280, 0.007, bandNoise - lowNoise);
        break;
      case "mouse-up":
        sample = mechanicalClick(time, 1840, 0.005, bandNoise - lowNoise);
        break;
      case "mouse-click":
      case "mouse-double-click":
        sample =
          mechanicalClick(time, 1280, 0.007, bandNoise - lowNoise) +
          0.74 *
            mechanicalClick(time - 0.055, 1840, 0.005, bandNoise - lowNoise);
        if (name === "mouse-double-click") {
          sample +=
            0.94 *
              mechanicalClick(time - 0.18, 1280, 0.007, bandNoise - lowNoise) +
            0.7 *
              mechanicalClick(time - 0.235, 1840, 0.005, bandNoise - lowNoise);
        }
        break;
      case "mouse-right-click":
        sample =
          mechanicalClick(time, 1120, 0.008, bandNoise - lowNoise) +
          0.7 *
            mechanicalClick(time - 0.06, 1670, 0.0055, bandNoise - lowNoise);
        break;
      case "mouse-wheel-tick":
        sample =
          mechanicalClick(time, 930, 0.004, bandNoise - lowNoise) +
          0.3 *
            mechanicalClick(time - 0.012, 1520, 0.003, bandNoise - lowNoise);
        break;
      case "keyboard-tap":
        sample =
          mechanicalClick(time, 560, 0.013, bandNoise) +
          0.18 * note(time - 0.025, 1120, 0.008);
        break;
      case "typing-burst":
        sample =
          mechanicalClick(time, 560, 0.013, bandNoise) +
          0.85 * mechanicalClick(time - 0.085, 670, 0.011, bandNoise) +
          0.92 * mechanicalClick(time - 0.175, 510, 0.013, bandNoise) +
          0.8 * mechanicalClick(time - 0.295, 730, 0.01, bandNoise);
        break;
      case "toggle-switch":
        sample =
          mechanicalClick(time, 860, 0.012, bandNoise) +
          0.36 * mechanicalClick(time - 0.023, 1210, 0.007, bandNoise);
        break;
      case "drag-pickup":
        sample =
          envelope(time, 0.001, 0.018) *
          (sine(420 * time + 1900 * time * time) + 0.15 * bandNoise);
        break;
      case "drop-settle":
        sample =
          mechanicalClick(time, 280, 0.024, bandNoise) +
          0.38 * mechanicalClick(time - 0.05, 370, 0.015, lowNoise) +
          0.12 * mechanicalClick(time - 0.088, 460, 0.011, lowNoise);
        break;
      case "swish-reverse": {
        const rise = Math.exp(-0.5 * ((time - 0.3) / 0.07) ** 2);
        sample =
          rise *
          (bandNoise -
            lowNoise +
            0.045 * sine(200 * time + 3000 * time * time));
        pan = 0.3 - 0.6 * progress;
        break;
      }
      case "card-flip":
        sample =
          (Math.exp(-0.5 * ((time - 0.035) / 0.02) ** 2) * 0.48 +
            Math.exp(-0.5 * ((time - 0.12) / 0.027) ** 2)) *
          (0.7 * bandNoise + 0.15 * whiteNoise);
        pan = -0.15 + 0.3 * progress;
        break;
      case "notification-ping":
        sample =
          note(time, 1046.503, 0.075) + 0.24 * note(time, 2790.675, 0.047);
        break;
      case "warning-blip":
        sample =
          note(time, 440, 0.029) + 0.86 * note(time - 0.11, 415.305, 0.032);
        break;
      case "success-arpeggio":
        sample =
          note(time, 523.251, 0.11) +
          0.8 * note(time - 0.065, 659.255, 0.12) +
          0.65 * note(time - 0.13, 783.991, 0.15);
        break;
    }
    // Zero both endpoints and taper the tail to avoid clicks when reused as a cue.
    const edgeFade =
      Math.min(1, time / 0.0015) *
      Math.min(
        1,
        (sampleCount - 1 - index) / (SOUND_EFFECT_SAMPLE_RATE * 0.018),
      );
    const left = sample * edgeFade * Math.sqrt((1 - pan) / 2);
    const right = sample * edgeFade * Math.sqrt((1 + pan) / 2);
    samples[index * 2] = left;
    samples[index * 2 + 1] = right;
    maximum = Math.max(maximum, Math.abs(left), Math.abs(right));
  }

  const dataSize = sampleCount * 4;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(SOUND_EFFECT_SAMPLE_RATE, 24);
  wav.writeUInt32LE(SOUND_EFFECT_SAMPLE_RATE * 4, 28);
  wav.writeUInt16LE(4, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < samples.length; index += 1) {
    wav.writeInt16LE(
      Math.round((samples[index] / maximum) * peak * 32767),
      44 + index * 2,
    );
  }
  return wav;
};

export const generateSoundEffectAssets = async ({
  rootDir,
  mode,
}: {
  readonly rootDir: string;
  readonly mode: "write" | "check";
}) => {
  for (const definition of soundEffectDefinitions) {
    const path = join(
      rootDir,
      "packages/studio/src/runtime/workspace-seed/files",
      soundEffectPublicPath(definition),
    );
    const bytes = renderSoundEffectWav(definition);
    try {
      const metadata = await lstat(path);
      if (!metadata.isFile() || metadata.isSymbolicLink()) {
        throw new Error(
          `Sound effect must be a regular file: ${definition.name}.`,
        );
      }
      const current = await readFile(path);
      if (!current.equals(bytes)) {
        throw new Error(`Sound effect bytes conflict: ${definition.name}.`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (mode === "check") {
        throw new Error(`Sound effect is missing: ${definition.name}.`);
      }
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes, { flag: "wx" });
    }
  }
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const mode = process.argv[2];
  if (process.argv.length !== 3 || (mode !== "write" && mode !== "check")) {
    throw new Error("Expected exactly write or check.");
  }
  generateSoundEffectAssets({ rootDir: process.cwd(), mode }).catch(
    (error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "Sound effect generation failed."}\n`,
      );
      process.exitCode = 1;
    },
  );
}
