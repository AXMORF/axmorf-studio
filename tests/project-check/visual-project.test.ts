import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  buildSceneCoverageMap,
  buildSceneFallbackDeclaration,
  generateVisualSemanticTiming,
  parseNarrativeProjectSource,
} from "@axmorf/studio/contracts";
import { generateResourceCatalog } from "../../scripts/catalog/generate";
import { readGeneratedResourceCatalog } from "../../scripts/catalog/project-files";
import {
  checkFinalSourceHealth,
  runFinalMechanicalCheck,
} from "../../scripts/project-check/final-run";
import { runProjectCheckCli } from "../../scripts/project-check/cli";
import { writeNarrativeAutoCheckIfPassed } from "../../scripts/project-check/report-files";
import {
  checkNarrativeSourceHealth,
  runNarrativeAutoCheck,
} from "../../scripts/project-check/run";
import { generateProjectRegistry } from "../../scripts/registry/generate";
import { loadProjectRegistrationEntry } from "../../scripts/registry/project-files";
import {
  WORKSPACE_CAPABILITY_FACADE_SOURCE,
  WORKSPACE_REMOTION_FACADE_PATH,
} from "../../packages/studio/src/remotion/catalog/capability-descriptors";
import {
  WORKSPACE_STYLE_FACADE_PATH,
  WORKSPACE_STYLE_FACADE_SOURCE,
} from "../../packages/studio/src/remotion/catalog/style-descriptors";
import {
  buildValidSealedNarrationManifest,
  validNarrationSpec,
  validRenderSpec,
  validStorySpec,
  validVideoBrief,
} from "../fixtures/narrative";
import { validProjectCreateInput } from "../fixtures/project-create";

const writeJson = async (path: string, value: unknown) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
};

const createVisualProject = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-visual-project-check-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const storyId = "visual-example";
  const projectDir = join(rootDir, "src/projects", storyId);
  const source = parseNarrativeProjectSource({
    brief: { ...validVideoBrief, storyId },
    story: {
      schemaVersion: 3,
      storyId,
      title: "Visual explanation",
      beats: [
        {
          kind: "visual-scene",
          meaningId: "cause",
          narrativePurpose: "Show the cause.",
          durationInFrames: 90,
        },
        {
          kind: "visual-scene",
          meaningId: "effect",
          narrativePurpose: "Show its effect.",
          durationInFrames: 75,
        },
      ],
    },
    narration: null,
    render: validRenderSpec,
  });
  const timing = generateVisualSemanticTiming({
    story: source.story,
    render: source.render,
  });
  await Promise.all([
    ...Object.entries(source).map(([name, value]) =>
      writeJson(join(projectDir, `${name}.json`), value),
    ),
    writeJson(
      join(projectDir, "generated/sealed-narration.generated.json"),
      null,
    ),
    writeJson(
      join(projectDir, "generated/mastered-narration.generated.json"),
      null,
    ),
    writeJson(
      join(projectDir, "generated/semantic-timing.generated.json"),
      timing,
    ),
  ]);
  await writeFile(
    join(projectDir, "Composition.tsx"),
    "export default () => null;\n",
  );
  await generateProjectRegistry({ rootDir, mode: "write" });
  return { rootDir, projectDir, storyId, source, timing };
};

