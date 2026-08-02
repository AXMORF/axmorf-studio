import assert from "node:assert/strict";
import { appendFile, readFile, rm, writeFile } from "node:fs/promises";
import test from "node:test";

import {
  NARRATIVE_CORE_VERSION,
  NarrationSpecSchema,
  RenderSpecSchema,
  SealedNarrationManifestSchema,
  StorySpecSchema,
  computeGenerationInputFingerprint,
  computeNarrativeBaselineFingerprint,
  computeSealedNarrationFingerprint,
  computeStoryFingerprint,
  parseNarrativeProjectSource,
  validateM1ArtifactBundle,
  type NarrativeAutoCheckId,
} from "../../src/contracts";
import { loadProjectRegistrationEntry } from "../../scripts/registry/project-files";
import {
  checkPersistedNarrativeAutoCheck,
  writeNarrativeAutoCheckIfPassed,
} from "../../scripts/project-check/report-files";
import { runNarrativeAutoCheck } from "../../scripts/project-check/run";
import {
  createM4ProjectFixture,
  snapshotM4FixtureBytes,
  type M4ProjectFixture,
} from "../fixtures/m4-project";

const readJson = async (path: string): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;

const writeJson = (path: string, value: unknown) =>
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");

const checkStatus = (
  report: Awaited<ReturnType<typeof runNarrativeAutoCheck>>,
  checkId: NarrativeAutoCheckId,
) => report.checks.find((check) => check.checkId === checkId)?.status;

const runFailedWithoutOverwrite = async (fixture: M4ProjectFixture) => {
  const afterMutation = await snapshotM4FixtureBytes(fixture);
  const report = await runNarrativeAutoCheck({
    rootDir: fixture.rootDir,
    projectId: fixture.storyId,
    runM3EvidenceProcess: fixture.runProcess,
  });
  assert.equal(report.aggregateStatus, "fail");
  await assert.rejects(() =>
    writeNarrativeAutoCheckIfPassed({ rootDir: fixture.rootDir, report }),
  );
  assert.deepEqual(await snapshotM4FixtureBytes(fixture), afterMutation);
  assert.ok(
    fixture.processCalls.every(
      (call) => call.startsWith("ffmpeg ") || call.startsWith("ffprobe "),
    ),
  );
  return report;
};

test("Story semantic-only change invalidates StoryCheck downstream but preserves narration timing identities", async (context) => {
  const fixture = await createM4ProjectFixture(context);
  const story = await readJson(fixture.paths.story);
  story.title = "Changed semantic title";
  const beats = story.beats as Array<Record<string, unknown>>;
  beats[0] = { ...beats[0], narrativePurpose: "Changed purpose only." };
  await writeJson(fixture.paths.story, story);
  const report = await runFailedWithoutOverwrite(fixture);
  assert.notEqual(
    report.inputIdentity.storyFingerprint,
    fixture.initialReport.inputIdentity.storyFingerprint,
  );
  assert.equal(
    report.inputIdentity.generationInputFingerprint,
    fixture.initialReport.inputIdentity.generationInputFingerprint,
  );
  assert.equal(
    report.inputIdentity.sealedNarrationFingerprint,
    fixture.initialReport.inputIdentity.sealedNarrationFingerprint,
  );
  assert.equal(checkStatus(report, "story-check"), "fail");
});

test("ttsText change forks generation identity and makes the old seal timing and downstream stale", async (context) => {
  const fixture = await createM4ProjectFixture(context);
  const story = await readJson(fixture.paths.story);
  const beats = story.beats as Array<Record<string, unknown>>;
  const chunks = beats[0].ttsChunks as Array<Record<string, unknown>>;
  chunks[0] = { ...chunks[0], ttsText: "Changed authored narration." };
  await writeJson(fixture.paths.story, story);
  const parsedStory = StorySpecSchema.parse(story);
  const narration = NarrationSpecSchema.parse(
    await readJson(fixture.paths.narration),
  );
  assert.notEqual(
    computeGenerationInputFingerprint(parsedStory, narration),
    fixture.initialReport.inputIdentity.generationInputFingerprint,
  );
  const report = await runFailedWithoutOverwrite(fixture);
  assert.equal(checkStatus(report, "sealed-narration"), "fail");
  assert.equal(checkStatus(report, "semantic-timing"), "fail");
});

