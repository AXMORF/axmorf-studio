import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { z } from "zod";

const skillRoot = path.join(process.cwd(), ".agents/skills/remotion-story-producer-video");
const readSkillFile = (relativePath: string) => readFile(path.join(skillRoot, relativePath), "utf8");
const wordCount = (value: string) => value.trim().split(/\s+/u).length;

const PolicySchema = z.object({
  schemaVersion: z.literal(12),
  policyVersion: z.literal("remotion-story-producer-video-policy-v13"),
  rootEndpoints: z.tuple([
    z.literal("project-production-complete"),
    z.literal("project-production-current"),
  ]),
  privateConfigPath: z.literal("private/producer.config.json"),
  requiredEntrypointHeadings: z.array(z.string().min(1)).min(8),
  requiredReferences: z.array(z.string().min(1)).min(6),
  workflowCommands: z.tuple([
    z.literal("project:create"),
    z.literal("project:produce:inspect"),
    z.literal("project:produce:prepare"),
    z.literal("project:task:check"),
    z.literal("project:task:commit"),
    z.literal("project:produce:converge"),
  ]),
  invariants: z.object({
    productionAuthority: z.literal("production-revision-task-dag-artifact-attestation"),
    executionAttemptRole: z.literal("diagnostics-only"),
    sceneAuthoringSkill: z.literal("repository-local-remotion-best-practices"),
    sharedCheckout: z.literal(true),
    agentWriteBoundary: z.literal("task-workspace-only-after-prepare"),
    artifactAuthority: z.literal("validated-artifact-attestation"),
    artifactReusePolicy: z.literal("reuse-valid-content-addressed-artifacts"),
    rootWaitsForAllChildTerminalStates: z.literal(true),
    repositoryMonitorsChildLifecycle: z.literal(false),
    convergePolicy: z.literal("exactly-once-after-child-terminal-barrier"),
    globalVisualReadsSceneOutputs: z.literal(false),
    childIdentityPersisted: z.literal(false),
    timingPolicy: z.literal("pcm-cumulative-ceil-v1"),
    templateCopyPolicy: z.literal("fixed-task-artifact-without-agent"),
    deliveryPolicy: z.literal("synchronous-exact-four-file-controlled-promotion"),
  }).passthrough(),
  forbiddenActions: z.array(z.string().min(1)).min(8),
  contextBudgets: z.object({
    entrypointMaxWords: z.number().int().positive(),
    directWorkflowMaxWords: z.number().int().positive(),
    normalProductionMaxWords: z.number().int().positive(),
    normalProductionMaxCharacters: z.number().int().positive().max(12_000),
    sceneOrchestrationMaxWords: z.number().int().positive(),
    globalVisualOrchestrationMaxWords: z.number().int().positive(),
    coverOrchestrationMaxWords: z.number().int().positive(),
  }).strict(),
}).strict();

