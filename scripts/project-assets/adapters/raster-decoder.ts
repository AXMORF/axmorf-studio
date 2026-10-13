import {
  lstat,
  mkdtemp,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runMediaProcess } from "../../shared/media-process";
import { resolveMediaToolCommand } from "../../shared/media-tool-command";
import type { ProcessRunner } from "../../shared/process";
import type { InspectedImage } from "../domain/image";

const assertCompleteJpeg = (data: Buffer) => {
  let offset = 2;
  let hasPixels = false;
  while (offset < data.length) {
    if (data[offset++] !== 0xff) break;
    while (data[offset] === 0xff) offset += 1;
    const marker = data[offset++];
    if (marker === 0xd9) {
      if (hasPixels && offset === data.length) return;
      break;
    }
    if (marker === 0x01) continue;
    if (
      marker === undefined ||
      marker === 0xd8 ||
      (marker >= 0xd0 && marker <= 0xd7) ||
      offset + 2 > data.length
    )
      break;
    const size = data.readUInt16BE(offset);
    if (size < 2 || offset + size > data.length) break;
    if (marker !== 0xda) {
      offset += size;
      continue;
    }
    const components = data[offset + 2]!;
    if (components < 1 || components > 4 || size !== 6 + 2 * components) break;
    offset += size;
    let scanBytes = 0;
    while (offset < data.length) {
      if (data[offset] !== 0xff) {
        scanBytes += 1;
        offset += 1;
        continue;
      }
      const next = data[offset + 1];
      if (next === 0) {
        scanBytes += 1;
        offset += 2;
        continue;
      }
      if (next !== undefined && next >= 0xd0 && next <= 0xd7) {
        offset += 2;
        continue;
      }
      if (next === 0xff) {
        offset += 1;
        continue;
      }
      break;
    }
    if (scanBytes === 0) break;
    hasPixels = true;
  }
  throw new Error("Generated JPEG container has no complete pixel scan.");
};

const assertCompleteContainer = (bytes: Uint8Array, image: InspectedImage) => {
  const data = Buffer.from(bytes);
  if (image.mimeType === "image/png") {
    let offset = 8;
    let hasPixels = false;
    while (offset + 12 <= data.length) {
      const size = data.readUInt32BE(offset);
      const kind = data.toString("ascii", offset + 4, offset + 8);
      const next = offset + size + 12;
      if (next > data.length) break;
      if (kind === "acTL")
        throw new Error("Generated artwork must be a static image.");
      if (kind === "IDAT") hasPixels = true;
      if (kind === "IEND") {
        if (size === 0 && hasPixels && next === data.length) return;
        break;
      }
      offset = next;
    }
    throw new Error("Generated PNG container is incomplete.");
  }
  if (image.mimeType === "image/jpeg") {
    assertCompleteJpeg(data);
    return;
  }
  if (data.readUInt32LE(4) + 8 !== data.length)
    throw new Error("Generated WebP container is incomplete.");
  let offset = 12;
  let pixelChunks = 0;
  while (offset + 8 <= data.length) {
    const kind = data.toString("ascii", offset, offset + 4);
    const size = data.readUInt32LE(offset + 4);
    if (
      kind === "ANIM" ||
      kind === "ANMF" ||
      (kind === "VP8X" && (data[offset + 8]! & 2) !== 0)
    )
      throw new Error("Generated artwork must be a static image.");
    if (kind === "VP8 " || kind === "VP8L") {
      if (size <= (kind === "VP8 " ? 10 : 5))
        throw new Error("Generated WebP chunk has no pixel payload.");
      pixelChunks += 1;
    }
    offset += 8 + size + (size % 2);
  }
  if (offset !== data.length || pixelChunks !== 1)
    throw new Error("Generated WebP chunks are incomplete.");
};

/** Decode the frozen bytes, never the candidate path; a successful process alone may emit zero frames. */
export const validateRasterImageBytes = async ({
  rootDir,
  bytes,
  image,
  resolveMediaTool = resolveMediaToolCommand,
  runProcess = runMediaProcess,
}: {
  readonly rootDir: string;
  readonly bytes: Uint8Array;
  readonly image: InspectedImage;
  readonly resolveMediaTool?: typeof resolveMediaToolCommand;
  readonly runProcess?: ProcessRunner;
}) => {
  assertCompleteContainer(bytes, image);
  const staging = await mkdtemp(
    join(await realpath(tmpdir()), "axmorf-artwork-decode-"),
  );
  try {
    const input = join(staging, `source.${image.extension}`);
    const output = join(staging, "frame-%02d.rgba");
    await writeFile(input, bytes, { flag: "wx", mode: 0o600 });
    const command = await resolveMediaTool({
      rootDir,
      tool: "ffmpeg",
      args: [
        "-hide_banner",
        "-v",
        "error",
        "-xerror",
        "-err_detect",
        "crccheck+bitstream+buffer+explode",
        "-i",
        input,
        "-map",
        "0:v:0",
        "-an",
        "-sn",
        "-dn",
        // Scaling happens after full pixel decoding and keeps validation output bounded.
        "-vf",
        "scale=1:1:flags=neighbor",
        "-c:v",
        "rawvideo",
        "-pix_fmt",
        "rgba",
        "-frames:v",
        "2",
        "-f",
        "image2",
        "-n",
        output,
      ],
    });
    const result = await runProcess(command.command, command.args, {
      cwd: rootDir,
      timeoutMs: 30_000,
    });
    if (result.status !== 0 || result.stderr.trim() !== "") {
      const diagnostic = result.stderr
        .trim()
        .replaceAll(staging, "<decode-temp>")
        .slice(0, 1500);
      throw new Error(
        `Generated artwork pixel decoding failed (exit ${result.status}).${diagnostic === "" ? "" : ` ${diagnostic}`}`,
      );
    }
    const frames = (await readdir(staging)).filter((name) =>
      name.startsWith("frame-"),
    );
    if (frames.length === 0)
      throw new Error(
        "Generated artwork decoder did not produce a complete frame.",
      );
    if (frames.length !== 1 || frames[0] !== "frame-01.rgba")
      throw new Error(
        "Generated artwork must decode to exactly one complete frame.",
      );
    const decoded = await lstat(join(staging, frames[0]));
    if (!decoded.isFile() || decoded.isSymbolicLink() || decoded.size !== 4)
      throw new Error(
        "Generated artwork must decode to exactly one complete frame.",
      );
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
};