test("NarrationSpec change invalidates StoryCheck seal timing and downstream without changing Story", async (context) => {
  const fixture = await createM4ProjectFixture(context);
  const story = StorySpecSchema.parse(await readJson(fixture.paths.story));
  const originalStoryFingerprint = computeStoryFingerprint(story);
  const narration = await readJson(fixture.paths.narration);
  narration.voiceProfileId = "alternate-science-voice";
  await writeJson(fixture.paths.narration, narration);
  assert.notEqual(
    computeGenerationInputFingerprint(
      story,
      NarrationSpecSchema.parse(narration),
    ),
    fixture.initialReport.inputIdentity.generationInputFingerprint,
  );
  const report = await runFailedWithoutOverwrite(fixture);
  assert.equal(report.inputIdentity.storyFingerprint, originalStoryFingerprint);
  assert.equal(checkStatus(report, "story-check"), "fail");
  assert.equal(checkStatus(report, "sealed-narration"), "fail");
});

test("RenderSpec timing change preserves generation and sealed audio but fails SemanticTiming", async (context) => {
  const fixture = await createM4ProjectFixture(context);
  const render = await readJson(fixture.paths.render);
  render.leadInFrames = 16;
  await writeJson(fixture.paths.render, render);
  const report = await runFailedWithoutOverwrite(fixture);
  assert.equal(
    report.inputIdentity.generationInputFingerprint,
    fixture.initialReport.inputIdentity.generationInputFingerprint,
  );
  assert.equal(
    report.inputIdentity.sealedNarrationFingerprint,
    fixture.initialReport.inputIdentity.sealedNarrationFingerprint,
  );
  assert.equal(checkStatus(report, "sealed-narration"), "pass");
  assert.equal(checkStatus(report, "semantic-timing"), "fail");
});

test("RenderSpec registration change preserves narration timing and invalidates registry", async (context) => {
  const fixture = await createM4ProjectFixture(context);
  const render = await readJson(fixture.paths.render);
  render.compositionId = "GpsRelativityChanged";
  render.width = 1280;
  await writeJson(fixture.paths.render, render);
  const report = await runFailedWithoutOverwrite(fixture);
  assert.equal(checkStatus(report, "sealed-narration"), "pass");
  assert.equal(checkStatus(report, "semantic-timing"), "pass");
  assert.equal(checkStatus(report, "project-registry"), "fail");
});

test("RenderSpec Baseline-only change keeps registry entry identity but invalidates Baseline bytes", async (context) => {
  const fixture = await createM4ProjectFixture(context);
  const render = await readJson(fixture.paths.render);
  render.locale = "en-US";
  await writeJson(fixture.paths.render, render);
  const changedEntry = await loadProjectRegistrationEntry({
    rootDir: fixture.rootDir,
    compositionPath: "src/projects/gps-relativity/Composition.tsx",
  });
  assert.equal(
    changedEntry.projectRegistryEntryFingerprint,
    fixture.initialReport.inputIdentity.projectRegistryEntryFingerprint,
  );
  assert.notEqual(
    changedEntry.narrativeBaselineFingerprint,
    fixture.initialReport.inputIdentity.narrativeBaselineFingerprint,
  );
  const report = await runFailedWithoutOverwrite(fixture);
  assert.equal(checkStatus(report, "sealed-narration"), "pass");
  assert.equal(checkStatus(report, "semantic-timing"), "pass");
  assert.equal(checkStatus(report, "project-registry"), "fail");
});

test("valid-shape manifest identity drift fails physical checksum and all timing consumers", async (context) => {
  const fixture = await createM4ProjectFixture(context);
  const manifest = await readJson(fixture.paths.manifest);
  const { sealedNarrationFingerprint: _oldFingerprint, ...input } = manifest;
  assert.equal(typeof _oldFingerprint, "string");
  const completeAudio = input.completeAudio as Record<string, unknown>;
  completeAudio.checksum = `sha256:${"0".repeat(64)}`;
  const parsedInput = {
    ...input,
    completeAudio,
  };
  await writeJson(fixture.paths.manifest, {
    ...parsedInput,
    sealedNarrationFingerprint: computeSealedNarrationFingerprint(parsedInput),
  });
  const report = await runFailedWithoutOverwrite(fixture);
  assert.equal(checkStatus(report, "sealed-narration"), "fail");
  assert.notEqual(
    report.inputIdentity.sealedNarrationFingerprint,
    fixture.initialReport.inputIdentity.sealedNarrationFingerprint,
  );
});

test("missing complete WAV fails sealed narration without changing stored identities", async (context) => {
  const fixture = await createM4ProjectFixture(context);
  await rm(fixture.paths.completeWav);
  const report = await runFailedWithoutOverwrite(fixture);
  assert.equal(checkStatus(report, "sealed-narration"), "fail");
  assert.equal(
    report.inputIdentity.sealedNarrationFingerprint,
    fixture.initialReport.inputIdentity.sealedNarrationFingerprint,
  );
});

