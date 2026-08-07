import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  GPS_M7_AUDIO_CUES,
  generateGpsLocalAudio,
} from "../../src/projects/gps-relativity/tools/verification/scene-audio";
import {
  GPS_M7_MEANING_IDS,
  buildGpsM7FrozenInputs,
  freezeGpsM7Inputs,
} from "../../src/projects/gps-relativity/tools/verification/scene-inputs";
import {
  ResourceCatalogSchema,
  SceneTaskInputSchema,
  VisualStyleSpecSchema,
  computeVisualStyleFingerprint,
} from "../../src/contracts";

const rootDir = process.cwd();

test("M7 GPS local cues are deterministic canonical PCM and check is read-only", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "rsp-m7-audio-"));
  await generateGpsLocalAudio({ rootDir: temporaryRoot, mode: "write" });
  const before = await Promise.all(
    GPS_M7_AUDIO_CUES.map(async (cue) => {
      const path = join(temporaryRoot, cue.localPath);
      const bytes = await readFile(path);
      const metadata = await stat(path);
      assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
      assert.equal(bytes.subarray(8, 12).toString("ascii"), "WAVE");
      assert.equal(bytes.readUInt16LE(20), 1);
      assert.equal(bytes.readUInt16LE(22), 1);
      assert.equal(bytes.readUInt32LE(24), 48_000);
      assert.equal(bytes.readUInt16LE(34), 16);
      return { bytes, mtimeMs: metadata.mtimeMs };
    }),
  );
  await generateGpsLocalAudio({ rootDir: temporaryRoot, mode: "write" });
  await generateGpsLocalAudio({ rootDir: temporaryRoot, mode: "check" });
  const after = await Promise.all(
    GPS_M7_AUDIO_CUES.map(async (cue) => {
      const path = join(temporaryRoot, cue.localPath);
      return {
        bytes: await readFile(path),
        mtimeMs: (await stat(path)).mtimeMs,
      };
    }),
  );
  assert.deepEqual(after, before);
});

test("M7 GPS audio check fails closed on missing and drifted bytes", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "rsp-m7-audio-drift-"));
  await assert.rejects(
    generateGpsLocalAudio({ rootDir: temporaryRoot, mode: "check" }),
    /missing/,
  );
  await generateGpsLocalAudio({ rootDir: temporaryRoot, mode: "write" });
  const first = GPS_M7_AUDIO_CUES[0];
  assert.ok(first);
  const path = join(temporaryRoot, first.localPath);
  const bytes = await readFile(path);
  bytes[bytes.length - 1] ^= 1;
  await import("node:fs/promises").then(({ writeFile }) =>
    writeFile(path, Uint8Array.from(Array.from(bytes))),
  );
  await assert.rejects(
    generateGpsLocalAudio({ rootDir: temporaryRoot, mode: "check" }),
    /stale/,
  );
});

test("M7 GPS frozen style and five task inputs bind current authority", async () => {
  const frozen = await buildGpsM7FrozenInputs(rootDir);
  const catalog = ResourceCatalogSchema.parse(
    JSON.parse(
      await readFile(
        join(rootDir, "src/remotion/catalog/resource-catalog.generated.json"),
        "utf8",
      ),
    ),
  );
  const visualStyle = VisualStyleSpecSchema.parse(frozen.visualStyle);
  const styleEntry = catalog.entries.find(
    ({ descriptor }) =>
      descriptor.kind === "style-profile" &&
      descriptor.styleProfileId === visualStyle.styleProfileId,
  );
  assert.ok(styleEntry);
  assert.equal(
    frozen.visualStyleFingerprint,
    computeVisualStyleFingerprint({
      visualStyle,
      resolvedStyleDescriptorFingerprint: styleEntry.descriptorFingerprint,
    }),
  );
  assert.deepEqual(
    frozen.tasks.map((task) => task.meaningId),
    GPS_M7_MEANING_IDS,
  );
  for (const rawTask of frozen.tasks) {
    const task = SceneTaskInputSchema.parse(rawTask);
    const expectedSceneRoot = `src/projects/gps-relativity/scenes/${task.meaningId}`;
    const expectedPublicRoot = `public/projects/gps-relativity/scenes/${task.meaningId}`;
    assert.equal(task.allowedDirectories.sceneRoot, expectedSceneRoot);
    assert.equal(task.allowedDirectories.publicAssetRoot, expectedPublicRoot);
    assert.equal(task.allowedSnapshots.length, 0);
    assert.ok(
      task.allowedResourceIds.some((id) =>
        id.startsWith(`asset.gps-${task.meaningId}`),
      ),
    );
    assert.ok(
      task.allowedResourceIds.every((id) => !id.startsWith("asset.m6-proof")),
    );
  }
});

test("M7 GPS frozen artifacts are current and check does not rewrite", async () => {
  await freezeGpsM7Inputs({ rootDir, mode: "check" });
});
