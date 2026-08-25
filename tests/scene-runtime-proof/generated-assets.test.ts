import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { generateSceneRuntimeProofAssets } from "../../scripts/proofs/scene-runtime/generate-assets";
import { generateSceneTemplateAudioProjection } from "../../scripts/scene-templates/audio-projection";

const checksum = (bytes: Buffer) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const canonicalFiles = [
  "desktop/resources/workspace-integration/assets/library/mixkit/sound-effects/mixkit-movie-trailer-epic-impact-2908.wav",
  "desktop/resources/workspace-integration/assets/library/mixkit/music/mixkit-deep-urban-623.mp3",
  "src/remotion/catalog/assets.manifest.json",
] as const;

const seedCanonicalTemplateAudio = async (rootDir: string) => {
  for (const relativePath of canonicalFiles) {
    const destination = join(rootDir, relativePath);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(process.cwd(), relativePath), destination);
  }
};

test("core assets and canonical template audio bootstrap deterministically", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-proof-assets-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await seedCanonicalTemplateAudio(rootDir);

  await generateSceneRuntimeProofAssets({ rootDir, mode: "write" });

  const pulse = await readFile(
    join(rootDir, "public/assets/library/scene-runtime-proof/proof-pulse.wav"),
  );
  const shape = await readFile(
    join(rootDir, "public/assets/library/scene-runtime-proof/proof-shape.svg"),
  );
  const introAudio = await readFile(
    join(
      rootDir,
      "public/assets/library/mixkit/sound-effects/mixkit-movie-trailer-epic-impact-2908.wav",
    ),
  );
  const outroAudio = await readFile(
    join(
      rootDir,
      "public/assets/library/mixkit/music/mixkit-deep-urban-623.mp3",
    ),
  );
  assert.equal(
    checksum(pulse),
    "sha256:187da07a941e050db15e5fe2e8e7aed327a3f796fda894125ae1b504e210c1a7",
  );
  assert.equal(
    checksum(shape),
    "sha256:a173d06fa0f769755cda708c82cb9180ca88f7bcbd98e0d624dfb7a39c617f5c",
  );
  assert.equal(introAudio.length, 858_396);
  assert.equal(outroAudio.length, 9_240_540);
  assert.equal(
    checksum(introAudio),
    "sha256:dd0afbaffa7837c2eb0ec50191e9dcceb09da51e07b8bc565a87afe616d36ad6",
  );
  assert.equal(
    checksum(outroAudio),
    "sha256:ac7e28f0cdd6c607df199c759f34ca66cfebd881ea61c26473fb4cecebe64fa8",
  );

  const projectionPath = join(
    rootDir,
    "src/remotion/catalog/scene-template-audio.generated.json",
  );
  await assert.rejects(readFile(projectionPath), { code: "ENOENT" });
  await generateSceneTemplateAudioProjection({ rootDir, mode: "write" });
  const projection = JSON.parse(await readFile(projectionPath, "utf8"));
  assert.equal(projection.intro.source.id, "asset.axmorf.default-intro-impact");
  assert.equal(projection.intro.soundCues[0].durationInFrames, 60);
  assert.equal(projection.intro.soundCues[0].volume, 0.82);
  assert.equal(projection.outro.source.id, "asset.axmorf.default-outro-music");
  assert.equal(projection.outro.soundCues[0].durationInFrames, 240);
  assert.equal(projection.outro.soundCues[0].volume, 1);

  await generateSceneRuntimeProofAssets({ rootDir, mode: "check" });
  await generateSceneTemplateAudioProjection({ rootDir, mode: "check" });
  await writeFile(projectionPath, "{}\n");
  await assert.rejects(
    generateSceneTemplateAudioProjection({ rootDir, mode: "check" }),
    /Scene template audio projection is stale\./u,
  );
});

test("private override files cannot change the canonical template sound", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-template-audio-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await seedCanonicalTemplateAudio(rootDir);
  await mkdir(join(rootDir, "private/reference-assets"), { recursive: true });
  await writeFile(
    join(
      rootDir,
      "private/reference-assets/scene-template-sound-overrides.json",
    ),
    JSON.stringify({
      schemaVersion: 1,
      introResourceId: "asset.private.intro",
      outroResourceId: "asset.private.outro",
    }),
  );

  await generateSceneTemplateAudioProjection({ rootDir, mode: "write" });
  const projection = JSON.parse(
    await readFile(
      join(rootDir, "src/remotion/catalog/scene-template-audio.generated.json"),
      "utf8",
    ),
  );
  assert.equal(projection.intro.source.id, "asset.axmorf.default-intro-impact");
  assert.equal(projection.outro.source.id, "asset.axmorf.default-outro-music");
});
