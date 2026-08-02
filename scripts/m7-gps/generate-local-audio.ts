import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export type GpsM7AudioMode = "write" | "check";

type CueDefinition = Readonly<{
  meaningId:
    | "position-is-time"
    | "two-relativistic-effects"
    | "net-drift"
    | "error-accumulation"
    | "practical-conclusion";
  resourceId: string;
  localPath: string;
  sampleCount: number;
  synth: (sampleIndex: number, sampleCount: number) => number;
}>;

const SAMPLE_RATE = 48_000;

const envelope = (index: number, count: number, attack = 0.035): number => {
  const position = index / Math.max(1, count - 1);
  const attackGain = Math.min(1, position / attack);
  const releaseGain = Math.max(0, 1 - position) ** 2.2;
  return attackGain * releaseGain;
};

const oscillator = (frequency: number, index: number): number =>
  Math.sin((2 * Math.PI * frequency * index) / SAMPLE_RATE);

export const GPS_M7_AUDIO_CUES: readonly CueDefinition[] = [
  {
    meaningId: "position-is-time",
    resourceId: "asset.gps-position-is-time-signal-arrival-pulse",
    localPath:
      "public/projects/gps-relativity/scenes/position-is-time/assets/signal-arrival-pulse.wav",
    sampleCount: 13_440,
    synth: (index, count) => {
      const sweep = 920 - (280 * index) / count;
      return (
        (0.76 * oscillator(sweep, index) +
          0.24 * oscillator(sweep * 1.52, index)) *
        envelope(index, count)
      );
    },
  },
  {
    meaningId: "two-relativistic-effects",
    resourceId: "asset.gps-two-relativistic-effects-dual-clock-pulse",
    localPath:
      "public/projects/gps-relativity/scenes/two-relativistic-effects/assets/dual-clock-pulse.wav",
    sampleCount: 16_320,
    synth: (index, count) => {
      const half = Math.floor(count / 2);
      const local = index < half ? index : index - half;
      const localCount = index < half ? half : count - half;
      const frequency = index < half ? 570 : 830;
      return oscillator(frequency, index) * envelope(local, localCount, 0.06);
    },
  },
  {
    meaningId: "net-drift",
    resourceId: "asset.gps-net-drift-net-drift-lock",
    localPath:
      "public/projects/gps-relativity/scenes/net-drift/assets/net-drift-lock.wav",
    sampleCount: 12_000,
    synth: (index, count) => {
      const progress = index / count;
      const frequency = progress < 0.45 ? 640 : 960;
      return (
        (0.82 * oscillator(frequency, index) +
          0.18 * oscillator(frequency * 2, index)) *
        envelope(index, count, 0.025)
      );
    },
  },
  {
    meaningId: "error-accumulation",
    resourceId: "asset.gps-error-accumulation-alert",
    localPath:
      "public/projects/gps-relativity/scenes/error-accumulation/assets/error-accumulation-alert.wav",
    sampleCount: 18_240,
    synth: (index, count) => {
      const third = Math.floor(count / 3);
      const local = index % third;
      const gate = local < third * 0.58 ? 1 : 0;
      return (
        oscillator(440 + Math.floor(index / third) * 54, index) *
        envelope(local, third, 0.04) *
        gate
      );
    },
  },
  {
    meaningId: "practical-conclusion",
    resourceId: "asset.gps-practical-conclusion-blue-dot-lock",
    localPath:
      "public/projects/gps-relativity/scenes/practical-conclusion/assets/blue-dot-lock.wav",
    sampleCount: 14_400,
    synth: (index, count) => {
      const progress = index / count;
      const frequency = 680 + 500 * progress;
      return (
        (0.72 * oscillator(frequency, index) +
          0.28 * oscillator(frequency * 0.5, index)) *
        envelope(index, count, 0.04)
      );
    },
  },
] as const;

const createCanonicalWav = (cue: CueDefinition): Buffer => {
  const pcm = Buffer.alloc(cue.sampleCount * 2);
  for (let index = 0; index < cue.sampleCount; index += 1) {
    const normalized = Math.max(
      -1,
      Math.min(1, cue.synth(index, cue.sampleCount)),
    );
    pcm.writeInt16LE(Math.round(normalized * 7_200), index * 2);
  }
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(SAMPLE_RATE, 24);
  wav.writeUInt32LE(SAMPLE_RATE * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(pcm.length, 40);
  for (let index = 0; index < pcm.length; index += 1) {
    wav[44 + index] = pcm[index] ?? 0;
  }
  return wav;
};

const assertInsideRoot = (rootDir: string, repositoryPath: string): string => {
  const root = resolve(rootDir);
  const destination = resolve(rootDir, repositoryPath);
  if (!destination.startsWith(`${root}${sep}`)) {
    throw new Error("M7 GPS audio path escapes the repository root.");
  }
  return destination;
};

const writeOrCheckBytes = async ({
  destination,
  expected,
  mode,
}: {
  readonly destination: string;
  readonly expected: Buffer;
  readonly mode: GpsM7AudioMode;
}): Promise<void> => {
  let current: Buffer | undefined;
  try {
    const metadata = await lstat(destination);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new Error("M7 GPS audio output must be a regular file.");
    }
    current = await readFile(destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (
    current !== undefined &&
    current.length === expected.length &&
    current.every((value, index) => value === expected[index])
  )
    return;
  if (mode === "check") {
    throw new Error(
      current === undefined
        ? "M7 GPS audio output is missing."
        : "M7 GPS audio output bytes are stale.",
    );
  }
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}-${randomUUID()}`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(Uint8Array.from(Array.from(expected)));
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
};

export const generateGpsLocalAudio = async ({
  rootDir,
  mode,
}: {
  readonly rootDir: string;
  readonly mode: GpsM7AudioMode;
}): Promise<void> => {
  const outputs = GPS_M7_AUDIO_CUES.map((cue) => ({
    destination: assertInsideRoot(rootDir, cue.localPath),
    expected: createCanonicalWav(cue),
  }));
  for (const output of outputs) {
    await writeOrCheckBytes({ ...output, mode });
  }
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const command = process.argv[2];
  if (
    process.argv.length !== 3 ||
    (command !== "write" && command !== "check")
  ) {
    throw new Error("Expected exactly write or check.");
  }
  generateGpsLocalAudio({ rootDir: process.cwd(), mode: command }).catch(
    (error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "M7 GPS audio generation failed."}\n`,
      );
      process.exitCode = 1;
    },
  );
}
