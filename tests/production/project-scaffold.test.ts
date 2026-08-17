import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  PRODUCTION_PROJECT_SCAFFOLD_MARKER,
  PRODUCTION_RENDER_SCAFFOLD_MARKER,
  ensureProductionProjectScaffold,
  ensureProjectAuthoringBuildScaffold,
  ensureProductionRenderScaffold,
  renderProjectAuthoringBuildScaffold,
  renderProductionProjectScaffold,
  renderProductionRenderProjectScaffold,
} from "../../scripts/production/application/project-scaffold";

test("writes one current narrative scaffold and repeats byte-mtime stable", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-production-scaffold-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const first = await ensureProductionProjectScaffold({
    rootDir,
    storyId: "story-example",
    mode: "write",
  });
  const bytes = await readFile(first.destination, "utf8");
  const mtime = (await stat(first.destination)).mtimeMs;
  assert.equal(bytes, renderProductionProjectScaffold("story-example"));
  assert.match(bytes, new RegExp(PRODUCTION_PROJECT_SCAFFOLD_MARKER));
  assert.match(bytes, /ProductionRequirementsFreezeSchema/u);
  assert.doesNotMatch(bytes, /StoryCompositionShell|FixedIntro|FixedOutro/u);
  assert.doesNotMatch(bytes, /ProductionPreview|FinalPreview|approval/iu);

  const second = await ensureProductionProjectScaffold({
    rootDir,
    storyId: "story-example",
    mode: "write",
  });
  assert.equal(second.written, false);
  assert.equal((await stat(first.destination)).mtimeMs, mtime);
});

test("upgrades only the byte-exact pre-isolation narrative scaffold", async (context) => {
  const rootDir = await mkdtemp(
    join(tmpdir(), "rsp-narrative-scaffold-legacy-"),
  );
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const destination = join(
    rootDir,
    "src/projects/story-example/Composition.tsx",
  );
  await mkdir(join(rootDir, "src/projects/story-example"), { recursive: true });
  const current = renderProductionProjectScaffold("story-example");
  const preIsolation = current.replace("/narration-mastered/", "/narration/");
  assert.notEqual(preIsolation, current);
  await writeFile(destination, preIsolation);

  await ensureProductionProjectScaffold({
    rootDir,
    storyId: "story-example",
    mode: "write",
  });
  assert.equal(await readFile(destination, "utf8"), current);
});

test("production render scaffold retains the frozen Run plan and GlobalVisual projection", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-render-scaffold-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await ensureProductionProjectScaffold({
    rootDir,
    storyId: "story-example",
    mode: "write",
  });
  const result = await ensureProductionRenderScaffold({
    rootDir,
    storyId: "story-example",
    meaningIds: ["opening"],
    mode: "write",
  });
  const source = await readFile(result.destination, "utf8");
  const runtimeSource = await readFile(result.runtimeDestination, "utf8");
  assert.equal(
    source,
    renderProductionRenderProjectScaffold({
      storyId: "story-example",
    }),
  );
  assert.match(source, new RegExp(PRODUCTION_RENDER_SCAFFOLD_MARKER));
  assert.match(source, /ProductionRenderPlanSchema|renderPlanJson/u);
  assert.match(source, /MasteredNarrationManifestSchema/u);
  assert.match(source, /masteredNarrationJson/u);
  assert.match(source, /masteredNarration\.outputAudio\.localPath/u);
  assert.match(source, /globalVisualBackgroundLayers/u);
  assert.match(source, /GlobalVisualLayersComponent/u);
  assert.match(source, /<ProductionGlobalVisualLayers \/>/u);
  assert.doesNotMatch(source, /<GlobalVisualLayers plan=/u);
  assert.match(source, /StoryVisualTrack/u);
  assert.match(source, /SoundDesignTrack/u);
  assert.match(runtimeSource, /projectSoundResourceIds/u);
  assert.match(runtimeSource, /projectSoundResourceIds\.has\(id\)/u);
  assert.doesNotMatch(source, /StoryCompositionShell|FixedIntro|FixedOutro/u);
  assert.match(source, /narrationStartFrame: timing\.narrationStartFrame/u);
  assert.match(source, /semanticTimingFrameCount/u);
  assert.match(source, /=> \(\s*<CompositionAssembly/u);
  assert.doesNotMatch(source, /ProductionPreview|FinalPreview|approval/iu);

  await ensureProductionRenderScaffold({
    rootDir,
    storyId: "story-example",
    meaningIds: ["opening"],
    mode: "check",
  });
});

test("keeps the pre-project-build production scaffold byte exact for migration", () => {
  const source = renderProductionRenderProjectScaffold({
    storyId: "story-example",
  });
  assert.equal(Buffer.byteLength(source), 6677);
  assert.equal(
    createHash("sha256").update(source).digest("hex"),
    "2752e020251c5e5b3124f84d9cb6d1d7e1a7778234ca5ae3caf6571f58136e3e",
  );
});

test("production migrates only the byte-exact authoring build scaffold", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-render-scaffold-legacy-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await ensureProductionProjectScaffold({
    rootDir,
    storyId: "story-example",
    mode: "write",
  });
  const current = renderProductionRenderProjectScaffold({
    storyId: "story-example",
  });
  const authoring = renderProjectAuthoringBuildScaffold({
    storyId: "story-example",
  });
  const destination = join(
    rootDir,
    "src/projects/story-example/Composition.tsx",
  );
  await writeFile(destination, authoring);

  await ensureProductionRenderScaffold({
    rootDir,
    storyId: "story-example",
    meaningIds: ["opening"],
    mode: "write",
  });
  assert.equal(await readFile(destination, "utf8"), current);

  await writeFile(destination, `${authoring}// drift\n`);
  await assert.rejects(
    ensureProductionRenderScaffold({
      rootDir,
      storyId: "story-example",
      meaningIds: ["opening"],
      mode: "write",
    }),
    /Refusing to overwrite a drifted Production Composition/u,
  );
  assert.equal(await readFile(destination, "utf8"), `${authoring}// drift\n`);
});

test("authoring build migrates only the byte-exact production scaffold", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-authoring-scaffold-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await ensureProductionProjectScaffold({
    rootDir,
    storyId: "story-example",
    mode: "write",
  });
  const destination = join(rootDir, "src/projects/story-example/Composition.tsx");
  await writeFile(
    destination,
    renderProductionRenderProjectScaffold({ storyId: "story-example" }),
  );

  await ensureProjectAuthoringBuildScaffold({
    rootDir,
    storyId: "story-example",
    meaningIds: ["opening"],
    mode: "write",
  });

  assert.equal(
    await readFile(destination, "utf8"),
    renderProjectAuthoringBuildScaffold({ storyId: "story-example" }),
  );
});

test("refuses to overwrite a hand-written Composition", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-scaffold-protect-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const projectDir = join(rootDir, "src/projects/story-example");
  await mkdir(projectDir, { recursive: true });
  const destination = join(projectDir, "Composition.tsx");
  const custom = "const Existing = () => null;\nexport default Existing;\n";
  await writeFile(destination, custom);
  await assert.rejects(
    ensureProductionProjectScaffold({
      rootDir,
      storyId: "story-example",
      mode: "write",
    }),
    /hand-written|non-template/iu,
  );
  assert.equal(await readFile(destination, "utf8"), custom);
});
