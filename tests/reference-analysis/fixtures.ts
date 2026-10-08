import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { referencePngCrc32 } from "../../scripts/reference-analysis/png";
import { runMediaProcess } from "../../scripts/shared/media-process";
import { resolveMediaToolCommand } from "../../scripts/shared/media-tool-command";

const chunk = (name: string, data: Buffer) => {
  const type = Buffer.from(name);
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length, 0);
  type.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(
    referencePngCrc32(Buffer.concat([type, data])),
    output.length - 4,
  );
  return output;
};

export const fixtureRgbPng = (
  width: number,
  height: number,
  pixel: (x: number, y: number) => number = () => 80,
) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const value = pixel(x, y);
      for (let channel = 0; channel < 3; channel++)
        raw[y * stride + 1 + x * 3 + channel] = value;
    }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

const noise = (x: number, y: number) => {
  let value = Math.imul(x + 1024, 374761393) ^ Math.imul(y + 1024, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return 30 + (((value ^ (value >>> 16)) >>> 0) % 96);
};

export const fixtureTexture = (x: number, y: number) => {
  const left = Math.floor(x),
    top = Math.floor(y),
    dx = x - left,
    dy = y - top;
  return Math.round(
    noise(left, top) * (1 - dx) * (1 - dy) +
      noise(left + 1, top) * dx * (1 - dy) +
      noise(left, top + 1) * (1 - dx) * dy +
      noise(left + 1, top + 1) * dx * dy,
  );
};

export const fixtureGrayFrame = ({
  translationX = 0,
  translationY = 0,
  scale = 1,
  invert = false,
}: {
  translationX?: number;
  translationY?: number;
  scale?: number;
  invert?: boolean;
} = {}) =>
  Uint8Array.from({ length: 64 * 36 }, (_, index) => {
    const x = index % 64,
      y = Math.floor(index / 64);
    const value = fixtureTexture(
      (x - 31.5 - translationX) / scale + 31.5,
      (y - 17.5 - translationY) / scale + 17.5,
    );
    return invert ? 255 - value : value;
  });

// Original synthetic pixels with a known edit and translation, independent of
// any reference project. Encoding uses the same pinned local tool as analysis.
export const createKnownCutReferenceFixture = async ({
  rootDir,
  toolRootDir,
}: {
  readonly rootDir: string;
  readonly toolRootDir: string;
}) => {
  const sourceDir = join(rootDir, "source");
  await mkdir(sourceDir);
  const expected = {
    inputPath: "public/ref.mp4",
    width: 128,
    height: 72,
    fps: 12,
    frameCount: 36,
    authoredCutAtFrame: 24,
    imageTranslationPerFrameIn64x36Grid: 1 / 3,
  } as const;
  for (let frame = 0; frame < expected.frameCount; frame++) {
    const gray = fixtureGrayFrame({
      translationX: frame * expected.imageTranslationPerFrameIn64x36Grid,
      invert: frame >= expected.authoredCutAtFrame,
    });
    await writeFile(
      join(sourceDir, `frame-${String(frame).padStart(3, "0")}.png`),
      fixtureRgbPng(
        expected.width,
        expected.height,
        (x, y) => gray[Math.floor(y / 2) * 64 + Math.floor(x / 2)],
      ),
      { flag: "wx" },
    );
  }
  const encode = await resolveMediaToolCommand({
    rootDir: toolRootDir,
    tool: "ffmpeg",
    args: [
      "-v",
      "error",
      "-f",
      "image2",
      "-framerate",
      String(expected.fps),
      "-i",
      join(sourceDir, "frame-%03d.png"),
      "-frames:v",
      String(expected.frameCount),
      "-c:v",
      "libx264",
      "-crf",
      "12",
      "-pix_fmt",
      "yuv420p",
      "-threads",
      "1",
      "-y",
      join(rootDir, expected.inputPath),
    ],
  });
  const encoded = await runMediaProcess(encode.command, encode.args, {
    cwd: rootDir,
    timeoutMs: 30000,
  });
  if (encoded.status !== 0)
    throw new Error(`Pinned fixture encoding failed: ${encoded.stderr}`);
  return expected;
};
