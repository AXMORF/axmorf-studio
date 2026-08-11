import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { z } from "zod";

const skillRoot = path.join(
  process.cwd(),
  ".agents/skills/remotion-story-producer-video",
);
const remotionBestPracticesRoot = path.join(
  process.cwd(),
  ".agents/skills/remotion-best-practices",
);

const readSkillFile = (relativePath: string) =>
  readFile(path.join(skillRoot, relativePath), "utf8");

const wordCount = (value: string) => value.trim().split(/\s+/u).length;

const listFiles = async (
  root: string,
  relativeDirectory = "",
): Promise<string[]> => {
  const entries = await readdir(path.join(root, relativeDirectory), {
    withFileTypes: true,
  });
  const files: string[][] = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = path.join(relativeDirectory, entry.name);
      return entry.isDirectory()
        ? listFiles(root, relativePath)
        : [relativePath];
    }),
  );
  return files.flat().sort();
};

const fingerprintFileTree = async (
  root: string,
): Promise<{ fileCount: number; fingerprint: string }> => {
  const files = await listFiles(root);
  const contents = await Promise.all(
    files.map((relativePath) => readFile(path.join(root, relativePath))),
  );
  const hash = createHash("sha256");
  files.forEach((relativePath, index) => {
    hash.update(relativePath);
    hash.update("\0");
    hash.update(contents[index].toString("base64"));
    hash.update("\0");
  });
  return { fileCount: files.length, fingerprint: hash.digest("hex") };
};

