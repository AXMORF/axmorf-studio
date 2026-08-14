import assert from "node:assert/strict";
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
  ensureProductionRenderScaffold,
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

test("render scaffold binds the frozen plan and current GlobalVisual layer", async (context) => {
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
    sceneLocalSoundPresent: true,
    mode: "write",
  });
  const source = await readFile(result.destination, "utf8");
  assert.equal(
    source,
    renderProductionRenderProjectScaffold({
      storyId: "story-example",
      sceneLocalSoundPresent: true,
    }),
  );
  assert.match(source, new RegExp(PRODUCTION_RENDER_SCAFFOLD_MARKER));
  assert.match(source, /ProductionRenderPlanSchema/u);
  assert.match(source, /MasteredNarrationManifestSchema/u);
  assert.match(source, /masteredNarrationJson/u);
  assert.match(source, /masteredNarration\.outputAudio\.localPath/u);
  assert.match(source, /globalVisualBackgroundLayers/u);
  assert.match(source, /GlobalVisualLayersComponent/u);
  assert.match(source, /<ProductionGlobalVisualLayers \/>/u);
  assert.doesNotMatch(source, /<GlobalVisualLayers plan=/u);
  assert.match(source, /StoryVisualTrack/u);
  assert.match(source, /SoundDesignTrack/u);
  assert.doesNotMatch(source, /StoryCompositionShell|FixedIntro|FixedOutro/u);
  assert.match(source, /narrationStartFrame: timing\.narrationStartFrame/u);
  assert.match(source, /semanticTimingFrameCount/u);
  assert.match(source, /=> \(\s*<CompositionAssembly/u);
  assert.doesNotMatch(source, /ProductionPreview|FinalPreview|approval/iu);

  await ensureProductionRenderScaffold({
    rootDir,
    storyId: "story-example",
    meaningIds: ["opening"],
    sceneLocalSoundPresent: true,
    mode: "check",
  });
});

test("rebuilds only the byte-exact legacy generated render scaffold", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-render-scaffold-legacy-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await ensureProductionProjectScaffold({
    rootDir,
    storyId: "story-example",
    mode: "write",
  });
  const current = renderProductionRenderProjectScaffold({
    storyId: "story-example",
    sceneLocalSoundPresent: false,
  });
  const legacyNoProps = current.replace("<typeof GlobalVisualLayers>", "");
  const legacy = current
    .replace(
      'import type {GlobalVisualLayersComponent} from "../../remotion/runtime/global-visual";\n',
      "",
    )
    .replace(
      "const ProductionGlobalVisualLayers: GlobalVisualLayersComponent<typeof GlobalVisualLayers> = GlobalVisualLayers;\n",
      "",
    )
    .replace(
      "<ProductionGlobalVisualLayers />",
      "<GlobalVisualLayers plan={globalVisualPlan} projection={globalVisualProjection} />",
    );
  const destination = join(
    rootDir,
    "src/projects/story-example/Composition.tsx",
  );
  await writeFile(destination, legacyNoProps);

  await ensureProductionRenderScaffold({
    rootDir,
    storyId: "story-example",
    meaningIds: ["opening"],
    sceneLocalSoundPresent: false,
    mode: "write",
  });
  assert.equal(await readFile(destination, "utf8"), current);

  await writeFile(destination, legacy);

  await ensureProductionRenderScaffold({
    rootDir,
    storyId: "story-example",
    meaningIds: ["opening"],
    sceneLocalSoundPresent: false,
    mode: "write",
  });
  assert.equal(await readFile(destination, "utf8"), current);

  await writeFile(destination, `${legacy}// drift\n`);
  await assert.rejects(
    ensureProductionRenderScaffold({
      rootDir,
      storyId: "story-example",
      meaningIds: ["opening"],
      sceneLocalSoundPresent: false,
      mode: "write",
    }),
    /Refusing to overwrite a drifted Production Composition/u,
  );
  assert.equal(await readFile(destination, "utf8"), `${legacy}// drift\n`);
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
