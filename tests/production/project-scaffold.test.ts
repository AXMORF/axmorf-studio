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
  ensureProductionProjectScaffold,
  PRODUCTION_PROJECT_SCAFFOLD_MARKER,
  renderProductionPreviewProjectScaffold,
  renderProductionProjectScaffold,
  renderReadabilityAwareProductionProjectScaffold,
  renderV3ProductionPreviewProjectScaffold,
  renderReadabilityAwareProductionSceneRuntime,
} from "../../scripts/production/project-scaffold";

test("future production scaffolds bind frozen readability into captions and Scene props", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-readability-scaffold-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const result = await ensureProductionProjectScaffold({
    rootDir,
    storyId: "future-story",
    readabilityPolicyAware: true,
    mode: "write",
  });
  const source = await readFile(result.destination, "utf8");
  assert.equal(
    source,
    renderReadabilityAwareProductionProjectScaffold("future-story"),
  );
  assert.match(source, /ProductionRequirementsFreezeSchema/u);
  assert.match(source, /requirementsJson/u);
  assert.match(source, /readabilityPolicy/u);
  const runtime = renderReadabilityAwareProductionSceneRuntime({
    storyId: "future-story",
    meaningIds: ["opening"],
  });
  assert.match(runtime, /const task = scene\.task;/u);
  assert.match(runtime, /if \(task\.schemaVersion === 1\)/u);
  assert.match(runtime, /readabilityPolicy: task\.readabilityPolicy/u);
  assert.doesNotMatch(runtime, /scene\.task\.schemaVersion >= 2/u);
});

test("v3 Preview mounts StoryVisualTrack directly without a second global visual owner", () => {
  const source = renderV3ProductionPreviewProjectScaffold({
    storyId: "future-story",
    sceneLocalSoundPresent: false,
  });
  assert.doesNotMatch(source, /VisualShell|visual-shell/u);
  assert.equal(source.match(/<StoryVisualTrack /gu)?.length, 1);
  assert.match(
    source,
    /storyVisualTrack=\{<StoryVisualTrack [^>]+ \/>\}/u,
  );
  assert.doesNotMatch(source, /globalVisualLayers|GlobalVisualLayers/u);
});

test("writes one default-export Narrative scaffold and repeats byte-mtime stable", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-production-scaffold-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));

  const first = await ensureProductionProjectScaffold({
    rootDir,
    storyId: "story-example",
    mode: "write",
  });
  const bytes = await readFile(first.destination, "utf8");
  const mtime = (await stat(first.destination)).mtimeMs;
  assert.equal(first.written, true);
  assert.equal(bytes, renderProductionProjectScaffold("story-example"));
  assert.match(bytes, new RegExp(PRODUCTION_PROJECT_SCAFFOLD_MARKER));
  assert.match(bytes, /export default StoryExampleComposition/u);
  assert.match(bytes, /NarrativeCore/u);
  assert.match(bytes, /CompositionAssembly/u);
  assert.match(bytes, /staticFile/u);
  assert.doesNotMatch(bytes, /GlobalSound|GlobalVisual|BGM|ducking/u);

  const second = await ensureProductionProjectScaffold({
    rootDir,
    storyId: "story-example",
    mode: "write",
  });
  assert.equal(second.written, false);
  assert.equal(await readFile(first.destination, "utf8"), bytes);
  assert.equal((await stat(first.destination)).mtimeMs, mtime);
  await ensureProductionProjectScaffold({
    rootDir,
    storyId: "story-example",
    mode: "check",
  });
});

test("refuses to overwrite a hand-written or drifted Composition", async (context) => {
  const rootDir = await mkdtemp(
    join(tmpdir(), "rsp-production-scaffold-protect-"),
  );
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const projectDir = join(rootDir, "src/projects/gps-relativity");
  await mkdir(projectDir, { recursive: true });
  const destination = join(projectDir, "Composition.tsx");
  const custom = "const Existing = () => null;\nexport default Existing;\n";
  await writeFile(destination, custom);

  await assert.rejects(
    () =>
      ensureProductionProjectScaffold({
        rootDir,
        storyId: "gps-relativity",
        mode: "write",
      }),
    /non-template|refuse|hand-written/i,
  );
  assert.equal(await readFile(destination, "utf8"), custom);

  await rm(destination);
  await ensureProductionProjectScaffold({
    rootDir,
    storyId: "gps-relativity",
    mode: "write",
  });
  const generated = await readFile(destination, "utf8");
  await writeFile(destination, `${generated} `);
  await assert.rejects(
    () =>
      ensureProductionProjectScaffold({
        rootDir,
        storyId: "gps-relativity",
        mode: "write",
      }),
    /drift/i,
  );
  assert.equal(await readFile(destination, "utf8"), `${generated} `);
});

test("check mode never creates a missing scaffold", async (context) => {
  const rootDir = await mkdtemp(
    join(tmpdir(), "rsp-production-scaffold-check-"),
  );
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await assert.rejects(() =>
    ensureProductionProjectScaffold({
      rootDir,
      storyId: "story-example",
      mode: "check",
    }),
  );
});

test("replacement start restores an exact generated Preview scaffold", async (context) => {
  const rootDir = await mkdtemp(
    join(tmpdir(), "rsp-production-scaffold-replacement-"),
  );
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const projectDir = join(rootDir, "src/projects/story-example");
  await mkdir(projectDir, { recursive: true });
  const destination = join(projectDir, "Composition.tsx");
  await writeFile(
    destination,
    renderProductionPreviewProjectScaffold({
      storyId: "story-example",
      sceneLocalSoundPresent: false,
    }),
  );

  const restored = await ensureProductionProjectScaffold({
    rootDir,
    storyId: "story-example",
    mode: "write",
  });

  assert.equal(restored.written, true);
  assert.equal(
    await readFile(destination, "utf8"),
    renderProductionProjectScaffold("story-example"),
  );
});
