import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  buildProductionRequirementsFreeze,
  buildNarrationExecutionSnapshot,
  computeGenerationInputFingerprint,
  computeStoryFingerprint,
  NarrationSpecSchema,
  STORY_CHECK_IDS,
  StoryCheckReportSchema,
  StorySpecSchema,
} from "../../src/contracts";
import { readProductionRunStore } from "../../scripts/production/adapters/run-store";
import { runProductionStart } from "../../scripts/production/application/start";
import {
  validNarrationSpec,
  validProjectSource,
  validStorySpec,
} from "../fixtures/narrative";

const fixedNow = new Date("2026-08-04T00:00:00.000Z");
const fixedRunId = "story-example-run-001";
const narrationExecution = buildNarrationExecutionSnapshot({
  providerId: "test-provider",
  voiceProfileId: validNarrationSpec.voiceProfileId,
  speechRate: 1,
  providerAttemptFingerprint: `sha256:${"a".repeat(64)}`,
  targetLoudnessLufs: -16,
});

const checksum = (bytes: string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;

const jsonBytes = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const writeJson = async (path: string, value: unknown) => {
  await mkdir(dirname(path), { recursive: true });
  const bytes = jsonBytes(value);
  await writeFile(path, bytes);
  return checksum(bytes);
};

const createStartFixture = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-production-start-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const projectDir = join(rootDir, "src/projects/story-example");
  const story = StorySpecSchema.parse(validStorySpec);
  const narration = NarrationSpecSchema.parse(validNarrationSpec);
  const storyCheck = StoryCheckReportSchema.parse({
    schemaVersion: 1,
    storyId: story.storyId,
    storyFingerprint: computeStoryFingerprint(story),
    generationInputFingerprint: computeGenerationInputFingerprint(
      story,
      narration,
    ),
    voiceProfileId: narration.voiceProfileId,
    decision: "proceed",
    checks: STORY_CHECK_IDS.map((checkId) => ({
      checkId,
      status: "pass",
      note: `Checked ${checkId}.`,
    })),
  });
  const source = { ...validProjectSource, storyCheck } as const;
  const sourceChecksums = {
    videoBrief: await writeJson(join(projectDir, "brief.json"), source.brief),
    storySpec: await writeJson(join(projectDir, "story.json"), source.story),
    narrationSpec: await writeJson(
      join(projectDir, "narration.json"),
      source.narration,
    ),
    renderSpec: await writeJson(join(projectDir, "render.json"), source.render),
    storyCheck: await writeJson(
      join(projectDir, "reviews/story-check.json"),
      source.storyCheck,
    ),
  };
  const requirements = buildProductionRequirementsFreeze({
    source,
    sourceChecksums,
    enhancementSelection: {
      storyVisual: "required",
      sceneLocalSound: "allowed",
      globalSound: "none",
      globalVisual: "required",
    },
    resourcePolicy: {
      selfAuthoredVisualsAllowed: true,
      unlistedThirdPartyResources: "deny",
    },
    additionalRequirements: [],
    readability: { edgeInsetPx: 90 },
  });
  await writeJson(
    join(projectDir, "production/requirements.json"),
    requirements,
  );
  return { rootDir, projectDir, requirements, source, sourceChecksums };
};

const start = (rootDir: string) =>
  runProductionStart({
    rootDir,
    projectId: "story-example",
    clock: () => fixedNow,
    createRunId: () => fixedRunId,
    preflightDependencies: {
      voxcpm: async () => ({
        status: "pass",
        domain: "voxcpm",
        serviceState: "resident-ready",
        profileMode: "controllable-clone",
        narrationExecution,
      }),
      browser: async () => ({ status: "pass", domain: "remotion-browser" }),
    },
  });

test("starts one immutable contract-bound run and records its first event", async (context) => {
  const fixture = await createStartFixture(context);
  const result = await start(fixture.rootDir);

  assert.deepEqual(result, {
    runId: fixedRunId,
    status: "initialized",
    statePath: `.producer-runs/${fixedRunId}/state.generated.json`,
    requirementsFingerprint: fixture.requirements.requirementsFingerprint,
  });
  const loaded = await readProductionRunStore({
    rootDir: fixture.rootDir,
    runId: fixedRunId,
  });
  assert.equal(loaded.events.length, 1);
  assert.equal(loaded.run.schemaVersion, 1);
  assert.deepEqual(loaded.run.narrationExecution, narrationExecution);
  assert.equal(loaded.events[0]?.schemaVersion, 1);
  assert.equal(loaded.state.schemaVersion, 1);
  assert.equal(loaded.events[0]?.type, "stage-succeeded");
  assert.equal(loaded.state.state, "initialized");
  assert.equal(loaded.state.lastSequence, 1);
  assert.match(
    await readFile(join(fixture.projectDir, "Composition.tsx"), "utf8"),
    /export default/u,
  );
});

