import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";

import { runMediaProcess } from "../shared/media-process";
import { resolveMediaToolCommand } from "../shared/media-tool-command";
import type { ProcessRunner } from "../shared/process";

/** Size of the grayscale thumbnail used to compare review frames. */
export const FRAME_SIGNATURE_SIZE = 64;

const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");

/** Decodes an 8-bit grayscale, non-interlaced PNG (what ffmpeg writes for format=gray). */
export const decodeGrayPng = (bytes: Buffer) => {
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("Frame signature is not a PNG.");
  }
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  for (let offset = 8; offset < bytes.length; ) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 0 || data[12] !== 0) {
        throw new Error(
          "Frame signature must be 8-bit grayscale, non-interlaced.",
        );
      }
    } else if (type === "IDAT") {
      idat.push(data);
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const pixels = new Uint8Array(width * height);
  for (let row = 0; row < height; row++) {
    const filter = raw[row * (width + 1)];
    const line = raw.subarray(row * (width + 1) + 1, (row + 1) * (width + 1));
    for (let x = 0; x < width; x++) {
      const left = x > 0 ? pixels[row * width + x - 1]! : 0;
      const up = row > 0 ? pixels[(row - 1) * width + x]! : 0;
      const upLeft = x > 0 && row > 0 ? pixels[(row - 1) * width + x - 1]! : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      } else if (filter !== 0) {
        throw new Error(`Unsupported PNG filter ${filter}.`);
      }
      pixels[row * width + x] = (line[x]! + predictor) & 0xff;
    }
  }
  return { width, height, pixels };
};

/** Average per-pixel difference on a 0–255 scale. */
export const meanAbsoluteDifference = (left: Uint8Array, right: Uint8Array) => {
  if (left.length !== right.length || left.length === 0) {
    throw new Error("Frame signatures differ in size.");
  }
  let total = 0;
  for (let index = 0; index < left.length; index++) {
    total += Math.abs(left[index]! - right[index]!);
  }
  return total / left.length;
};

/** Writes a small grayscale PNG of an image and returns its pixels. */
export const readFrameSignature = async ({
  rootDir,
  imagePath,
  signaturePath,
  runProcess = runMediaProcess,
}: {
  readonly rootDir: string;
  readonly imagePath: string;
  readonly signaturePath: string;
  readonly runProcess?: ProcessRunner;
}) => {
  const size = FRAME_SIGNATURE_SIZE;
  const command = await resolveMediaToolCommand({
    rootDir,
    tool: "ffmpeg",
    args: [
      "-v",
      "error",
      "-y",
      "-i",
      imagePath,
      "-vf",
      `scale=${size}:${size},format=gray`,
      "-frames:v",
      "1",
      signaturePath,
    ],
  });
  const result = await runProcess(command.command, command.args, {
    cwd: rootDir,
  });
  if (result.status !== 0) {
    throw new Error(`Could not read review frame ${imagePath}.`);
  }
  return decodeGrayPng(await readFile(signaturePath)).pixels;
};
