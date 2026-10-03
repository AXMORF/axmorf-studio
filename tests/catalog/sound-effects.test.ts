import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ProducerAssetManifestSchema,
  buildSceneSoundPlan,
  computeResourceDescriptorFingerprint,
  resolveSceneSoundContributions,
} from "@axmorf/studio/contracts";
import {
  buildResourceCatalog,
  queryResourceCatalog,
} from "../../scripts/catalog/domain";
import {
  generateSoundEffectAssets,
  soundEffectDefinitions,
  soundEffectPublicPath,
} from "../../scripts/sound-effects/generate";
import { createScenePlans } from "../fixtures/scene/scene-input";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const seedRoot = "packages/studio/src/runtime/workspace-seed/files";
const checksum = (bytes: Buffer) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

test("prebuilt Scene sound effects have verified identities and clean PCM boundaries", async () => {
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
  const licenseChecksum = checksum(
    await readFile(join(repositoryRoot, "LICENSE")),
  );
  assert.equal(soundEffectDefinitions.length, 24);
  for (const definition of soundEffectDefinitions) {
    const path = soundEffectPublicPath(definition);
    const asset = manifest.assets.find(({ localPath }) => localPath === path);
    assert.ok(
      asset,
      `${definition.name} must be registered for Scene selection`,
    );
    assert.equal(asset.id, `asset.axmorf.sfx.${definition.name}-v1`);
    assert.equal(asset.allowedUse, "runtime-approved");
    assert.equal(asset.status, "approved");
    assert.equal(asset.mediaRole, "sound-effect");
    assert.equal(asset.license.id, "Apache-2.0");
    assert.equal(asset.license.sourceEvidenceFingerprint, licenseChecksum);

    const wav = await readFile(join(repositoryRoot, seedRoot, path));
    assert.equal(asset.checksum, checksum(wav));
    assert.equal(asset.media?.sizeBytes, wav.length);
    assert.equal(wav.toString("ascii", 0, 4), "RIFF");
    assert.equal(wav.readUInt32LE(4), wav.length - 8);
    assert.equal(wav.toString("ascii", 8, 16), "WAVEfmt ");
    assert.equal(wav.readUInt16LE(20), 1);
    assert.equal(wav.readUInt16LE(22), 2);
    assert.equal(wav.readUInt32LE(24), 48000);
    assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.toString("ascii", 36, 40), "data");
    assert.equal(wav.readUInt32LE(40), wav.length - 44);
    assert.equal((wav.length - 44) / 4 / 48000, asset.media?.durationInSeconds);
    assert.equal(asset.media?.codec, "pcm_s16le");
    assert.equal(asset.media?.sampleRate, 48000);
    for (const offset of [44, 46, wav.length - 4, wav.length - 2]) {
      assert.equal(wav.readInt16LE(offset), 0);
    }
    let peak = 0;
    let energy = 0;
    for (let offset = 44; offset < wav.length; offset += 2) {
      const sample = wav.readInt16LE(offset);
      peak = Math.max(peak, Math.abs(sample));
      energy += sample * sample;
    }
    assert.ok(
      peak >= 8000 && peak <= 14000,
      "leave headroom for narration and BGM",
    );
    assert.ok(energy > 0, "registered effects must contain audible samples");
  }
  await generateSoundEffectAssets({ rootDir: repositoryRoot, mode: "check" });
  const catalog = buildResourceCatalog(manifest.assets);
  const matches = queryResourceCatalog(catalog, {
    kind: "asset",
    tag: "motion-sync",
    text: null,
  });
  assert.equal(matches.length, 24);
  const whoosh = matches.find(
    ({ descriptor }) => descriptor.id === "asset.axmorf.sfx.whoosh-short-v1",
  );
  assert.ok(whoosh);
  const { task, anchors } = createScenePlans();
  const sound = buildSceneSoundPlan({
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId: task.meaningId,
    sceneDurationInFrames: 120,
    contributions: [
      {
        contributionId: "slide",
        resource: {
          schemaVersion: 1,
          resourceId: whoosh.descriptor.id,
          kind: "asset",
          role: "sound-effect",
          descriptorFingerprint: computeResourceDescriptorFingerprint(
            whoosh.descriptor,
          ),
          catalogFingerprint: catalog.catalogFingerprint,
        },
        timing: { kind: "anchor", eventId: "outline-closes", offsetFrames: -4 },
        durationInFrames: 11,
        volume: 0.3,
      },
    ],
  });
  assert.deepEqual(
    resolveSceneSoundContributions({ soundPlan: sound, syncAnchors: anchors }),
    [{ contributionId: "slide", startFrame: 50, endFrame: 61 }],
  );
});