test("runs both preflight probes before scaffold clock and Run creation", async (context) => {
  const fixture = await createStartFixture(context);
  const calls: string[] = [];
  await runProductionStart({
    rootDir: fixture.rootDir,
    projectId: "story-example",
    clock: () => {
      calls.push("clock");
      return fixedNow;
    },
    createRunId: () => {
      calls.push("run-id");
      return fixedRunId;
    },
    preflightDependencies: {
      voxcpm: async () => {
        calls.push("voxcpm");
        await assert.rejects(() =>
          access(join(fixture.projectDir, "Composition.tsx")),
        );
        return {
          status: "pass",
          domain: "voxcpm",
          serviceState: "offloaded-auto-reload-on-first-generation",
          profileMode: "controllable-clone",
          narrationExecution,
        };
      },
      browser: async () => {
        calls.push("browser");
        await assert.rejects(() =>
          access(join(fixture.projectDir, "Composition.tsx")),
        );
        return { status: "pass", domain: "remotion-browser" };
      },
    },
  });
  assert.deepEqual(calls, ["voxcpm", "browser", "clock", "run-id"]);
});

test("preflight failure occurs before scaffold run store or clock", async (context) => {
  const fixture = await createStartFixture(context);
  let clockCalls = 0;
  await assert.rejects(() =>
    runProductionStart({
      rootDir: fixture.rootDir,
      projectId: "story-example",
      clock: () => {
        clockCalls += 1;
        return fixedNow;
      },
      preflightDependencies: {
        voxcpm: async () => ({
          schemaVersion: 2,
          contractVersion: "production-start-preflight-v2",
          status: "failed",
          domain: "voxcpm",
          kind: "external-blocker",
          code: "VOXCPM_SERVICE_UNREACHABLE",
          summary: "The local speech service is unreachable.",
          remediation:
            "Restore local speech service access before starting production.",
          requirementsFingerprint: fixture.requirements.requirementsFingerprint,
          redactionApplied: true,
        }),
        browser: async () => {
          throw new Error("browser must not run");
        },
      },
    }),
  );
  assert.equal(clockCalls, 0);
  await assert.rejects(() =>
    access(join(fixture.projectDir, "Composition.tsx")),
  );
  await assert.rejects(() => access(join(fixture.rootDir, ".producer-runs")));
  await assert.rejects(() => access(join(fixture.rootDir, ".narration-work")));
});

test("rejects malformed or stale requirements before creating a run or scaffold", async (context) => {
  const malformed = await createStartFixture(context);
  const requirementsPath = join(
    malformed.projectDir,
    "production/requirements.json",
  );
  await writeJson(requirementsPath, {
    ...malformed.requirements,
    providerEndpoint: "https://private.example",
  });
  await assert.rejects(() => start(malformed.rootDir));
  await assert.rejects(() =>
    access(join(malformed.projectDir, "Composition.tsx")),
  );
  await assert.rejects(() =>
    access(join(malformed.rootDir, ".producer-runs", fixedRunId)),
  );

  const stale = await createStartFixture(context);
  await writeJson(join(stale.projectDir, "render.json"), {
    ...stale.source.render,
    width: stale.source.render.width + 2,
  });
  await assert.rejects(
    () => start(stale.rootDir),
    /source binding|normalized/i,
  );
  await assert.rejects(() => access(join(stale.projectDir, "Composition.tsx")));
  await assert.rejects(() =>
    access(join(stale.rootDir, ".producer-runs", fixedRunId)),
  );
});

test("runId collision fails closed without changing current run or scaffold", async (context) => {
  const fixture = await createStartFixture(context);
  await start(fixture.rootDir);
  const runPath = join(
    fixture.rootDir,
    ".producer-runs",
    fixedRunId,
    "run.json",
  );
  const scaffoldPath = join(fixture.projectDir, "Composition.tsx");
  const beforeRun = await readFile(runPath);
  const beforeScaffold = await readFile(scaffoldPath);
  const runMtime = (await stat(runPath)).mtimeMs;
  const scaffoldMtime = (await stat(scaffoldPath)).mtimeMs;

  await assert.rejects(() => start(fixture.rootDir), /collision/i);
  assert.deepEqual(await readFile(runPath), beforeRun);
  assert.deepEqual(await readFile(scaffoldPath), beforeScaffold);
  assert.equal((await stat(runPath)).mtimeMs, runMtime);
  assert.equal((await stat(scaffoldPath)).mtimeMs, scaffoldMtime);
});

test("an existing non-template Composition is never overwritten", async (context) => {
  const fixture = await createStartFixture(context);
  const compositionPath = join(fixture.projectDir, "Composition.tsx");
  const custom = "const Custom = () => null;\nexport default Custom;\n";
  await writeFile(compositionPath, custom);

  await assert.rejects(
    () => start(fixture.rootDir),
    /non-template|refuse|hand-written/i,
  );
  assert.equal(await readFile(compositionPath, "utf8"), custom);
  await assert.rejects(() =>
    access(join(fixture.rootDir, ".producer-runs", fixedRunId)),
  );
});