test("repository video skill uses Revision, Task DAG, artifacts, and synchronous delivery", async () => {
  const [skill, metadata, workflow, scene, globalVisual, cover, hardening, producerConfig, rawPolicy] =
    await Promise.all([
      readSkillFile("SKILL.md"),
      readSkillFile("agents/openai.yaml"),
      readSkillFile("references/direct-production-workflow.md"),
      readSkillFile("references/scene-agent-orchestration.md"),
      readSkillFile("references/global-visual-agent-orchestration.md"),
      readSkillFile("references/cover-agent-orchestration.md"),
      readSkillFile("references/agent-rework-and-system-hardening.md"),
      readSkillFile("references/producer-config.md"),
      readSkillFile("policy.json"),
    ]);
  const policy = PolicySchema.parse(JSON.parse(rawPolicy));
  const executable = `${workflow}\n${scene}\n${globalVisual}\n${cover}`;
  const bundle = `${skill}\n${metadata}\n${executable}\n${hardening}\n${producerConfig}\n${rawPolicy}`;

  assert.match(skill, /^name: remotion-story-producer-video$/mu);
  assert.match(metadata, /\$remotion-story-producer-video/u);
  for (const heading of policy.requiredEntrypointHeadings) {
    assert.match(skill, new RegExp(`^## ${heading}$`, "mu"));
  }
  for (const reference of policy.requiredReferences) {
    assert.match(skill, new RegExp(`\\(${reference.replaceAll(".", "\\.")}\\)`, "u"));
    await assert.doesNotReject(readSkillFile(reference));
  }
  for (const command of policy.workflowCommands) {
    assert.match(executable, new RegExp(`npm run ${command}`, "u"));
  }

  assert.match(workflow, /ProductionRevision/u);
  assert.match(workflow, /Task DAG/u);
  assert.match(workflow, /ArtifactAttestation/u);
  assert.match(workflow, /dirtyAgentTasks/u);
  assert.match(workflow, /read-only/iu);
  assert.ok(
    workflow.indexOf("project:produce:inspect") <
      workflow.indexOf("project:produce:prepare"),
  );
  assert.match(workflow, /project-production-current/u);
  assert.match(workflow, /video\.mp4[\s\S]*cover-4x3\.png[\s\S]*cover-3x4\.png[\s\S]*publish\.json/u);
  assert.match(workflow, /checksum[\s\S]*EOF-decode/u);
  assert.match(workflow, /attempt ID[\s\S]*never enter[\s\S]*TaskRevision/iu);
  assert.match(skill, /validated ArtifactAttestation[\s\S]*durable authority/u);
  assert.match(skill, /exactly once/u);

  assert.match(scene, /remotion-best-practices\/SKILL\.md/u);
  assert.match(scene, /remotion-markup\/REFERENCE\.md/u);
  assert.match(scene, /\.producer-work\/<storyId>\/<taskRevision>\//u);
  assert.match(scene, /task-input\.generated\.json/u);
  assert.match(scene, /readabilityPolicy/u);
  assert.match(scene, /sceneContentSafeAreaPx/u);
  assert.match(scene, /typographyPolicy\.minFontSizePx/u);
  assert.match(scene, /allowedResourceIds/u);
  assert.match(scene, /allowedSnapshots/u);
  assert.match(scene, /完整画布坐标系/u);
  assert.match(scene, /透明 Scene/u);
  assert.match(scene, /不得读取其他 workspace/u);
  assert.match(scene, /scene-template[\s\S]*不创建 child/u);

  assert.match(globalVisual, /不得读取 Scene 输出/u);
  assert.match(globalVisual, /simplest full-frame background board/u);
  assert.match(globalVisual, /current[\s\S]*VisualStyleSpec/u);
  assert.match(globalVisual, /must not invent[\s\S]*continuity motifs/u);
  assert.match(globalVisual, /caption|字幕/u);
  assert.match(globalVisual, /DSL|automatic director/u);
  assert.match(cover, /StorySpec[\s\S]*VisualStyleSpec[\s\S]*fixed CoverSpec/u);
  assert.match(cover, /不得读取 PublishingIntent/u);

  const checkCommand = "npm run project:task:check -- --task <taskRevision>";
  const commitCommand = "npm run project:task:commit -- --task <taskRevision>";
  for (const prompt of [scene, globalVisual, cover]) {
    assert.ok(prompt.indexOf(checkCommand) >= 0);
    assert.ok(prompt.indexOf(commitCommand) > prompt.indexOf(checkCommand));
  }
  assert.match(hardening, /ExecutionAttempt[\s\S]*never invalidates or owns artifact bytes/u);
  assert.match(producerConfig, /publishingCollections/u);
  assert.match(producerConfig, /targetLoudnessLufs/u);
  assert.doesNotMatch(producerConfig, /POST \/clone|127\.0\.0\.1:31(?:00|01)/u);

  assert.doesNotMatch(
    bundle,
    /production:(?:start|status|narrative|scene:freeze|scene:check|owner:ready|owner:failed|finalize|render-ready:check)|delivery:(?:cover:freeze|cover:check|build|check)|project:build/u,
  );
  for (const removedCommand of [
    ["project", "configure"].join(":"),
    ["project", "produce", "plan"].join(":"),
  ]) {
    assert.equal(bundle.includes(removedCommand), false);
  }
  assert.doesNotMatch(bundle, /owner[- ](?:ready|failed)|render-ready|detached spawn|launch-ambiguous/u);
  assert.doesNotMatch(bundle, /create_thread/u);

  assert.ok(wordCount(skill) <= policy.contextBudgets.entrypointMaxWords);
  assert.ok(wordCount(workflow) <= policy.contextBudgets.directWorkflowMaxWords);
  assert.ok(wordCount(scene) <= policy.contextBudgets.sceneOrchestrationMaxWords);
  assert.ok(wordCount(globalVisual) <= policy.contextBudgets.globalVisualOrchestrationMaxWords);
  assert.ok(wordCount(cover) <= policy.contextBudgets.coverOrchestrationMaxWords);
  const normal = [skill, workflow, producerConfig, scene, globalVisual, cover];
  assert.ok(normal.reduce((sum, source) => sum + wordCount(source), 0) <= policy.contextBudgets.normalProductionMaxWords);
  assert.ok(normal.reduce((sum, source) => sum + Array.from(source).length, 0) <= policy.contextBudgets.normalProductionMaxCharacters);
  assert.equal(new Set(policy.workflowCommands).size, policy.workflowCommands.length);
  assert.equal(new Set(policy.forbiddenActions).size, policy.forbiddenActions.length);
});

test("skill directory contains only the declared operational bundle", async () => {
  const references = (await readdir(path.join(skillRoot, "references"))).sort();
  assert.deepEqual(references, [
    "agent-rework-and-system-hardening.md",
    "cover-agent-orchestration.md",
    "direct-production-workflow.md",
    "global-visual-agent-orchestration.md",
    "producer-config.md",
    "scene-agent-orchestration.md",
  ]);
});
