import { lstat, mkdir, readFile } from "node:fs/promises";
import { extname, isAbsolute, join } from "node:path";

import {
  FilmAssetSchema,
  FilmAssetsSchema,
  type FilmAsset,
} from "@axmorf/studio/contracts";

import { writeBinaryFileAtomic } from "../shared/atomic-file";
import {
  filmPaths,
  loadFilmSpec,
  readOptionalJsonFile,
  sha256,
  withWorkspaceLock,
  workspacePath,
  writeJsonFile,
} from "./files";

const KIND_BY_EXTENSION: Readonly<Record<string, FilmAsset["kind"]>> = {
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".webp": "image",
  ".svg": "svg",
  ".wav": "audio",
  ".mp3": "audio",
  ".m4a": "audio",
  ".mp4": "video",
  ".webm": "video",
};

const SIGNATURES: Readonly<Record<string, (bytes: Buffer) => boolean>> = {
  ".png": (bytes) =>
    bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
  ".jpg": (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8,
  ".jpeg": (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8,
  ".webp": (bytes) =>
    bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
    bytes.subarray(8, 12).toString("latin1") === "WEBP",
  ".wav": (bytes) =>
    bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
    bytes.subarray(8, 12).toString("latin1") === "WAVE",
  ".svg": (bytes) =>
    /<svg[\s>]/iu.test(bytes.subarray(0, 4096).toString("utf8")),
};

/** SVG is code: it must not fetch, script, or embed anything at render time. */
const assertSafeSvg = (bytes: Buffer) => {
  const source = bytes.toString("utf8");
  if (/<script|\bon[a-z]+\s*=|<foreignObject/iu.test(source)) {
    throw new Error(
      "SVG assets may not contain scripts, event handlers, or foreignObject.",
    );
  }
  if (/(?:href|src)\s*=\s*["'](?!#|data:image\/)/iu.test(source)) {
    throw new Error(
      "SVG assets may only reference their own ids or inline images.",
    );
  }
};

export const importFilmAsset = async ({
  rootDir,
  filmId,
  file,
  name,
  origin,
  creator,
  license,
  sourceUrl,
  attribution,
}: {
  readonly rootDir: string;
  readonly filmId: string;
  readonly file: string;
  readonly name: string;
  readonly origin: FilmAsset["origin"];
  readonly creator: string;
  readonly license: string;
  readonly sourceUrl?: string;
  readonly attribution?: string;
}) =>
  withWorkspaceLock(rootDir, "film-asset", async () => {
    await loadFilmSpec(rootDir, filmId);
    const paths = filmPaths(rootDir, filmId);
    if (!isAbsolute(file)) throw new Error("--file must be an absolute path.");
    if (!/^[a-z0-9]+(?:[-_][a-z0-9]+)*\.[a-z0-9]+$/u.test(name)) {
      throw new Error(
        "--name must be a lowercase file name such as server-room.png.",
      );
    }
    const extension = extname(name);
    const kind = KIND_BY_EXTENSION[extension];
    if (kind === undefined) {
      throw new Error(`Unsupported asset type ${extension}.`);
    }
    const state = await lstat(file);
    if (!state.isFile() || state.isSymbolicLink() || state.size === 0) {
      throw new Error("--file must be a non-empty regular file.");
    }
    if (state.size > 200 * 1024 * 1024) {
      throw new Error("Assets larger than 200 MB are not accepted.");
    }
    const bytes = await readFile(file);
    const signature = SIGNATURES[extension];
    if (signature !== undefined && !signature(bytes)) {
      throw new Error(`${name} does not contain ${extension} data.`);
    }
    if (kind === "svg") assertSafeSvg(bytes);
    const destination = join(paths.assetDir, name);
    const asset = FilmAssetSchema.parse({
      publicPath: workspacePath(rootDir, destination),
      checksum: sha256(bytes),
      kind,
      origin,
      creator,
      license,
      ...(sourceUrl === undefined ? {} : { sourceUrl }),
      ...(attribution === undefined ? {} : { attribution }),
    });
    const manifest = (await readOptionalJsonFile(
      paths.assets,
      FilmAssetsSchema,
      "assets.json",
    )) ?? { schemaVersion: 1 as const, filmId: paths.id, assets: [] };
    await mkdir(paths.assetDir, { recursive: true });
    await writeBinaryFileAtomic({
      destination,
      bytes: Uint8Array.from(bytes),
      mode: "replace",
    });
    await writeJsonFile(paths.assets, {
      ...manifest,
      assets: [
        ...manifest.assets.filter(
          ({ publicPath }) => publicPath !== asset.publicPath,
        ),
        asset,
      ].sort((left, right) => left.publicPath.localeCompare(right.publicPath)),
    });
    return {
      status: "film-asset-imported",
      filmId: paths.id,
      publicPath: asset.publicPath,
      usage: `staticFile("${asset.publicPath.slice("public/".length)}")`,
    } as const;
  });
