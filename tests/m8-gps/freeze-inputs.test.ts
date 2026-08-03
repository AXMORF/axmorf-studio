import assert from "node:assert/strict";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";

import {
  GlobalSoundPlanSchema,
  GlobalVisualPlanSchema,
  ResourceCatalogSchema,
} from "../../src/contracts";
import {buildGpsM8FrozenInputs} from "../../scripts/m8-gps/freeze-inputs";
import {
  generateGpsGlobalAudio,
  inspectCanonicalWav,
} from "../../scripts/m8-gps/generate-global-audio";

const rootDir = join(import.meta.dirname, "../..");

test("GPS M8 frozen inputs bind current M1-M7 identities and project-local Catalog overlay", async () => {
  const frozen = await buildGpsM8FrozenInputs(rootDir);
  assert.equal(frozen.baseCatalog.entries.length, 22);
  assert.equal(frozen.assemblyCatalog.entries.length, 24);
  const baseAssetIds = new Set(
    frozen.baseCatalog.entries.map((entry) => entry.descriptor.id),
  );
  assert.deepEqual(
    frozen.assemblyCatalog.entries
      .filter((entry) => baseAssetIds.has(entry.descriptor.id))
      .map((entry) => entry.descriptorFingerprint)
      .sort(),
    frozen.baseCatalog.entries
      .map((entry) => entry.descriptorFingerprint)
      .sort(),
  );
  assert.doesNotThrow(() => ResourceCatalogSchema.parse(frozen.assemblyCatalog));
  assert.doesNotThrow(() => GlobalSoundPlanSchema.parse(frozen.globalSoundPlan));
  assert.doesNotThrow(() => GlobalVisualPlanSchema.parse(frozen.globalVisualPlan));
  assert.equal(frozen.globalSoundPlan.durationInFrames, 1731);
  assert.equal(frozen.globalVisualPlan.durationInFrames, 1731);
  const receiptById = new Map<
    string,
    (typeof frozen.globalAudioReceipt.assets)[number]
  >(
    frozen.globalAudioReceipt.assets.map((asset) => [asset.resourceId, asset]),
  );
  for (const reference of frozen.globalSoundPlan.assets) {
    const catalogEntry = frozen.assemblyCatalog.entries.find(
      (entry) => entry.descriptor.id === reference.resourceId,
    );
    const receipt = receiptById.get(reference.resourceId);
    assert.ok(catalogEntry);
    assert.equal(catalogEntry.descriptor.kind, "asset");
    if (catalogEntry.descriptor.kind !== "asset") {
      throw new Error("Global sound Catalog entry must be an asset.");
    }
    assert.ok(receipt);
    assert.equal(reference.checksum, receipt.checksum);
    assert.equal(reference.publicPath, receipt.localPath);
    assert.equal(reference.descriptorFingerprint, catalogEntry.descriptorFingerprint);
    assert.equal(catalogEntry.descriptor.checksum, receipt.checksum);
    assert.equal(catalogEntry.descriptor.license.id, receipt.license.id);
    assert.equal(
      catalogEntry.descriptor.license.verificationStatus,
      receipt.license.verificationStatus,
    );
    assert.equal(catalogEntry.descriptor.license.attributionRequired, false);
  }
});

test("both global PCM assets cover exact 1731 frames and their checksums are current", async () => {
  const frozen = await buildGpsM8FrozenInputs(rootDir);
  for (const asset of frozen.globalSoundPlan.assets) {
    const path = join(rootDir, asset.publicPath);
    assert.equal((await stat(path)).isFile(), true);
    const inspected = inspectCanonicalWav(await readFile(path));
    assert.deepEqual(inspected, {
      sampleRate: 48_000,
      channels: 1,
      bitsPerSample: 16,
      sampleFrameCount: 2_769_600,
    });
  }
});

test("M8 check mode is byte-exact and never rewrites frozen artifacts", async () => {
  const paths = [
    "src/projects/gps-relativity/global-sound-plan.json",
    "src/projects/gps-relativity/global-visual-plan.json",
    "src/projects/gps-relativity/final-assembly-plan.json",
    "src/projects/gps-relativity/generated/resource-catalog.generated.json",
  ];
  const before = await Promise.all(paths.map((path) => readFile(join(rootDir, path))));
  const frozen = await buildGpsM8FrozenInputs(rootDir);
  assert.equal(frozen.finalAssembly.storyId, "gps-relativity");
  const after = await Promise.all(paths.map((path) => readFile(join(rootDir, path))));
  assert.deepEqual(after, before);
});

const createAudioCheckFixture = async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "gps-m8-audio-check-"));
  const paths = [
    "src/projects/gps-relativity/global-audio.json",
    "src/projects/gps-relativity/generated/global-audio.generated.json",
    "public/projects/gps-relativity/global-audio/global-bgm.wav",
    "public/projects/gps-relativity/global-audio/cross-scene-ambience.wav",
  ];
  for (const path of paths) {
    await mkdir(join(fixtureRoot, path, ".."), {recursive: true});
    await cp(join(rootDir, path), join(fixtureRoot, path));
  }
  return fixtureRoot;
};

test("global audio checker rejects PCM byte sample-count receipt and license drift", async () => {
  const mutations = [
    async (fixtureRoot: string) => {
      const path = join(
        fixtureRoot,
        "public/projects/gps-relativity/global-audio/global-bgm.wav",
      );
      const bytes = await readFile(path);
      bytes[1024] = (bytes[1024] ?? 0) ^ 0xff;
      await writeFile(path, Uint8Array.from(Array.from(bytes)));
    },
    async (fixtureRoot: string) => {
      const path = join(
        fixtureRoot,
        "public/projects/gps-relativity/global-audio/cross-scene-ambience.wav",
      );
      const bytes = await readFile(path);
      await writeFile(
        path,
        Uint8Array.from(Array.from(bytes.subarray(0, bytes.length - 2))),
      );
    },
    async (fixtureRoot: string) => {
      const path = join(
        fixtureRoot,
        "src/projects/gps-relativity/generated/global-audio.generated.json",
      );
      const receipt = JSON.parse(await readFile(path, "utf8"));
      receipt.assets[0].checksum = `sha256:${"e".repeat(64)}`;
      await writeFile(path, `${JSON.stringify(receipt, null, 2)}\n`);
    },
    async (fixtureRoot: string) => {
      const path = join(
        fixtureRoot,
        "src/projects/gps-relativity/global-audio.json",
      );
      const input = JSON.parse(await readFile(path, "utf8"));
      input.assets[0].license.id = "Unverified";
      await writeFile(path, `${JSON.stringify(input, null, 2)}\n`);
    },
  ];

  for (const mutate of mutations) {
    const fixtureRoot = await createAudioCheckFixture();
    try {
      await mutate(fixtureRoot);
      await assert.rejects(() =>
        generateGpsGlobalAudio({rootDir: fixtureRoot, mode: "check"}),
      );
    } finally {
      await rm(fixtureRoot, {recursive: true});
    }
  }
});