test("visual Project validates its authored timeline and explicit narration absence without media processes", async (context) => {
  const fixture = await createVisualProject(context);
  const entry = await loadProjectRegistrationEntry({
    rootDir: fixture.rootDir,
    compositionPath: `src/projects/${fixture.storyId}/Composition.tsx`,
  });
  assert.equal(entry.descriptor.durationInFrames, 192);
  const sourceHealth = await checkNarrativeSourceHealth({
    rootDir: fixture.rootDir,
    projectId: fixture.storyId,
  });
  assert.equal(sourceHealth.aggregateStatus, "pass");
  let mediaProcessCount = 0;
  const report = await runNarrativeAutoCheck({
    rootDir: fixture.rootDir,
    projectId: fixture.storyId,
    runNarrativeBaselineEvidenceProcess: async () => {
      mediaProcessCount += 1;
      throw new Error(
        "Visual narrative validation must not require narration media.",
      );
    },
  });
  assert.equal(report.aggregateStatus, "pass");
  assert.equal(report.timingAlgorithmId, "authored-frames-v1");
  assert.equal(report.inputIdentity.generationInputFingerprint, null);
  assert.equal(report.inputIdentity.sealedNarrationFingerprint, null);
  assert.equal(report.inputIdentity.masteredNarrationFingerprint, null);
  assert.equal(report.inputIdentity.baselineEvidenceFingerprint, null);
  assert.deepEqual(
    report.checks.find(({ checkId }) => checkId === "sealed-narration")
      ?.evidenceIds,
    ["sealed-manifest"],
  );
  assert.equal(
    report.checks.find(({ checkId }) => checkId === "baseline-evidence")
      ?.status,
    "not-applicable",
  );
  assert.notEqual(
    report.evidenceRefs.find(
      ({ evidenceId }) => evidenceId === "sealed-manifest",
    )?.checksum,
    null,
  );
  assert.equal(
    report.evidenceRefs.find(({ evidenceId }) => evidenceId === "complete-wav")
      ?.checksum,
    null,
  );
  assert.equal(mediaProcessCount, 0);
  await writeNarrativeAutoCheckIfPassed({ rootDir: fixture.rootDir, report });
  await runProjectCheckCli(
    ["--project", fixture.storyId, "--level", "narrative"],
    { rootDir: fixture.rootDir, stdout: () => undefined },
  );
  assert.equal(
    await readFile(
      join(fixture.projectDir, "generated/sealed-narration.generated.json"),
      "utf8",
    ),
    "null\n",
  );
  await assert.rejects(
    () =>
      readFile(
        join(
          fixture.rootDir,
          "public/projects",
          fixture.storyId,
          "narration/complete.wav",
        ),
      ),
    { code: "ENOENT" },
  );
});

test("visual Project refuses stale authored timing and missing or retained narration artifacts", async (context) => {
  const fixture = await createVisualProject(context);
  const changedStory = {
    ...fixture.source.story,
    beats: fixture.source.story.beats.map((beat, index) =>
      index === 0 ? { ...beat, durationInFrames: 91 } : beat,
    ),
  };
  await writeJson(join(fixture.projectDir, "story.json"), changedStory);
  await assert.rejects(() =>
    checkNarrativeSourceHealth({
      rootDir: fixture.rootDir,
      projectId: fixture.storyId,
    }),
  );
  const stale = await runNarrativeAutoCheck({
    rootDir: fixture.rootDir,
    projectId: fixture.storyId,
  });
  assert.equal(stale.aggregateStatus, "fail");
  assert.equal(
    stale.checks.find(({ checkId }) => checkId === "semantic-timing")?.status,
    "fail",
  );
  await writeJson(join(fixture.projectDir, "story.json"), fixture.source.story);
  await writeJson(
    join(fixture.projectDir, "generated/sealed-narration.generated.json"),
    buildValidSealedNarrationManifest(),
  );
  const retained = await runNarrativeAutoCheck({
    rootDir: fixture.rootDir,
    projectId: fixture.storyId,
  });
  assert.equal(retained.aggregateStatus, "fail");
  assert.equal(
    retained.checks.find(({ checkId }) => checkId === "sealed-narration")
      ?.status,
    "fail",
  );
  await writeJson(
    join(fixture.projectDir, "generated/sealed-narration.generated.json"),
    null,
  );
  await rm(
    join(fixture.projectDir, "generated/mastered-narration.generated.json"),
  );
  const missing = await runNarrativeAutoCheck({
    rootDir: fixture.rootDir,
    projectId: fixture.storyId,
  });
  assert.equal(missing.aggregateStatus, "fail");
  assert.equal(
    missing.checks.find(({ checkId }) => checkId === "sealed-narration")
      ?.status,
    "fail",
  );
});

