import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { generateM6ProofAssets } from "../../scripts/proofs/scene-runtime/generate-assets";
import { generateSceneTemplateAudioProjection } from "../../scripts/scene-templates/audio-projection";

const checksum = (bytes: Buffer) =>
  `sha256:${createHash("sha256")
    .update(bytes.toString("latin1"), "latin1")
    .digest("hex")}`;

test("core authored assets bootstrap deterministically without tracked public files", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-proof-assets-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));

  await generateM6ProofAssets({ rootDir, mode: "write" });

  const pulse = await readFile(
    join(rootDir, "public/assets/library/m6-scene-runtime/proof-pulse.wav"),
  );
  const shape = await readFile(
    join(rootDir, "public/assets/library/m6-scene-runtime/proof-shape.svg"),
  );
  const introChime = await readFile(
    join(
      rootDir,
      "public/assets/library/scene-templates/axmorf-brand-reveal-chime.wav",
    ),
  );
  const outroChime = await readFile(
    join(
      rootDir,
      "public/assets/library/scene-templates/axmorf-source-follow-chime.wav",
    ),
  );
  assert.equal(
    checksum(pulse),
    "sha256:187da07a941e050db15e5fe2e8e7aed327a3f796fda894125ae1b504e210c1a7",
  );
  assert.equal(
    checksum(shape),
    "sha256:83284733c309b88ffa56e1cda84a2699a7ace251df4831620d3484154745ccbb",
  );
  assert.equal(introChime.length, 57_644);
  assert.equal(outroChime.length, 96_044);
  assert.equal(
    checksum(introChime),
    "sha256:739069dd51389ebac5704cdcd4b16ef43abc458a268931ab5817b834c1f2c475",
  );
  assert.equal(
    checksum(outroChime),
    "sha256:7140b3c599b3656e5c3ee26c9c127a5d6a8deb26a336c67574114e4fdbe355b0",
  );
  const projectionPath = join(
    rootDir,
    "src/remotion/catalog/scene-template-audio.generated.json",
  );
  await assert.rejects(readFile(projectionPath), { code: "ENOENT" });
  await generateSceneTemplateAudioProjection({ rootDir, mode: "write" });
  assert.deepEqual(
    JSON.parse(
      await readFile(projectionPath, "utf8"),
    ),
    { schemaVersion: 1, intro: null, outro: null },
  );

  await generateM6ProofAssets({ rootDir, mode: "check" });
  await generateSceneTemplateAudioProjection({ rootDir, mode: "check" });
  await writeFile(projectionPath, "{}\n");
  await assert.rejects(
    generateSceneTemplateAudioProjection({ rootDir, mode: "check" }),
    /Scene template audio projection is stale\./u,
  );
  await generateSceneTemplateAudioProjection({ rootDir, mode: "write" });
});

test("local reference overrides bind the full intro and outro from source frame zero", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-template-audio-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));

  const evidence = Buffer.from("verified commercial audio license");
  const intro = Buffer.from("intro reference audio");
  const outro = Buffer.from("outro reference audio");
  const evidenceChecksum = checksum(evidence);
  const manifestPath = "private/reference-assets/assets.manifest.json";
  const descriptor = ({
    id,
    localPath,
    bytes,
    mediaRole,
    durationInSeconds,
  }: {
    readonly id: string;
    readonly localPath: string;
    readonly bytes: Buffer;
    readonly mediaRole: "scene-sfx" | "global-bgm";
    readonly durationInSeconds: number;
  }) => ({
    schemaVersion: 1,
    id,
    kind: "asset",
    status: "approved",
    title: id,
    description: `${id} test reference audio`,
    useCases: ["Scene template sound"],
    tags: ["audio", "reference"],
    authority: { kind: "repository-file", repositoryPath: manifestPath },
    allowedUse: "localize-asset",
    assetKind: "audio",
    mediaRole,
    localPath,
    checksum: checksum(bytes),
    license: {
      id: "Commercial-use-proof",
      verificationStatus: "verified",
      sourceUrl: null,
      attributionRequired: false,
      attributionText: null,
      verifiedAt: "2026-08-15T00:00:00.000Z",
      sourceEvidenceFingerprint: evidenceChecksum,
    },
    media: {
      durationInSeconds,
      codec: mediaRole === "global-bgm" ? "mp3" : "pcm_s16le",
      sampleRate: 44_100,
    },
  });
  const introPath =
    "public/assets/library/reference-audio/movie-trailer-impact.wav";
  const outroPath = "public/assets/library/reference-audio/deep-urban.mp3";
  await Promise.all([
    mkdir(join(rootDir, "private/reference-assets"), { recursive: true }),
    mkdir(join(rootDir, "public/assets/library/reference-audio"), {
      recursive: true,
    }),
  ]);
  await Promise.all([
    writeFile(
      join(rootDir, "private/reference-assets/MIXKIT_AUDIO_LICENSE.md"),
      evidence,
    ),
    writeFile(join(rootDir, introPath), intro),
    writeFile(join(rootDir, outroPath), outro),
    writeFile(
      join(
        rootDir,
        "private/reference-assets/scene-template-sound-overrides.json",
      ),
      JSON.stringify({
        schemaVersion: 1,
        introResourceId: "asset.mixkit.movie-trailer-epic-impact-2908",
        outroResourceId: "asset.mixkit.deep-urban-623",
      }),
    ),
  ]);
  await writeFile(
    join(rootDir, manifestPath),
    JSON.stringify({
      schemaVersion: 1,
      assets: [
        descriptor({
          id: "asset.mixkit.movie-trailer-epic-impact-2908",
          localPath: introPath,
          bytes: intro,
          mediaRole: "scene-sfx",
          durationInSeconds: 4.8,
        }),
        descriptor({
          id: "asset.mixkit.deep-urban-623",
          localPath: outroPath,
          bytes: outro,
          mediaRole: "global-bgm",
          durationInSeconds: 288,
        }),
      ],
    }),
  );

  await generateSceneTemplateAudioProjection({ rootDir, mode: "write" });

  const projection = JSON.parse(
    await readFile(
      join(rootDir, "src/remotion/catalog/scene-template-audio.generated.json"),
      "utf8",
    ),
  );
  assert.equal(
    projection.intro.source.id,
    "asset.mixkit.movie-trailer-epic-impact-2908",
  );
  assert.equal(projection.intro.targetMediaRole, "scene-sfx");
  assert.deepEqual(projection.intro.soundCues, [
    {
      cueId: "reveal-impact",
      anchorId: "intro-sound-start",
      offsetFrames: 0,
      durationInFrames: 60,
      volume: 0.82,
    },
  ]);
  assert.equal(projection.outro.source.id, "asset.mixkit.deep-urban-623");
  assert.equal(projection.outro.targetMediaRole, "scene-ambience");
  assert.deepEqual(projection.outro.soundCues, []);

  await generateSceneTemplateAudioProjection({ rootDir, mode: "check" });
});