test("one-byte chunk WAV corruption fails sealed checksum and does not rewrite media", async (context) => {
  const fixture = await createM4ProjectFixture(context);
  await appendFile(fixture.paths.firstChunkWav, Uint8Array.from([0]));
  const report = await runFailedWithoutOverwrite(fixture);
  assert.equal(checkStatus(report, "sealed-narration"), "fail");
  assert.equal(
    report.inputIdentity.sealedNarrationFingerprint,
    fixture.initialReport.inputIdentity.sealedNarrationFingerprint,
  );
});

test("SemanticTiming generated drift fails timing and downstream without changing sealed WAV", async (context) => {
  const fixture = await createM4ProjectFixture(context);
  const timing = await readJson(fixture.paths.timing);
  timing.durationInFrames = 1732;
  await writeJson(fixture.paths.timing, timing);
  const completeBefore = await readFile(fixture.paths.completeWav);
  const report = await runFailedWithoutOverwrite(fixture);
  assert.equal(checkStatus(report, "semantic-timing"), "fail");
  assert.deepEqual(await readFile(fixture.paths.completeWav), completeBefore);
});

test("generated registry byte drift fails read-only registry and M3 gates without repair", async (context) => {
  const fixture = await createM4ProjectFixture(context);
  await appendFile(fixture.paths.registry, " ");
  const report = await runFailedWithoutOverwrite(fixture);
  assert.equal(checkStatus(report, "project-registry"), "fail");
  assert.equal(checkStatus(report, "m3-evidence"), "fail");
});

test("NarrativeCore version changes only Baseline and its downstream fingerprint", async (context) => {
  const fixture = await createM4ProjectFixture(context);
  const projectSource = parseNarrativeProjectSource({
    brief: await readJson(fixture.paths.brief),
    story: await readJson(fixture.paths.story),
    narration: await readJson(fixture.paths.narration),
    render: RenderSpecSchema.parse(await readJson(fixture.paths.render)),
  });
  const sealedNarration = SealedNarrationManifestSchema.parse(
    await readJson(fixture.paths.manifest),
  );
  const semanticTiming = (
    await import("../../src/contracts")
  ).SemanticTimingSchema.parse(await readJson(fixture.paths.timing));
  const artifactBundle = validateM1ArtifactBundle({
    projectSource,
    sealedNarration,
    semanticTiming,
  });
  const changed = computeNarrativeBaselineFingerprint({
    artifactBundle,
    projectRegistryEntryFingerprint:
      fixture.initialReport.inputIdentity.projectRegistryEntryFingerprint!,
    narrativeCoreVersion: "narrative-core-v3" as typeof NARRATIVE_CORE_VERSION,
  });
  assert.notEqual(
    changed,
    fixture.initialReport.inputIdentity.narrativeBaselineFingerprint,
  );
  assert.equal(
    fixture.initialReport.inputIdentity.projectRegistryEntryFingerprint,
    fixture.initialReport.inputIdentity.projectRegistryEntryFingerprint,
  );
});

for (const [label, pathKey] of [
  ["transparent PNG missing", "transparentStill"],
  ["caption PNG corruption", "captionStill"],
  ["MP4 corruption", "renderMedia"],
] as const) {
  test(`${label} invalidates only the M3 evidence gate and AutoCheck`, async (context) => {
    const fixture = await createM4ProjectFixture(context);
    if (label.endsWith("missing")) {
      await rm(fixture.paths[pathKey]);
    } else {
      await writeFile(fixture.paths[pathKey], `corrupt-${label}`);
    }
    const report = await runFailedWithoutOverwrite(fixture);
    assert.equal(checkStatus(report, "m3-evidence"), "fail");
    assert.equal(
      report.inputIdentity.narrativeBaselineFingerprint,
      fixture.initialReport.inputIdentity.narrativeBaselineFingerprint,
    );
  });
}

test("persisted AutoCheck drift fails the default read-only gate without repair", async (context) => {
  const fixture = await createM4ProjectFixture(context);
  await appendFile(fixture.paths.autoCheck, " ");
  const drifted = await readFile(fixture.paths.autoCheck);
  const current = await runNarrativeAutoCheck({
    rootDir: fixture.rootDir,
    projectId: fixture.storyId,
    runM3EvidenceProcess: fixture.runProcess,
  });
  assert.equal(current.aggregateStatus, "pass");
  await assert.rejects(() =>
    checkPersistedNarrativeAutoCheck({
      rootDir: fixture.rootDir,
      expectedReport: current,
    }),
  );
  assert.deepEqual(await readFile(fixture.paths.autoCheck), drifted);
});