test("narrated Projects still require actual sealed narration instead of visual null markers", async (context) => {
  const fixture = await createVisualProject(context);
  await writeJson(join(fixture.projectDir, "story.json"), {
    ...validStorySpec,
    storyId: fixture.storyId,
  });
  await writeJson(
    join(fixture.projectDir, "narration.json"),
    validNarrationSpec,
  );
  await assert.rejects(() =>
    generateProjectRegistry({ rootDir: fixture.rootDir, mode: "check" }),
  );
  await assert.rejects(() =>
    checkNarrativeSourceHealth({
      rootDir: fixture.rootDir,
      projectId: fixture.storyId,
    }),
  );
  const report = await runNarrativeAutoCheck({
    rootDir: fixture.rootDir,
    projectId: fixture.storyId,
  });
  assert.equal(report.aggregateStatus, "fail");
  assert.equal(report.timingAlgorithmId, undefined);
  assert.equal(
    report.checks.find(({ checkId }) => checkId === "sealed-narration")?.status,
    "fail",
  );
});

test("full final Project check accepts visual timing through the current Catalog and fallback Scene branch", async (context) => {
  const fixture = await createVisualProject(context);
  for (const [path, source] of [
    [WORKSPACE_REMOTION_FACADE_PATH, WORKSPACE_CAPABILITY_FACADE_SOURCE],
    [WORKSPACE_STYLE_FACADE_PATH, WORKSPACE_STYLE_FACADE_SOURCE],
  ] as const) {
    await mkdir(dirname(join(fixture.rootDir, path)), { recursive: true });
    await writeFile(join(fixture.rootDir, path), source);
  }
  await generateResourceCatalog({ rootDir: fixture.rootDir, mode: "write" });
  const catalog = await readGeneratedResourceCatalog(fixture.rootDir);
  await writeJson(join(fixture.projectDir, "visual-style.json"), {
    schemaVersion: 1,
    storyId: fixture.storyId,
    resourceCatalogFingerprint: catalog.catalogFingerprint,
    ...validProjectCreateInput.visualStyle,
  });
  const coverage = buildSceneCoverageMap({
    storyId: fixture.storyId,
    storyBeatOrder: fixture.source.story.beats.map(
      ({ meaningId }) => meaningId,
    ),
    packages: [],
    fallbacks: fixture.source.story.beats.map(({ meaningId }, index) =>
      buildSceneFallbackDeclaration({
        meaningId,
        taskInputFingerprint: `sha256:${String(index).repeat(64)}`,
        reason: "Explicit fixture fallback.",
      }),
    ),
    stalePackages: [],
  });
  await writeJson(
    join(fixture.projectDir, "generated/scene-coverage.generated.json"),
    coverage,
  );
  const narrative = await runNarrativeAutoCheck({
    rootDir: fixture.rootDir,
    projectId: fixture.storyId,
  });
  await writeNarrativeAutoCheckIfPassed({
    rootDir: fixture.rootDir,
    report: narrative,
  });
  assert.equal(
    (
      await checkFinalSourceHealth({
        rootDir: fixture.rootDir,
        projectId: fixture.storyId,
      })
    ).aggregateStatus,
    "pass",
  );
  const report = await runFinalMechanicalCheck({
    rootDir: fixture.rootDir,
    projectId: fixture.storyId,
  });
  assert.equal(report.aggregateStatus, "pass");
  assert.equal(
    report.checks.find(({ checkId }) => checkId === "narrative")?.status,
    "pass",
  );
  assert.equal(
    report.checks.find(({ checkId }) => checkId === "scene-coverage")?.status,
    "pass",
  );
  assert.equal(
    report.checks.find(({ checkId }) => checkId === "scene-packages")?.status,
    "not-applicable",
  );
});