test("mouse effects expose separate gestures and two audible clicks in the double-click", async () => {
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
  const matches = queryResourceCatalog(buildResourceCatalog(manifest.assets), {
    kind: "asset",
    tag: "mouse",
    text: null,
  });
  assert.deepEqual(
    matches.map(({ descriptor }) => descriptor.id),
    [
      "asset.axmorf.sfx.mouse-click-v1",
      "asset.axmorf.sfx.mouse-double-click-v1",
      "asset.axmorf.sfx.mouse-down-v1",
      "asset.axmorf.sfx.mouse-right-click-v1",
      "asset.axmorf.sfx.mouse-up-v1",
      "asset.axmorf.sfx.mouse-wheel-tick-v1",
    ],
  );
  const down = matches.find(
    ({ descriptor }) => descriptor.id === "asset.axmorf.sfx.mouse-down-v1",
  )!.descriptor;
  const up = matches.find(
    ({ descriptor }) => descriptor.id === "asset.axmorf.sfx.mouse-up-v1",
  )!.descriptor;
  assert.ok(down.kind === "asset");
  assert.ok(up.kind === "asset");
  assert.notEqual(
    down.checksum,
    up.checksum,
    "press and release need distinguishable assets",
  );
  const doubleClick = matches.find(
    ({ descriptor }) =>
      descriptor.id === "asset.axmorf.sfx.mouse-double-click-v1",
  )!.descriptor;
  assert.ok(doubleClick.kind === "asset");
  const wav = await readFile(
    join(repositoryRoot, seedRoot, doubleClick.localPath),
  );
  const energy = (start: number, end: number) => {
    let total = 0;
    const from = Math.round(start * 48000);
    const to = Math.round(end * 48000);
    for (let frame = from; frame < to; frame += 1) {
      const sample = wav.readInt16LE(44 + frame * 4);
      total += sample * sample;
    }
    return total / (to - from);
  };
  assert.ok(energy(0, 0.025) > 8 * energy(0.12, 0.16));
  assert.ok(energy(0.18, 0.205) > 8 * energy(0.12, 0.16));
  assert.ok(energy(0.055, 0.075) > 8 * energy(0.12, 0.16));
  assert.ok(energy(0.235, 0.255) > 8 * energy(0.12, 0.16));
});

test("sound effect preparation is idempotent and refuses conflicting prebuilt bytes", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-sfx-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await assert.rejects(
    generateSoundEffectAssets({ rootDir, mode: "check" }),
    /Sound effect is missing/u,
  );
  await generateSoundEffectAssets({ rootDir, mode: "write" });
  await generateSoundEffectAssets({ rootDir, mode: "write" });
  await generateSoundEffectAssets({ rootDir, mode: "check" });
  const path = join(
    rootDir,
    seedRoot,
    soundEffectPublicPath(soundEffectDefinitions[0]),
  );
  await writeFile(path, "conflicting audio");
  await assert.rejects(
    generateSoundEffectAssets({ rootDir, mode: "write" }),
    /Sound effect bytes conflict/u,
  );
  assert.equal(await readFile(path, "utf8"), "conflicting audio");
});
