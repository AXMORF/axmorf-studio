import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ProductionPreviewEvidenceSchema,
  ProductionPreviewMechanicalCheckSchema,
  buildProductionPreviewEvidence,
  buildProductionPreviewMechanicalCheck,
  serializeCanonicalJson,
} from "../../src/contracts";
import { inspectProductionPreviewMedia } from "../../scripts/production/application/preview-evidence";
import {
  writeOrCheckProductionPreviewEvidence,
  writeOrCheckProductionPreviewMechanicalCheck,
} from "../../scripts/production/application/preview-evidence";
import {
  validGlobalVisualIdentity,
  validPreviewEvidenceInput,
} from "./preview-fixture";

test("accepts only mechanically-ready current preview evidence", () => {
  const evidence = buildProductionPreviewEvidence(validPreviewEvidenceInput);
  assert.equal(evidence.aggregateStatus, "mechanically-ready");
  assert.equal(
    ProductionPreviewEvidenceSchema.parse(evidence).evidenceFingerprint,
    evidence.evidenceFingerprint,
  );
  assert.throws(() =>
    buildProductionPreviewEvidence({
      ...validPreviewEvidenceInput,
      aggregateStatus: "approved",
    }),
  );
  assert.throws(() =>
    buildProductionPreviewEvidence({
      ...validPreviewEvidenceInput,
      technical: {
        ...validPreviewEvidenceInput.technical,
        actual: {
          ...validPreviewEvidenceInput.technical.actual,
          frameCount: 299,
        },
      },
    }),
  );
});

test("future preview evidence and checks are Run-owned", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-preview-run-owned-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const runId = "story-example-run-001";
  const evidence = buildProductionPreviewEvidence(validPreviewEvidenceInput);
  const check = buildProductionPreviewMechanicalCheck({
    storyId: evidence.storyId,
    requirementsFingerprint: evidence.requirementsFingerprint,
    previewAssemblyFingerprint: evidence.previewAssemblyFingerprint,
    evidenceFingerprint: evidence.evidenceFingerprint,
    checks: {
      contracts: "pass",
      sceneCoverage: "pass",
      rendererRegistry: "pass",
      projections: "pass",
      composition: "pass",
      media: "pass",
      completeDecode: "pass",
      enhancementAbsence: "pass",
    },
    aggregateStatus: "mechanically-ready",
    handoff: "awaiting explicit user preview decision",
  });

  await writeOrCheckProductionPreviewEvidence({
    rootDir,
    runId,
    evidence,
    mode: "write",
  });
  await writeOrCheckProductionPreviewMechanicalCheck({
    rootDir,
    runId,
    check,
    mode: "write",
  });
  await access(
    join(
      rootDir,
      `.producer-runs/${runId}/artifacts/production-preview-evidence.generated.json`,
    ),
  );
  await access(
    join(
      rootDir,
      `.producer-runs/${runId}/artifacts/production-preview-mechanical-check.generated.json`,
    ),
  );
  await assert.rejects(() =>
    access(
      join(
        rootDir,
        `src/projects/${evidence.storyId}/generated/production-preview-evidence.generated.json`,
      ),
    ),
  );

  const legacyRepositoryPath = `src/projects/${evidence.storyId}/generated/production-preview-evidence.generated.json`;
  await mkdir(join(rootDir, `src/projects/${evidence.storyId}/generated`), {
    recursive: true,
  });
  await writeFile(
    join(rootDir, legacyRepositoryPath),
    `${serializeCanonicalJson(evidence)}\n`,
  );
  await assert.doesNotReject(() =>
    writeOrCheckProductionPreviewEvidence({
      rootDir,
      runId,
      evidence,
      mode: "check",
      artifactRepositoryPath: legacyRepositoryPath,
    }),
  );
});