const SkillPolicySchema = z
  .object({
    schemaVersion: z.literal(5),
    policyVersion: z.literal("remotion-story-producer-video-policy-v5"),
    rootEndpoint: z.literal("watcher-started-and-owners-dispatched"),
    backgroundEndpoint: z.literal("delivery-render-started"),
    privateConfigPath: z.literal("private/producer.config.json"),
    requiredEntrypointHeadings: z.tuple([
      z.literal("Start directly"),
      z.literal("Freeze inputs before dispatch"),
      z.literal("Launch watcher and dispatch threads"),
      z.literal("Keep context bounded"),
      z.literal("Preserve production invariants"),
      z.literal("Classify failure by owner"),
      z.literal("Finish after dispatch"),
    ]),
    requiredReferences: z.tuple([
      z.literal("references/producer-config.md"),
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
      z.literal("delivery:cover:freeze"),
      z.literal("production:watch:start"),
      z.literal("production:owner:ready"),
      z.literal("production:owner:failed"),
    ]),
    invariants: z
      .object({
        sceneAuthoringOwner: z.literal("one-independent-thread-per-meaning-id"),
        sceneAuthoringSkill: z.literal(
          "repository-local-remotion-best-practices",
        ),
        globalVisualAuthoringOwner: z.literal(
          "one-independent-thread-per-story",
        ),
        globalVisualDefaultRole: z.literal(
          "minimal-style-aligned-background-board",
        ),
        coverAuthoringOwner: z.literal("one-independent-thread-per-story"),
        threadCreationSurface: z.literal("create_thread"),
        sharedCheckout: z.literal(true),
        rootAgentAuthorsOwnerOutputs: z.literal(false),
        rootWaitsAfterDispatch: z.literal(false),
        repositoryMonitorsThreadLifecycle: z.literal(false),
        watcherInput: z.literal("assignment-bound-owner-receipts-only"),
        missingReceiptPolicy: z.literal(
          "wait-without-timeout-retry-or-heartbeat",
        ),
        globalVisualReadsSceneOutputs: z.literal(false),
        coverReadsOnlyAssignmentInputs: z.literal(true),
        coverMissingBlocksRenderReady: z.literal(false),
        coverMissingBlocksAutomaticDelivery: z.literal(true),
        centralWriter: z.literal("detached-repository-watcher-only"),
        threadIdentityPersisted: z.literal(false),
        timingPolicy: z.literal("pcm-cumulative-ceil-v1"),
        watcherLaunchPolicy: z.literal("detached-spawn-acknowledgement-v1"),
        watcherLaunchAmbiguityPolicy: z.literal(
          "intent-without-receipt-never-retry",
        ),
        deliveryLaunchPolicy: z.literal("detached-spawn-acknowledgement-v1"),
        deliveryLaunchAmbiguityPolicy: z.literal(
          "intent-without-receipt-never-retry",
        ),
        deliveryReadsRenderedMp4: z.literal(false),
      })
      .strict(),
    forbiddenActions: z.tuple([
      z.literal("subagent-owner"),
      z.literal("wait_threads"),
      z.literal("read_thread"),
      z.literal("git add ."),
      z.literal("push"),
      z.literal("publish"),
      z.literal("monitor-detached-watcher"),
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
    producerConfig,
    sceneWorkflow,
    globalVisualWorkflow,
    coverWorkflow,
    failurePolicy,
    rawPolicy,
  ] = await Promise.all([
    readSkillFile("SKILL.md"),
    readSkillFile("agents/openai.yaml"),
    readSkillFile("references/direct-production-workflow.md"),
    readSkillFile("references/producer-config.md"),
    readSkillFile("references/scene-agent-orchestration.md"),
    readSkillFile("references/global-visual-agent-orchestration.md"),
    readSkillFile("references/cover-agent-orchestration.md"),
    readSkillFile("references/agent-rework-and-system-hardening.md"),
    readSkillFile("policy.json"),
  ]);
  const policy = SkillPolicySchema.parse(JSON.parse(rawPolicy));
  const remotionBestPractices = await readFile(
    path.join(remotionBestPracticesRoot, "SKILL.md"),
    "utf8",
  );

  assert.match(skill, /^name: remotion-story-producer-video$/mu);
  assert.match(skill, /\(policy\.json\)/u);
  assert.match(metadata, /\$remotion-story-producer-video/u);
  assert.match(remotionBestPractices, /^name: remotion-best-practices$/mu);
  assert.match(
    remotionBestPractices,
    /^description: Router for all Remotion skills$/mu,
  );
  assert.match(remotionBestPractices, /^version: 4\.0\.506$/mu);
  assert.deepEqual(await fingerprintFileTree(remotionBestPracticesRoot), {
    fileCount: 127,
    fingerprint:
      "a27d1df90df0b28e026f3c112af5d9821d9c3be655b73c3503b221fbdb2edc3a",
  });

  const alignedDocumentation = await Promise.all(
    [
      "AGENTS.md",
      "README.md",
      "docs/FINAL_PRODUCT_GOAL.md",
      "docs/ITERATION_STATUS.md",
      "docs/PRODUCTION_WORKFLOW.md",
      "docs/ARCHITECTURE.md",
      "docs/guides/PRODUCTION_ORCHESTRATION.md",
      "docs/guides/REVIEW_MODEL.md",
      "docs/guides/CAPABILITY_CATALOG.md",
    ].map((relativePath) =>
      readFile(path.join(process.cwd(), relativePath), "utf8"),
    ),
  );
  for (const document of alignedDocumentation) {
    assert.match(document, /remotion-best-practices/u);
  }

  assert.match(
    sceneWorkflow,
    /\.agents\/skills\/remotion-best-practices\/SKILL\.md/u,
  );
  assert.match(producerConfig, /publishingCollections/u);
  assert.match(producerConfig, /targetLoudnessLufs/u);
  assert.match(producerConfig, /POST \/clone_with_prompt/u);
  assert.match(
    sceneWorkflow,
    /must read and use[\s\S]*remotion-best-practices\/SKILL\.md` completely[\s\S]*remotion-markup\/REFERENCE\.md/u,
  );

  const remotionRuleReferences = [
    ...remotionBestPractices.matchAll(/\]\(([^)#]+\.md)(?:#[^)]+)?\)/gu),
  ]
    .map((match) => match[1].replace(/^\.\//u, ""))
    .filter((reference) => !/^[a-z]+:\/\//u.test(reference));
  assert.ok(remotionRuleReferences.length > 0);
  assert.ok(remotionRuleReferences.includes("remotion-markup/REFERENCE.md"));
  for (const reference of new Set(remotionRuleReferences)) {
    await assert.doesNotReject(
      readFile(path.join(remotionBestPracticesRoot, reference), "utf8"),
    );
  }

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
  assert.match(globalVisualWorkflow, /simplest full-frame background board/u);
  assert.match(
    globalVisualWorkflow,
    /aligned with the[\s\S]*current VisualStyleSpec/u,
  );
  assert.match(
    globalVisualWorkflow,
    /must not invent[\s\S]*continuity motifs/u,
  );
  assert.match(globalVisualWorkflow, /caption|字幕/u);
  assert.match(globalVisualWorkflow, /DSL|automatic director|自动导演/u);
  assert.match(
    executableWorkflow,
    /assignment-keyed receipts|assignment-bound-owner-receipts|assignment identity|receipt/u,
  );
  assert.match(executableWorkflow, /create_thread/u);
  assert.doesNotMatch(
    executableWorkflow,
    /production:scene:submit|delivery:cover:submit/u,
  );

  assert.ok(failurePolicy.length > 0);
  assert.ok(
    new Set(policy.workflowCommands).size === policy.workflowCommands.length,
  );
  assert.ok(
    new Set(policy.forbiddenActions).size === policy.forbiddenActions.length,
  );
});
