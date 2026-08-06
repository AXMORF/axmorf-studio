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

const wordCount = (value: string) => value.trim().split(/\s+/u).length;

test("repository video skill separates isolated Scene work from fixed-flow hardening", async () => {
  const [skill, metadata, workflow, sceneWorkflow, failurePolicy] =
    await Promise.all([
    readSkillFile("SKILL.md"),
    readSkillFile("agents/openai.yaml"),
    readSkillFile("references/direct-production-workflow.md"),
    readSkillFile("references/scene-agent-orchestration.md"),
    readSkillFile("references/agent-rework-and-system-hardening.md"),
  ]);

  assert.match(skill, /^name: remotion-story-producer-video$/m);
  assert.match(skill, /one distinct child Agent per meaningId/u);
  assert.match(skill, /never author Scenes in the\s+root task/u);
  assert.match(skill, /silently fall back to inline work/u);
  assert.match(skill, /references\/direct-production-workflow\.md/u);
  assert.match(skill, /references\/agent-rework-and-system-hardening\.md/u);
  assert.match(skill, /Do not preload authority docs/u);
  assert.match(skill, /voxcpm\/voxcpm\.private\.json/u);
  assert.match(skill, /preview-ready \/ awaiting-user-preview/u);
  assert.match(skill, /Never use `git add \.`/u);
  assert.match(skill, /Recover only Agent-owned authoring work/u);
  assert.match(skill, /Never recover a failed fixed workflow/u);
  assert.match(skill, /universal readability policy/u);
  assert.match(skill, /frozen assignment/u);
  assert.match(skill, /never auto-split by punctuation or characters/u);
  assert.doesNotMatch(skill, /recover a production run/u);
  assert.ok(
    wordCount(skill) <= 520,
    `SKILL.md must remain a thin router (received ${wordCount(skill)} words)`,
  );

  assert.match(metadata, /\$remotion-story-producer-video/u);
  assert.match(metadata, /不先写计划/u);

  const executableWorkflow = `${workflow}\n${sceneWorkflow}`;
  for (const command of [
    "production:start",
    "production:narrative",
    "production:scene:freeze",
    "production:watch",
    "production:scene:check",
    "production:scene:submit",
    "production:scene:fail",
    "production:preview:check",
  ]) {
    assert.match(executableWorkflow, new RegExp(`npm run ${command}`));
  }
  assert.match(workflow, /Keep polling its real output/u);
  assert.match(workflow, /Do not detach it from the current task/u);
  assert.match(workflow, /Read only the relevant authority section/u);
  assert.match(workflow, /before any\s+provider call/u);
  assert.match(
    workflow,
    /npm run production:preflight -- --project <storyId>/u,
  );
  assert.match(workflow, /first attempt with host permissions/u);
  assert.match(workflow, /cannot prove that VoxCPM is unavailable/u);
  assert.match(workflow, /production:start.*same host permissions/su);
  assert.match(workflow, /Existing videos and v1 runs are not migrated/u);
  assert.match(sceneWorkflow, /assignment-provided safe areas/u);
  assert.match(failurePolicy, /common-flow defect/u);
  assert.match(sceneWorkflow, /one distinct child Agent for every frozen assignment/u);
  assert.match(sceneWorkflow, /writes no Scene result, event,\s+or derived run state/u);
  assert.match(sceneWorkflow, /root\s+Agent then serially invokes/u);
  assert.match(sceneWorkflow, /meaningId-to-child-task mapping/u);
  assert.doesNotMatch(
    workflow,
    /Read `AGENTS\.md`, `docs\/FINAL_PRODUCT_GOAL\.md`/u,
  );
  assert.ok(
    wordCount(workflow) <= 850,
    `direct workflow must stay concise (received ${wordCount(workflow)} words)`,
  );
  assert.ok(
    wordCount(skill) + wordCount(workflow) <= 1300,
    "normal production context must stay within the entrypoint budget",
  );
  assert.ok(
    wordCount(sceneWorkflow) <= 500,
    `Scene orchestration reference must stay concise (received ${wordCount(sceneWorkflow)} words)`,
  );

  assert.match(
    failurePolicy,
    /Only Agent-owned authoring work is recoverable/u,
  );
  assert.match(failurePolicy, /Fixed-flow failure is a system defect/u);
  assert.match(
    failurePolicy,
    /Do not retry, resume, skip, or manually complete the failed fixed stage/u,
  );
  assert.match(
    failurePolicy,
    /Reproduce the defect with the smallest deterministic test/u,
  );
  assert.doesNotMatch(
    failurePolicy,
    /Resume only if its state legally supports/u,
  );
  assert.match(failurePolicy, /Never.*hand-edit derived state/isu);
  assert.match(
    failurePolicy,
    /Do not search, open, compare, imitate, or copy old formal Scene/u,
  );
  assert.match(
    failurePolicy,
    /The automatic endpoint is mechanical `preview-ready/u,
  );
});
