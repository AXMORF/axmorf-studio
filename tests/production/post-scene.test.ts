import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  buildProductionPreviewAssembly,
  buildProductionPreviewEvidence,
  buildProductionPreviewMechanicalCheck,
} from "../../src/contracts";
import { readProductionRunStore } from "../../scripts/production/adapters/run-store";
import {
  runProductionPostScene,
  type PostSceneProductionDependencies,
} from "../../scripts/production/post-scene";
import { createDefaultPostSceneProductionDependencies } from "../../scripts/production/post-scene-default";
import {
  FIXED_PRODUCTION_NOW,
  createProductionFixture,
  markProductionBaselineReady,
  markProductionPostSceneRunning,
  markProductionSceneInputsFrozen,
} from "./fixture";
import {
  validPreviewAssemblyInput,
  validPreviewEvidenceInput,
} from "./preview-fixture";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

const createFixture = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-post-scene-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const fixture = await createProductionFixture(context, rootDir);
  await markProductionBaselineReady(fixture);
  const scenes = [
    {
      meaningId: "opening",
      assignmentFingerprint: sha("a"),
      resultFingerprint: sha("b"),
    },
    {
      meaningId: "conclusion",
      assignmentFingerprint: sha("c"),
      resultFingerprint: sha("d"),
    },
  ] as const;
  await markProductionSceneInputsFrozen({
    ...fixture,
    assignmentFingerprints: scenes.map(
      ({ meaningId, assignmentFingerprint }) => ({
        meaningId,
        fingerprint: assignmentFingerprint,
      }),
    ),
  });
  await markProductionPostSceneRunning({ ...fixture, sceneResults: scenes });
  return fixture;
};

const createDependencies = (
  calls: string[],
  requirementsFingerprint: string,
): PostSceneProductionDependencies => {
  const assembly = buildProductionPreviewAssembly({
    ...validPreviewAssemblyInput,
    requirementsFingerprint,
  });
  const evidence = buildProductionPreviewEvidence({
    ...validPreviewEvidenceInput,
    requirementsFingerprint,
    previewAssemblyFingerprint: assembly.assemblyFingerprint,
  });
  const check = buildProductionPreviewMechanicalCheck({
    storyId: evidence.storyId,
    requirementsFingerprint: evidence.requirementsFingerprint,
    previewAssemblyFingerprint: assembly.assemblyFingerprint,
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
  return {
    assertCurrentFreeze: async () => {
      calls.push("freeze-check");
    },
    preparePreview: async ({ mode }) => {
      calls.push(`preview-${mode}`);
      return assembly;
    },
    projectRegistry: async ({ mode }) => {
      calls.push(`registry-${mode}`);
      return {
        compositionId: evidence.compositionId,
        registryChecksum: sha("e"),
      };
    },
    listCompositions: async () => {
      calls.push("compositions");
    },
    renderPreview: async () => {
      calls.push("render");
      return evidence.media.fullPreview;
    },
    generateReviewMedia: async () => {
      calls.push("review-media");
      return {
        representativeStills: evidence.media.representativeStills,
        contactSheet: evidence.media.contactSheet,
      };
    },
    previewEvidence: async ({ mode }) => {
      calls.push(`evidence-${mode}`);
      return evidence;
    },
    mechanicalCheck: async ({ mode }) => {
      calls.push(`mechanical-${mode}`);
      return check;
    },
    checkCurrentPreview: async () => {
      calls.push("current-check");
      return { assembly, evidence, check };
    },
  };
};

test("runs the fixed post-scene pipeline and ends only at preview-ready", async (context) => {
  const fixture = await createFixture(context);
  const calls: string[] = [];
  const result = await runProductionPostScene({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    clock: () => FIXED_PRODUCTION_NOW,
    dependencies: createDependencies(
      calls,
      fixture.requirements.requirementsFingerprint,
    ),
  });
  assert.deepEqual(calls, [
    "freeze-check",
    "preview-write",
    "preview-check",
    "registry-write",
    "registry-check",
    "compositions",
    "render",
    "review-media",
    "evidence-write",
    "evidence-check",
    "mechanical-write",
    "mechanical-check",
  ]);
  assert.equal(result.status, "preview-ready");
  assert.equal(result.handoff, "awaiting explicit user preview decision");
  assert.equal(
    (await readProductionRunStore(fixture)).state.state,
    "preview-ready",
  );
  assert.doesNotMatch(
    JSON.stringify(result),
    /approved|reviewed|quality-pass|released/u,
  );
});

test("a current rerun is check-only and byte-stable", async (context) => {
  const fixture = await createFixture(context);
  const firstCalls: string[] = [];
  await runProductionPostScene({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    clock: () => FIXED_PRODUCTION_NOW,
    dependencies: createDependencies(
      firstCalls,
      fixture.requirements.requirementsFingerprint,
    ),
  });
  const statePath = join(
    fixture.rootDir,
    ".producer-runs",
    fixture.runId,
    "state.generated.json",
  );
  const before = await import("node:fs/promises").then(({ readFile, stat }) =>
    Promise.all([readFile(statePath), stat(statePath)]),
  );
  const calls: string[] = [];
  const repeated = await runProductionPostScene({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    clock: () => new Date("2026-08-04T01:00:00.000Z"),
    dependencies: createDependencies(
      calls,
      fixture.requirements.requirementsFingerprint,
    ),
  });
  const after = await import("node:fs/promises").then(({ readFile, stat }) =>
    Promise.all([readFile(statePath), stat(statePath)]),
  );
  assert.equal(repeated.noOp, true);
  assert.deepEqual(calls, ["current-check"]);
  assert.deepEqual(after[0], before[0]);
  assert.equal(after[1].mtimeMs, before[1].mtimeMs);
});

test("post-scene failure records central failure and stops later steps", async (context) => {
  const fixture = await createFixture(context);
  const calls: string[] = [];
  const dependencies = createDependencies(
    calls,
    fixture.requirements.requirementsFingerprint,
  );
  await assert.rejects(() =>
    runProductionPostScene({
      rootDir: fixture.rootDir,
      runId: fixture.runId,
      clock: () => FIXED_PRODUCTION_NOW,
      dependencies: {
        ...dependencies,
        preparePreview: async ({ mode }) => {
          calls.push(`preview-${mode}`);
          throw new Error("Coverage is incomplete.");
        },
      },
    }),
  );
  const state = (await readProductionRunStore(fixture)).state;
  assert.equal(state.state, "failed");
  assert.equal(state.failure?.stageId, "post-scene");
  assert.deepEqual(calls, ["freeze-check", "preview-write"]);
});

test("default composition listing does not suppress enumerable Remotion stdout", async () => {
  const calls: string[][] = [];
  const dependencies = createDefaultPostSceneProductionDependencies({
    runProcess: async (_command, args) => {
      calls.push([...args]);
      return {
        status: 0,
        stdout: args.includes("--log=error")
          ? ""
          : "RoundedAirplaneWindows 30 1080x1920 1102",
        stderr: "",
      };
    },
  });

  await dependencies.listCompositions({
    rootDir: "/repo",
    runId: "run-example",
    storyId: "rounded-airplane-windows",
    requirementsFingerprint: sha("a"),
    compositionId: "RoundedAirplaneWindows",
  });

  assert.deepEqual(calls, [
    ["compositions", "src/index.ts"],
  ]);
});
