import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ProducerAssetManifestSchema } from "@axmorf/studio/contracts";
import {
  backgroundMusicCandidates,
  chooseBackgroundMusic,
} from "../../scripts/projects/domain/background-music";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const seedRoot = "packages/studio/src/runtime/workspace-seed/files";
const expectedTracks = [
  [
    "easy-day",
    "64d3bfa3598325b8a9a4d9cf035940fc5587d8ce3fbeb8a3cf8a2475e1510c43",
  ],
  [
    "neon-motion",
    "45ec445cc27956827a683c78f1ea954215c606db096184740f1d9922fde50e17",
  ],
  [
    "next-question",
    "21ee2f57f9137db5d2dc7c59ea600dbc4179d6311fd2df4ac8ed36c2463cae28",
  ],
  [
    "signal-sprint",
    "217c3d5d103f0df713aa325a235c3f7088c6083069c1ac07fa32861188be6e0a",
  ],
  [
    "sunlit-drive",
    "4b8576f2bc78cd028d4b5c4cbbb60a0d0f8c0ad2141ef9c999bf35ebe43bd924",
  ],
] as const;
const checksum = (bytes: Buffer) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

test("shared Workspace seed includes five original licensed loop masters for automatic BGM", async () => {
  const manifest = ProducerAssetManifestSchema.parse(
    JSON.parse(
      await readFile(
        join(
          repositoryRoot,
          "packages/studio/src/remotion/catalog/assets.manifest.json",
        ),
        "utf8",
      ),
    ),
  );
  const candidates = backgroundMusicCandidates(manifest.assets);
  assert.deepEqual(
    candidates.map(({ id }) => id),
    expectedTracks.map(([name]) => `asset.axmorf.music.${name}-loop-v1`),
    "fresh Workspaces must receive the loop library without private user assets",
  );
  const noticeChecksum = checksum(
    await readFile(
      join(repositoryRoot, "packages/studio/THIRD_PARTY_NOTICES.md"),
    ),
  );
  for (const [index, asset] of candidates.entries()) {
    const [name, digest] = expectedTracks[index]!;
    assert.equal(asset.allowedUse, "runtime-approved");
    assert.equal(
      asset.authority.repositoryPath,
      "src/remotion/catalog/assets.manifest.json",
    );
    assert.equal(
      asset.localPath,
      `public/assets/axmorf-shared/audio/music/axmorf-${name}-loop-v1.wav`,
    );
    assert.equal(asset.checksum, `sha256:${digest}`);
    assert.equal(asset.license.id, "AXMORF Studio bundled music permission");
    assert.equal(asset.license.sourceEvidenceFingerprint, noticeChecksum);
    const path = join(repositoryRoot, seedRoot, asset.localPath);
    const metadata = await lstat(path);
    assert.equal(metadata.isFile(), true);
    assert.equal(metadata.isSymbolicLink(), false);
    const wav = await readFile(path);
    assert.equal(checksum(wav), asset.checksum);
    assert.equal(wav.length, asset.media?.sizeBytes);
    assert.equal(wav.toString("ascii", 0, 4), "RIFF");
    assert.equal(wav.readUInt32LE(4), wav.length - 8);
    assert.equal(wav.toString("ascii", 8, 16), "WAVEfmt ");
    assert.equal(wav.readUInt16LE(20), 1);
    assert.equal(wav.readUInt16LE(22), 2);
    assert.equal(wav.readUInt32LE(24), 44100);
    assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.toString("ascii", 36, 40), "data");
    assert.equal(wav.readUInt32LE(40), wav.length - 44);
    assert.equal((wav.length - 44) / 4 / 44100, asset.media?.durationInSeconds);
    assert.equal(asset.media?.codec, "pcm_s16le");
    assert.equal(asset.media?.sampleRate, 44100);
    assert.doesNotMatch(
      JSON.stringify(asset),
      /private\/|libfile_|file_000|\/Users\//u,
    );
  }
  assert.equal(
    chooseBackgroundMusic(
      candidates,
      "悬念推进，逐步揭示问题 suspense discovery",
    )?.id,
    "asset.axmorf.music.next-question-loop-v1",
  );
});
