import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { ProjectSoundPlanSchema } from "@axmorf/studio/contracts";
import { writeProducerConfig } from "../../scripts/config/producer-config";
import { createProject } from "../../scripts/projects/application/create-project";
import { inspectProjectCreateContext } from "../../scripts/projects/application/project-create-context";
import {
  prepareProjectCreateFixture,
  validProjectCreateInput,
  validProjectCreateProducerConfig,
  writeProjectCreateJson,
} from "../fixtures/project-create";
import { generateResourceCatalog } from "../../scripts/catalog/generate";

const hash = (bytes: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const musicFixture = async () => {
  const fixture = await prepareProjectCreateFixture();
  const licenseBytes = "Synthetic test media, licensed for test use.";
  await mkdir(join(fixture.rootDir, "private/reference-assets"), {
    recursive: true,
  });
  await mkdir(join(fixture.rootDir, "public/assets/library/music"), {
    recursive: true,
  });
  await writeFile(
    join(fixture.rootDir, "private/reference-assets/MIXKIT_AUDIO_LICENSE.md"),
    licenseBytes,
  );
  const assets = await Promise.all(
    [
      [
        "bright",
        "Bright friendly everyday explainer",
        ["bright", "light", "loop"],
      ],
      [
        "suspense",
        "Suspense discovery and unanswered questions",
        ["loop", "suspense"],
      ],
      [
        "preview",
        "Suspense preview, intentionally not a loop",
        ["preview", "suspense"],
      ],
    ].map(async ([name, title, tags]) => {
      const bytes = Buffer.from(`synthetic test-only music ${name}`);
      const localPath = `public/assets/library/music/${name}.wav`;
      await writeFile(join(fixture.rootDir, localPath), bytes);
      return {
        schemaVersion: 1,
        id: `asset.test.music.${name}`,
        kind: "asset",
        status: "approved",
        title,
        description: title,
        useCases: [title],
        tags,
        authority: {
          kind: "repository-file",
          repositoryPath: "private/reference-assets/assets.manifest.json",
        },
        allowedUse: "localize-asset",
        assetKind: "audio",
        mediaRole: "background-music",
        localPath,
        checksum: hash(bytes),
        license: {
          id: "test-fixture",
          verificationStatus: "verified",
          sourceUrl: null,
          attributionRequired: false,
          attributionText: null,
          verifiedAt: "2026-10-04T00:00:00.000Z",
          sourceEvidenceFingerprint: hash(licenseBytes),
        },
        media: {
          mimeType: "audio/wav",
          sizeBytes: bytes.length,
          durationInSeconds: 2,
          codec: "pcm_s16le",
          sampleRate: 48000,
        },
      };
    }),
  );
  await writeProjectCreateJson(
    join(fixture.rootDir, "private/reference-assets/assets.manifest.json"),
    { schemaVersion: 1, assets },
  );
  await writeProducerConfig({
    configPath: fixture.configPath,
    value: {
      ...validProjectCreateProducerConfig,
      audioDefaults: { globalBgm: { mode: "auto", volume: 0.12 } },
    },
  });
  await generateResourceCatalog({ rootDir: fixture.rootDir, mode: "write" });
  return fixture;
};

const create = (fixture: Awaited<ReturnType<typeof musicFixture>>) =>
  createProject({
    ...fixture,
    projectId: "story-example",
    env: { RSP_PRODUCER_CONFIG: fixture.configPath },
  });

test("automatic library music selects by the current brief, localizes verified bytes and freezes one full-composition track", async (t) => {
  const fixture = await musicFixture();
  t.after(() => rm(fixture.rootDir, { recursive: true, force: true }));
  await writeProjectCreateJson(fixture.inputPath, {
    ...validProjectCreateInput,
    brief: {
      ...validProjectCreateInput.brief,
      title: "Suspense and unanswered questions",
    },
  });
  const configBefore = await readFile(fixture.configPath);
  const result = await create(fixture);
  assert.equal(result.backgroundMusic.status, "selected");
  assert.equal(
    result.backgroundMusic.sourceResourceId,
    "asset.test.music.suspense",
  );
  const root = join(fixture.rootDir, "src/projects/story-example");
  const plan = ProjectSoundPlanSchema.parse(
    JSON.parse(await readFile(join(root, "sound.json"), "utf8")),
  );
  assert.equal(plan.contributions.length, 1);
  assert.equal(plan.contributions[0]?.playbackScope, "composition");
  assert.equal(plan.contributions[0]?.loop, true);
  assert.equal(plan.contributions[0]?.volume, 0.12);
  const manifest = JSON.parse(
    await readFile(join(root, "assets.manifest.json"), "utf8"),
  );
  const asset = manifest.assets.find(
    ({ mediaRole }: { mediaRole: string }) => mediaRole === "background-music",
  );
  assert.equal(asset.license.id, "test-fixture");
  assert.equal(asset.allowedUse, "runtime-approved");
  assert.equal(asset.title, "Suspense discovery and unanswered questions");
  assert.deepEqual(
    await readFile(join(fixture.rootDir, asset.localPath)),
    Buffer.from("synthetic test-only music suspense"),
  );
  assert.deepEqual(await readFile(fixture.configPath), configBefore);
  assert.equal(
    (await create(fixture)).creationIdentity,
    result.creationIdentity,
  );
});

test("per-project silence and selected resources override automatic defaults without changing settings", async (t) => {
  for (const backgroundMusic of [
    null,
    { mode: "selected", resourceId: "asset.test.music.bright", volume: 0.08 },
  ]) {
    const fixture = await musicFixture();
    t.after(() => rm(fixture.rootDir, { recursive: true, force: true }));
    await writeProjectCreateJson(fixture.inputPath, {
      ...validProjectCreateInput,
      backgroundMusic,
    });
    const result = await create(fixture);
    const plan = JSON.parse(
      await readFile(
        join(fixture.rootDir, "src/projects/story-example/sound.json"),
        "utf8",
      ),
    );
    assert.equal(
      result.backgroundMusic.status,
      backgroundMusic === null ? "disabled" : "selected",
    );
    assert.equal(plan.contributions.length, backgroundMusic === null ? 0 : 1);
    if (backgroundMusic !== null) {
      assert.equal(
        result.backgroundMusic.sourceResourceId,
        backgroundMusic.resourceId,
      );
      assert.equal(plan.contributions[0].volume, 0.08);
    }
  }
});

test("missing automatic music is explicit; an invalid selected track fails before creating a Project", async (t) => {
  const fixture = await prepareProjectCreateFixture();
  t.after(() => rm(fixture.rootDir, { recursive: true, force: true }));
  await writeProducerConfig({
    configPath: fixture.configPath,
    value: {
      ...validProjectCreateProducerConfig,
      audioDefaults: { globalBgm: { mode: "auto", volume: 0.15 } },
    },
  });
  const context = await inspectProjectCreateContext({
    rootDir: fixture.rootDir,
    storyId: "story-example",
    env: { RSP_PRODUCER_CONFIG: fixture.configPath },
  });
  assert.equal(context.backgroundMusic.status, "unavailable");
  assert.deepEqual(context.backgroundMusic.candidates, []);
  await writeProjectCreateJson(fixture.inputPath, {
    ...validProjectCreateInput,
    backgroundMusic: { mode: "selected", resourceId: "asset.missing.loop" },
  });
  await assert.rejects(create(fixture), /background music.*unavailable/iu);
  await assert.rejects(
    readFile(join(fixture.rootDir, "src/projects/story-example/sound.json")),
    { code: "ENOENT" },
  );
  await writeProjectCreateJson(fixture.inputPath, validProjectCreateInput);
  const result = await create(fixture);
  assert.equal(result.backgroundMusic.status, "unavailable");
  assert.match(result.backgroundMusic.reason, /approved.*loop/iu);
});

test("automatic selection excludes previews; an exact allowlist and checksum drift fail closed", async (t) => {
  const fixture = await musicFixture();
  t.after(() => rm(fixture.rootDir, { recursive: true, force: true }));
  const inspect = () =>
    inspectProjectCreateContext({
      rootDir: fixture.rootDir,
      storyId: "story-example",
      env: { RSP_PRODUCER_CONFIG: fixture.configPath },
    });
  const context = await inspect();
  assert.deepEqual(
    context.backgroundMusic.candidates.map(
      ({ resourceId }: { resourceId: string }) => resourceId,
    ),
    ["asset.test.music.bright", "asset.test.music.suspense"],
  );
  await writeProducerConfig({
    configPath: fixture.configPath,
    value: {
      ...validProjectCreateProducerConfig,
      audioDefaults: {
        globalBgm: {
          mode: "auto",
          resourceIds: ["asset.test.music.suspense"],
          volume: 0.15,
        },
      },
    },
  });
  assert.deepEqual(
    (await inspect()).backgroundMusic.candidates.map(
      ({ resourceId }: { resourceId: string }) => resourceId,
    ),
    ["asset.test.music.suspense"],
  );
  await writeFile(
    join(fixture.rootDir, "public/assets/library/music/suspense.wav"),
    "drift",
  );
  await assert.rejects(create(fixture), /checksum.*stale/iu);
});
