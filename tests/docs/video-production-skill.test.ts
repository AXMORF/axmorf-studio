import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const skillRoot = path.join(
  process.cwd(),
  ".agents/skills/remotion-story-producer-video",
);

const readSkillFile = (relativePath: string) =>
  readFile(path.join(skillRoot, relativePath), "utf8");

test("repository video skill triggers direct preview-ready production", async () => {
  const [skill, metadata, workflow, recovery] = await Promise.all([
    readSkillFile("SKILL.md"),
    readSkillFile("agents/openai.yaml"),
    readSkillFile("references/direct-production-workflow.md"),
    readSkillFile("references/recovery-and-boundaries.md"),
  ]);

  assert.match(skill, /^name: remotion-story-producer-video$/m);
  assert.match(
    skill,
    /default to inline execution without writing a plan first/u,
  );
  assert.match(skill, /references\/direct-production-workflow\.md/u);
  assert.match(skill, /references\/recovery-and-boundaries\.md/u);
  assert.match(skill, /voxcpm\/voxcpm\.private\.json/u);
  assert.match(skill, /preview-ready \/ awaiting-user-preview/u);
  assert.match(skill, /Never use `git add \.`/u);

  assert.match(metadata, /\$remotion-story-producer-video/u);
  assert.match(metadata, /不先写计划/u);

  for (const command of [
    "production:start",
    "production:narrative",
    "production:scene:freeze",
    "production:watch",
    "production:scene:submit",
    "production:scene:fail",
    "production:preview:check",
  ]) {
    assert.match(workflow, new RegExp(`npm run ${command}`));
  }
  assert.match(workflow, /Keep polling its real output/u);
  assert.match(workflow, /Do not detach it from the current task/u);

  assert.match(
    recovery,
    /Reproduce the defect with the smallest deterministic test/u,
  );
  assert.match(recovery, /Never.*hand-edit derived state/isu);
  assert.match(
    recovery,
    /Do not search, open, compare, imitate, or copy old formal Scene/u,
  );
  assert.match(
    recovery,
    /The automatic endpoint is mechanical `preview-ready/u,
  );
});
