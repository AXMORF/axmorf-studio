import assert from "node:assert/strict";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  StorySpecSchema,
  buildSilentScenePreset,
  generateAuthoredFrameTiming,
  generateSemanticTiming,
  parseNarrativeProjectSource,
  serializeCanonicalJson,
} from "@axmorf/studio/contracts";
import { runProjectCheckCli } from "../../scripts/project-check/cli";
import {
  checkNarrativeSourceHealth,
  runNarrativeAutoCheck,
} from "../../scripts/project-check/run";
import { generateProjectRegistry } from "../../scripts/registry/generate";
import { loadProjectRegistrationEntry } from "../../scripts/registry/project-files";
import {
  buildValidSealedNarrationManifest,
  validProjectSource,
} from "../fixtures/narrative";

const fixture = async (context: TestContext, authored = true) => {
  const rootDir = await mkdtemp(join(tmpdir(), "authored-source-health-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const projectId = validProjectSource.story.storyId;
  const projectRoot = join(rootDir, "src/projects", projectId);
  await mkdir(join(projectRoot, "generated"), { recursive: true });
  const story = StorySpecSchema.parse(
    authored
      ? {
          ...validProjectSource.story,
          timingSource: "authored-frames",
          beats: validProjectSource.story.beats.map((beat, index) => ({
            kind: "silent-scene",
            meaningId: beat.meaningId,
            narrativePurpose: beat.narrativePurpose,
            preset: buildSilentScenePreset({
              presetId: beat.meaningId,
              durationInFrames: index === 0 ? 60 : 90,
              visualIntent: "Continue one subject through the film.",
              soundIntent: "Use independent authored sound contributions.",
              resourceIds: [],
              implementation: { kind: "scene-owner" },
            }),
          })),
          visualScenes: [{ meaningIds: ["opening", "conclusion"] }],
        }
      : validProjectSource.story,
  );
  const projectSource = parseNarrativeProjectSource({
    ...validProjectSource,
    story,
  });
  const timing = authored
    ? generateAuthoredFrameTiming(projectSource)
    : generateSemanticTiming({
        ...projectSource,
        sealedNarration: buildValidSealedNarrationManifest(),
      });
  for (const [file, value] of [
    ["brief.json", projectSource.brief],
    ["story.json", projectSource.story],
    ["narration.json", projectSource.narration],
    ["render.json", projectSource.render],
    ["generated/semantic-timing.generated.json", timing],
  ] as const)
    await writeFile(
      join(projectRoot, file),
      `${serializeCanonicalJson(value)}\n`,
    );
  await writeFile(
    join(projectRoot, "Composition.tsx"),
    "export default () => null;\n",
  );
  const compositionPath = `src/projects/${projectId}/Composition.tsx`;
  return {
    rootDir,
    projectRoot,
    projectId,
    projectSource,
    timing,
    compositionPath,
    registryPath: join(rootDir, "src/projects/project-registry.generated.ts"),
  };
};

test("authored-frame registry and source health require current timing and no sealed audio", async (context) => {
  const f = await fixture(context);
  const registration = await loadProjectRegistrationEntry(f);
  assert.equal(
    registration.descriptor.durationInFrames,
    f.timing.durationInFrames,
  );
  assert.equal(registration.descriptor.storyId, f.projectId);
  await generateProjectRegistry({ rootDir: f.rootDir, mode: "write" });
  await generateProjectRegistry({ rootDir: f.rootDir, mode: "check" });
  assert.deepEqual(await checkNarrativeSourceHealth(f), {
    storyId: f.projectId,
    aggregateStatus: "pass",
  });
  assert.deepEqual((await readdir(join(f.projectRoot, "generated"))).sort(), [
    "semantic-timing.generated.json",
  ]);
  assert.deepEqual(await readdir(f.rootDir), ["src"]);
});

test("authored-frame source gates never read sealed, mastered or legacy audio evidence traps", async (context) => {
  const f = await fixture(context);
  for (const filename of [
    "sealed-narration.generated.json",
    "mastered-narration.generated.json",
    "narrative-baseline-evidence.generated.json",
  ])
    await mkdir(join(f.projectRoot, "generated", filename));
  await generateProjectRegistry({ rootDir: f.rootDir, mode: "write" });
  const before = await readFile(f.registryPath, "utf8");
  await checkNarrativeSourceHealth(f);
  assert.equal(await readFile(f.registryPath, "utf8"), before);
});

test("authored-frame timing drift blocks registry replacement and source health", async (context) => {
  const f = await fixture(context);
  await generateProjectRegistry({ rootDir: f.rootDir, mode: "write" });
  const before = await readFile(f.registryPath, "utf8");
  const stale = generateAuthoredFrameTiming({
    ...f.projectSource,
    render: { ...f.projectSource.render, fps: 24 },
  });
  await writeFile(
    join(f.projectRoot, "generated/semantic-timing.generated.json"),
    serializeCanonicalJson(stale),
  );
  await assert.rejects(
    loadProjectRegistrationEntry(f),
    /semantic-timing.*stale/u,
  );
  await assert.rejects(
    generateProjectRegistry({ rootDir: f.rootDir, mode: "write" }),
    /semantic-timing.*stale/u,
  );
  assert.equal(await readFile(f.registryPath, "utf8"), before);
  await assert.rejects(
    checkNarrativeSourceHealth(f),
    /Authored-frame timing source is invalid/u,
  );
});

test("authored-frame source health rejects generated registry byte drift", async (context) => {
  const f = await fixture(context);
  await generateProjectRegistry({ rootDir: f.rootDir, mode: "write" });
  await appendFile(f.registryPath, " ");
  const drifted = await readFile(f.registryPath, "utf8");
  await assert.rejects(
    checkNarrativeSourceHealth(f),
    /Narrative registry source is invalid/u,
  );
  assert.equal(await readFile(f.registryPath, "utf8"), drifted);
});

test("narrated registry and source health still reject missing sealed narration", async (context) => {
  const f = await fixture(context, false);
  await assert.rejects(loadProjectRegistrationEntry(f), /sealed-narration/u);
  await assert.rejects(
    checkNarrativeSourceHealth(f),
    /Sealed narration source is invalid/u,
  );
});

test("authored source-only CLI passes without writing a legacy NarrativeAutoCheck receipt", async (context) => {
  const f = await fixture(context);
  await generateProjectRegistry({ rootDir: f.rootDir, mode: "write" });
  const output: string[] = [];
  await runProjectCheckCli(
    ["--project", f.projectId, "--level", "narrative", "--scope", "source"],
    { rootDir: f.rootDir, stdout: (line) => output.push(line) },
  );
  assert.deepEqual(
    output.map((line) => JSON.parse(line)),
    [
      {
        storyId: f.projectId,
        level: "narrative",
        scope: "source",
        aggregateStatus: "pass",
      },
    ],
  );
  assert.deepEqual(await readdir(join(f.projectRoot, "generated")), [
    "semantic-timing.generated.json",
  ]);
});

test("legacy full NarrativeAutoCheck cannot claim audio evidence for authored-frame source", async (context) => {
  const f = await fixture(context);
  await generateProjectRegistry({ rootDir: f.rootDir, mode: "write" });
  const report = await runNarrativeAutoCheck(f);
  assert.equal(report.aggregateStatus, "fail");
  assert.equal(
    report.checks.find(({ checkId }) => checkId === "source-contracts")?.status,
    "pass",
  );
  assert.equal(
    report.checks.find(({ checkId }) => checkId === "sealed-narration")?.status,
    "fail",
  );
  assert.equal(report.inputIdentity.sealedNarrationFingerprint, null);
  assert.equal(report.inputIdentity.masteredNarrationFingerprint, null);
});
