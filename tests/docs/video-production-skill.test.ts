import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { z } from "zod";

const skillRoot = path.join(
  process.cwd(),
  ".agents/skills/remotion-story-producer-video",
);

const readSkillFile = (relativePath: string) =>
  readFile(path.join(skillRoot, relativePath), "utf8");

const wordCount = (value: string) => value.trim().split(/\s+/u).length;

const SkillPolicySchema = z
  .object({
    schemaVersion: z.literal(3),
    policyVersion: z.literal("remotion-story-producer-video-policy-v3"),
    automaticEndpoint: z.literal("delivery-render-started"),
    privateConfigPath: z.literal("voxcpm/voxcpm.private.json"),
    requiredEntrypointHeadings: z.tuple([
      z.literal("Start directly"),
      z.literal("Require N plus one production owners and one Cover owner"),
      z.literal("Keep context bounded"),
      z.literal("Preserve production invariants"),
      z.literal("Classify failure by owner"),
      z.literal("Finish at detached delivery launch"),
    ]),
    requiredReferences: z.tuple([
      z.literal("references/direct-production-workflow.md"),
      z.literal("references/scene-agent-orchestration.md"),
      z.literal("references/global-visual-agent-orchestration.md"),
      z.literal("references/cover-agent-orchestration.md"),
      z.literal("references/agent-rework-and-system-hardening.md"),
    ]),
    workflowCommands: z.tuple([
      z.literal("production:preflight"),
      z.literal("production:start"),
      z.literal("production:narrative"),
      z.literal("production:scene:freeze"),
      z.literal("production:watch"),
      z.literal("production:scene:check"),
      z.literal("production:scene:submit"),
      z.literal("production:scene:fail"),
      z.literal("production:global-visual:check"),
      z.literal("production:global-visual:submit"),
      z.literal("production:global-visual:fail"),
      z.literal("delivery:cover:freeze"),
      z.literal("delivery:cover:check"),
      z.literal("delivery:cover:submit"),
      z.literal("production:render-ready:check"),
      z.literal("delivery:build"),
    ]),
    invariants: z
      .object({
        sceneAuthoringOwner: z.literal("one-child-agent-per-meaning-id"),
        globalVisualAuthoringOwner: z.literal("one-child-agent-per-story"),
        coverAuthoringOwner: z.literal("one-child-agent-per-story"),
        rootAgentAuthorsScenes: z.literal(false),
        rootAgentAuthorsGlobalVisual: z.literal(false),
        rootAgentAuthorsCover: z.literal(false),
        inlineSceneFallback: z.literal(false),
        repositoryMonitorsAgentLifecycle: z.literal(false),
        watcherInput: z.literal("immutable-result-contracts-only"),
        globalVisualReadsSceneOutputs: z.literal(false),
        coverReadsOnlyAssignmentInputs: z.literal(true),
        coverJoinsProductionWatcher: z.literal(false),
        coverMissingBlocksRenderReady: z.literal(false),
        coverMissingBlocksAutomaticDelivery: z.literal(true),
        publishingIntentStage: z.literal("story-authoring"),
        fixedFlowRecovery: z.literal(false),
        centralStateWriter: z.literal("repository-cli-only"),
        ttsChunkAutoSplit: z.literal(false),
        sceneRoot: z.literal("transparent"),
        sceneBackgroundOwner: z.literal("global-composition-only"),
        runtimeExternalSystems: z.literal(false),
        readabilityPolicySource: z.literal("frozen-assignment"),
        timingPolicy: z.literal("pcm-cumulative-ceil-v1"),
        deliveryRenderLaunchPolicy: z.literal(
          "detached-spawn-acknowledgement-v1",
        ),
        deliveryLaunchAmbiguityPolicy: z.literal(
          "intent-without-receipt-never-retry",
        ),
        deliveryReadsRenderedMp4: z.literal(false),
      })
      .strict(),
    forbiddenActions: z.tuple([
      z.literal("git add ."),
      z.literal("push"),
      z.literal("publish"),
      z.literal("monitor-detached-render"),
      z.literal("hand-edit-derived-state"),
    ]),
    contextBudgets: z
      .object({
        entrypointMaxWords: z.number().int().positive(),
        directWorkflowMaxWords: z.number().int().positive(),
        normalProductionMaxWords: z.number().int().positive(),
        sceneOrchestrationMaxWords: z.number().int().positive(),
        globalVisualOrchestrationMaxWords: z.number().int().positive(),
        coverOrchestrationMaxWords: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();

test("repository video skill exposes a structured production policy", async () => {
  const [
    skill,
    metadata,
    workflow,
    sceneWorkflow,
    globalVisualWorkflow,
    coverWorkflow,
    failurePolicy,
    rawPolicy,
  ] =
    await Promise.all([
      readSkillFile("SKILL.md"),
      readSkillFile("agents/openai.yaml"),
      readSkillFile("references/direct-production-workflow.md"),
      readSkillFile("references/scene-agent-orchestration.md"),
      readSkillFile("references/global-visual-agent-orchestration.md"),
      readSkillFile("references/cover-agent-orchestration.md"),
      readSkillFile("references/agent-rework-and-system-hardening.md"),
      readSkillFile("policy.json"),
    ]);
  const policy = SkillPolicySchema.parse(JSON.parse(rawPolicy));

  assert.match(skill, /^name: remotion-story-producer-video$/mu);
  assert.match(skill, /\(policy\.json\)/u);
  assert.match(metadata, /\$remotion-story-producer-video/u);

  for (const heading of policy.requiredEntrypointHeadings) {
    assert.match(skill, new RegExp(`^## ${heading}$`, "mu"));
  }
  for (const reference of policy.requiredReferences) {
    assert.match(
      skill,
      new RegExp(`\\(${reference.replaceAll(".", "\\.")}\\)`, "u"),
    );
    await assert.doesNotReject(readSkillFile(reference));
  }

  const executableWorkflow = `${workflow}\n${sceneWorkflow}\n${globalVisualWorkflow}\n${coverWorkflow}`;
  for (const command of policy.workflowCommands) {
    assert.match(executableWorkflow, new RegExp(`npm run ${command}`, "u"));
  }

  assert.ok(
    wordCount(skill) <= policy.contextBudgets.entrypointMaxWords,
    `SKILL.md exceeds its policy budget (${wordCount(skill)} words)`,
  );
  assert.ok(
    wordCount(workflow) <= policy.contextBudgets.directWorkflowMaxWords,
    `direct workflow exceeds its policy budget (${wordCount(workflow)} words)`,
  );
  assert.ok(
    wordCount(skill) + wordCount(workflow) <=
      policy.contextBudgets.normalProductionMaxWords,
    "normal production context exceeds its policy budget",
  );
  assert.ok(
    wordCount(sceneWorkflow) <=
      policy.contextBudgets.sceneOrchestrationMaxWords,
    `Scene orchestration exceeds its policy budget (${wordCount(sceneWorkflow)} words)`,
  );
  assert.ok(
    wordCount(globalVisualWorkflow) <=
      policy.contextBudgets.globalVisualOrchestrationMaxWords,
    `GlobalVisual orchestration exceeds its policy budget (${wordCount(globalVisualWorkflow)} words)`,
  );
  assert.ok(
    wordCount(coverWorkflow) <=
      policy.contextBudgets.coverOrchestrationMaxWords,
    `Cover orchestration exceeds its policy budget (${wordCount(coverWorkflow)} words)`,
  );
  assert.match(
    globalVisualWorkflow,
    /does not read Scene outputs|不得读取 Scene 输出/u,
  );
  assert.match(globalVisualWorkflow, /caption|字幕/u);
  assert.match(globalVisualWorkflow, /DSL|automatic director|自动导演/u);
  assert.match(
    executableWorkflow,
    /result contracts only|只(?:读取|接受)结果合同/u,
  );

  assert.ok(failurePolicy.length > 0);
  assert.ok(
    new Set(policy.workflowCommands).size === policy.workflowCommands.length,
  );
  assert.ok(
    new Set(policy.forbiddenActions).size === policy.forbiddenActions.length,
  );
});
