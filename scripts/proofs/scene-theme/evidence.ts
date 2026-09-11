import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";

import { build } from "esbuild";

import { serializeCanonicalJson } from "../../../packages/studio/src/contracts/fingerprint";
import type { VisualTheme } from "../../../packages/studio/src/contracts/visual-theme";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

export const checksum = (bytes: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

export const fileEvidence = async (rootDir: string, localPath: string) => {
  const path = join(rootDir, localPath);
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Proof evidence must be a regular file: ${localPath}`);
  }
  return {
    localPath,
    sizeBytes: stat.size,
    checksum: checksum(await readFile(path)),
  };
};

/** Bind evidence to the actual transitive source graph used by this entrypoint. */
export const collectProofSourceEvidence = async (rootDir: string) => {
  const result = await build({
    absWorkingDir: rootDir,
    entryPoints: ["proofs/scene-theme/source/index.ts"],
    bundle: true,
    write: false,
    metafile: true,
    packages: "external",
    platform: "browser",
    logLevel: "silent",
  });
  const paths = [
    ...new Set([
      ...Object.keys(result.metafile.inputs).map((path) =>
        relative(rootDir, resolve(rootDir, path)),
      ),
      "package-lock.json",
      "tsconfig.json",
      "scripts/proofs/scene-theme/evidence.ts",
      "scripts/proofs/scene-theme/render.ts",
    ]),
  ].sort();
  const files = await Promise.all(
    paths.map((path) => fileEvidence(rootDir, path)),
  );
  return { files, fingerprint: checksum(serializeCanonicalJson(files)) };
};

export const collectRemotionVersions = async () => {
  const names = ["remotion", "@remotion/bundler", "@remotion/renderer"];
  const versions = Object.fromEntries(
    await Promise.all(
      names.map(async (name) => {
        const manifest = JSON.parse(
          await readFile(require.resolve(`${name}/package.json`), "utf8"),
        ) as { version: string };
        return [name, manifest.version];
      }),
    ),
  );
  if (new Set(Object.values(versions)).size !== 1) {
    throw new Error(
      `Proof requires exactly matching Remotion versions: ${JSON.stringify(versions)}`,
    );
  }
  return versions;
};

export const collectBrowserEvidence = async (executable: string) => {
  const stat = await lstat(executable);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error("Proof browser must be a regular executable file.");
  const { stdout } = await execFileAsync(executable, ["--version"]);
  return {
    executable,
    version: stdout.trim(),
    sizeBytes: stat.size,
    checksum: checksum(await readFile(executable)),
  };
};

export const inspectPng = async (
  path: string,
  expectedWidth: number,
  expectedHeight: number,
) => {
  const bytes = await readFile(path);
  if (
    !bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    bytes.toString("ascii", 12, 16) !== "IHDR" ||
    bytes.readUInt32BE(16) !== expectedWidth ||
    bytes.readUInt32BE(20) !== expectedHeight
  ) {
    throw new Error(`Proof PNG has incorrect format or dimensions: ${path}`);
  }
  return { width: expectedWidth, height: expectedHeight };
};

const rgb = (hex: string) =>
  [0, 2, 4].map((offset) =>
    Number.parseInt(hex.slice(offset + 1, offset + 3), 16),
  );

/** Pixel checks establish the 8% paint bound; they do not sign off visual quality. */
export const inspectDecorationRaster = (
  pixels: Uint8Array,
  width: number,
  height: number,
  theme: VisualTheme,
  sceneFrame: number,
) => {
  if (pixels.length !== width * height * 4)
    throw new Error("Incomplete decoration proof raster.");
  const background = rgb(theme.background);
  const samples = [
    [10, 10],
    [width - 11, height - 11],
  ].map(([x, y]) => {
    const offset = (y * width + x) * 4;
    const actual = [...pixels.subarray(offset, offset + 3)];
    const paint =
      sceneFrame < 20 || (sceneFrame >= 40 && x < width / 2) ? 255 : 0;
    const expected = background.map((channel) =>
      Math.round(channel * 0.92 + paint * 0.08),
    );
    if (
      pixels[offset + 3] !== 255 ||
      actual.some((channel, index) => Math.abs(channel - expected[index]) > 1)
    ) {
      throw new Error(
        `Opaque decoration escaped its 8% background group at ${x},${y}: ${actual} vs ${expected}.`,
      );
    }
    return { x, y, actual, expected };
  });
  const foregroundPixels = { primaryText: 0, secondaryText: 0, accent: 0 };
  for (const role of ["primaryText", "secondaryText", "accent"] as const) {
    const color = rgb(theme[role]);
    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (
        pixels[offset] === color[0] &&
        pixels[offset + 1] === color[1] &&
        pixels[offset + 2] === color[2] &&
        pixels[offset + 3] === 255
      ) {
        foregroundPixels[role] += 1;
      }
    }
    if (foregroundPixels[role] < 100) {
      throw new Error(
        `Decoration obscured or recolored the synthetic body's ${role}.`,
      );
    }
  }
  return { maximumGroupOpacity: 0.08, samples, foregroundPixels };
};

export const inspectDecorationStill = async (
  path: string,
  width: number,
  height: number,
  theme: VisualTheme,
  sceneFrame: number,
) => {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      path,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "pipe:1",
    ],
    { encoding: "buffer", maxBuffer: width * height * 4 + 1024 },
  );
  return inspectDecorationRaster(stdout, width, height, theme, sceneFrame);
};

export const inspectVideo = async (
  path: string,
  expected: {
    width: number;
    height: number;
    fps: number;
    durationInFrames: number;
  },
) => {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-count_frames",
    "-show_entries",
    "stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_frames",
    "-of",
    "json",
    path,
  ]);
  const facts = JSON.parse(stdout) as {
    streams?: {
      codec_type: string;
      codec_name: string;
      width: number;
      height: number;
      r_frame_rate: string;
      nb_read_frames: string;
    }[];
  };
  const video = facts.streams?.find((stream) => stream.codec_type === "video");
  if (
    video?.codec_name !== "h264" ||
    video.width !== expected.width ||
    video.height !== expected.height ||
    video.r_frame_rate !== `${expected.fps}/1` ||
    Number(video.nb_read_frames) !== expected.durationInFrames
  ) {
    throw new Error(`Proof video media facts differ from its matrix: ${path}`);
  }
  await execFileAsync("ffmpeg", [
    "-v",
    "error",
    "-xerror",
    "-i",
    path,
    "-f",
    "null",
    "-",
  ]);
  return { ...expected, codec: "h264", eofDecoded: true };
};
