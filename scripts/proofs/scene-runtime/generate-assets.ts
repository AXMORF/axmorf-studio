import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const PROOF_SHAPE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 380" role="img" aria-label="M6 deterministic proof shape">
  <rect width="560" height="380" rx="28" fill="#08111f"/>
  <path d="M112 252 L210 104 L292 202 L360 128 L448 252 Z" fill="#22d3ee" opacity="0.88"/>
  <circle cx="280" cy="190" r="112" fill="none" stroke="#f8fafc" stroke-width="12"/>
</svg>
`;

const createPulseWav = (): Uint8Array => {
  const sampleRate = 48_000;
  const sampleCount = 8_640;
  const pcm = Buffer.alloc(sampleCount * 2);
  for (let index = 0; index < sampleCount; index += 1) {
    const envelope = Math.max(0, 1 - index / sampleCount);
    const sample = Math.sin((2 * Math.PI * 660 * index) / sampleRate);
    pcm.writeInt16LE(Math.round(sample * envelope * 8_000), index * 2);
  }
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(pcm.length, 40);
  for (let index = 0; index < pcm.length; index += 1) {
    wav[44 + index] = pcm[index] ?? 0;
  }
  return Uint8Array.from(wav);
};

const createBookendChimeWav = ({
  frequencies,
  sampleCount,
}: {
  readonly frequencies: readonly number[];
  readonly sampleCount: number;
}): Uint8Array => {
  const sampleRate = 48_000;
  const pcm = Buffer.alloc(sampleCount * 2);
  for (let index = 0; index < sampleCount; index += 1) {
    const progress = index / sampleCount;
    const attack = Math.min(1, progress / 0.035);
    const release = Math.max(0, 1 - progress) ** 2;
    const chord = frequencies.reduce(
      (sum, frequency) =>
        sum + Math.sin((2 * Math.PI * frequency * index) / sampleRate),
      0,
    );
    const sample = (chord / frequencies.length) * attack * release;
    pcm.writeInt16LE(Math.round(sample * 7_000), index * 2);
  }
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(pcm.length, 40);
  for (let index = 0; index < pcm.length; index += 1) {
    wav[44 + index] = pcm[index] ?? 0;
  }
  return Uint8Array.from(wav);
};

const writeBytesAtomic = async (
  destination: string,
  bytes: Uint8Array,
  mode: "write" | "check",
): Promise<void> => {
  try {
    const current = await readFile(destination);
    if (
      current.length === bytes.length &&
      current.every((value, index) => value === bytes[index])
    )
      return;
    if (mode === "check")
      throw new Error("Scene runtime proof asset bytes are stale.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    if (mode === "check") throw new Error("M6 proof asset is missing.");
  }
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}`;
  const handle = await open(temporary, "wx");
  try {
    await handle.writeFile(Uint8Array.from(bytes));
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

export const generateM6ProofAssets = async ({
  rootDir,
  mode,
}: {
  readonly rootDir: string;
  readonly mode: "write" | "check";
}) => {
  await Promise.all([
    writeBytesAtomic(
      join(rootDir, "public/assets/library/m6-scene-runtime/proof-pulse.wav"),
      createPulseWav(),
      mode,
    ),
    writeBytesAtomic(
      join(rootDir, "public/assets/library/m6-scene-runtime/proof-shape.svg"),
      Uint8Array.from(Buffer.from(PROOF_SHAPE_SVG, "utf8")),
      mode,
    ),
    writeBytesAtomic(
      join(
        rootDir,
        "public/assets/library/story-bookends/axmorf-intro-chime.wav",
      ),
      createBookendChimeWav({
        frequencies: [440, 554.365, 659.255],
        sampleCount: 28_800,
      }),
      mode,
    ),
    writeBytesAtomic(
      join(
        rootDir,
        "public/assets/library/story-bookends/axmorf-outro-chime.wav",
      ),
      createBookendChimeWav({
        frequencies: [659.255, 554.365, 440],
        sampleCount: 48_000,
      }),
      mode,
    ),
  ]);
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
  generateM6ProofAssets({ rootDir: process.cwd(), mode: command }).catch(
    (error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : "M6 asset generation failed."}\n`,
      );
      process.exitCode = 1;
    },
  );
}