test("v2 evidence and mechanical check bind current GlobalVisual presence", () => {
  const evidence = buildProductionPreviewEvidence({
    ...validPreviewEvidenceInput,
    globalVisual: validGlobalVisualIdentity,
    currentChecks: {
      ...validPreviewEvidenceInput.currentChecks,
      globalVisual: "current",
    },
    absentEnhancements: {
      globalSoundPlan: true,
      bgm: true,
      crossSceneAmbience: true,
      ducking: true,
    },
    presentEnhancements: { globalVisualLayers: true },
  });
  assert.equal(evidence.schemaVersion, 2);
  assert.equal(evidence.currentChecks.globalVisual, "current");
  assert.equal(evidence.presentEnhancements.globalVisualLayers, true);
  const check = buildProductionPreviewMechanicalCheck({
    storyId: evidence.storyId,
    requirementsFingerprint: evidence.requirementsFingerprint,
    previewAssemblyFingerprint: evidence.previewAssemblyFingerprint,
    evidenceFingerprint: evidence.evidenceFingerprint,
    checks: {
      contracts: "pass",
      sceneCoverage: "pass",
      rendererRegistry: "pass",
      projections: "pass",
      globalVisual: "pass",
      composition: "pass",
      media: "pass",
      completeDecode: "pass",
      enhancementPolicy: "pass",
    },
    aggregateStatus: "mechanically-ready",
    handoff: "awaiting explicit user preview decision",
  });
  assert.equal(check.schemaVersion, 2);
  assert.doesNotThrow(() => ProductionPreviewEvidenceSchema.parse(evidence));
  assert.doesNotThrow(() =>
    ProductionPreviewMechanicalCheckSchema.parse(check),
  );
});

test("inspects exact streams frames duration and complete decode with a fake runner", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-preview-evidence-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const relativePath = "out/story-example/production/run/preview.mp4";
  await mkdir(join(rootDir, "out/story-example/production/run"), {
    recursive: true,
  });
  await writeFile(join(rootDir, relativePath), "synthetic-preview-bytes");
  const commands: string[] = [];
  const technical = await inspectProductionPreviewMedia({
    rootDir,
    relativePath,
    expected: { width: 1920, height: 1080, fps: 30, frameCount: 300 },
    runProcess: async (command) => {
      commands.push(command);
      return command.endsWith("ffprobe")
        ? {
            status: 0,
            stderr: "",
            stdout: JSON.stringify({
              streams: [
                {
                  codec_type: "video",
                  codec_name: "h264",
                  width: 1920,
                  height: 1080,
                  avg_frame_rate: "30/1",
                  nb_read_frames: "300",
                  duration: "10.000000",
                },
                { codec_type: "audio", codec_name: "aac" },
              ],
              format: { duration: "10.045000" },
            }),
          }
        : { status: 0, stdout: "", stderr: "" };
    },
  });
  assert.equal(technical.actual.decodedToEof, true);
  assert.deepEqual(commands, ["ffprobe", "ffmpeg"]);
});

test("rejects truncated media and decode failures", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-preview-truncated-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const relativePath = "out/story-example/production/run/preview.mp4";
  await mkdir(join(rootDir, "out/story-example/production/run"), {
    recursive: true,
  });
  await writeFile(join(rootDir, relativePath), "truncated-preview-bytes");
  await assert.rejects(() =>
    inspectProductionPreviewMedia({
      rootDir,
      relativePath,
      expected: { width: 1920, height: 1080, fps: 30, frameCount: 300 },
      runProcess: async (command) =>
        command.endsWith("ffprobe")
          ? {
              status: 0,
              stderr: "",
              stdout: JSON.stringify({
                streams: [
                  {
                    codec_type: "video",
                    codec_name: "h264",
                    width: 1920,
                    height: 1080,
                    avg_frame_rate: "30/1",
                    nb_read_frames: "299",
                  },
                  { codec_type: "audio", codec_name: "aac" },
                ],
                format: { duration: "9.9" },
              }),
            }
          : { status: 1, stdout: "", stderr: "decode failed" },
    }),
  );
});
