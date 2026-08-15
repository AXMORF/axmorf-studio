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
const NORMAL_PRODUCTION_HARD_MAX_CHARACTERS = 12_000;

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
    schemaVersion: z.literal(8),
    policyVersion: z.literal("remotion-story-producer-video-policy-v8"),
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
      z.literal("production:scene:check"),
      z.literal("production:owner:ready"),
      z.literal("production:owner:failed"),
    ]),
    invariants: z
      .object({
        sceneAuthoringOwner: z.literal(
          "one-independent-thread-per-owner-meaning-id",
        ),
        sceneAuthoringSkill: z.literal(
          "repository-local-remotion-best-practices",
        ),
        sceneTaskInputProjection: z.literal(
          "complete-assignment-task-input",
        ),
        sceneOwnerValidation: z.literal(
          "scene-check-ready-before-owner-ready",
        ),
        sceneReadabilityAuthority: z.literal(
          "assignment-readability-policy",
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
        storyBeatContract: z.literal(
          "discriminated-narrated-or-silent-scene",
        ),
        configuredSceneTemplates: z.literal(
          "project-configure-copy-with-project-local-instance",
        ),
        templateCopyOwnerPolicy: z.literal(
          "script-check-submit-without-owner-receipt",
        ),
        silentSceneNarrationPolicy: z.literal(
          "no-tts-no-captions-fixed-preset-frames",
        ),
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
        normalProductionMaxCharacters: z.number().int().positive(),
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
  assert.doesNotMatch(producerConfig, /POST \/clone|127\.0\.0\.1:31(?:00|01)/u);
  assert.match(
    sceneWorkflow,
    /完整读取[\s\S]*remotion-best-practices\/SKILL\.md[\s\S]*remotion-markup\/REFERENCE\.md/u,
  );
  assert.match(
    sceneWorkflow,
    /assignment\.taskInput[\s\S]*完整一致/u,
  );
  assert.match(sceneWorkflow, /task-input\.generated\.json/u);
  assert.match(
    sceneWorkflow,
    /node -e [^\n]*readFileSync\("<assignmentPath>"\)[^\n]*writeFileSync\("<sceneRoot>\/task-input\.generated\.json",JSON\.stringify\(a\.taskInput\)\)/u,
  );
  assert.match(
    sceneWorkflow,
    /不得[\s\S]{0,40}(?:手工挑字段|只改 fingerprint)/u,
  );
  assert.match(sceneWorkflow, /readabilityPolicy/u);
  assert.match(sceneWorkflow, /sceneContentSafeAreaPx/u);
  assert.match(sceneWorkflow, /typographyPolicy\.minFontSizePx/u);
  assert.match(sceneWorkflow, /allowedResourceIds/u);
  assert.match(sceneWorkflow, /allowedSnapshots/u);
  assert.match(sceneWorkflow, /透明 Scene/u);
  assert.match(workflow, /ProducerConfig[\s\S]*boundary Scene[\s\S]*copies/u);
  assert.match(workflow, /templateMeaningIds[\s\S]*ownerMeaningIds/u);
  assert.match(workflow, /Do not dispatch[\s\S]*templateMeaningIds/u);
  assert.match(sceneWorkflow, /silent-scene/u);
  assert.match(sceneWorkflow, /不得[\s\S]*TTS[\s\S]*CaptionCue/u);
  assert.match(sceneWorkflow, /顶层[\s\S]{0,40}字幕[\s\S]{0,20}旁白[\s\S]{0,20}背景/u);

  const sceneCheckCommand =
    "npm run production:scene:check -- --run <runId> --scene <meaningId>";
  const sceneReadyCommand =
    "npm run production:owner:ready -- --run <runId> --owner scene --scene <meaningId>";
  const sceneCheckIndex = sceneWorkflow.indexOf(sceneCheckCommand);
  const readyStatusIndex = sceneWorkflow.indexOf("ready-to-submit");
  const sceneReadyIndex = sceneWorkflow.indexOf(sceneReadyCommand);
  assert.ok(sceneCheckIndex >= 0, "Scene owner prompt must run Scene check");
  assert.ok(
    readyStatusIndex > sceneCheckIndex,
    "Scene owner prompt must require ready-to-submit after Scene check",
  );
  assert.ok(
    sceneReadyIndex > readyStatusIndex,
    "Scene owner prompt must publish owner-ready only after ready-to-submit",
  );
  assert.match(
    sceneWorkflow,
    /校验失败[\s\S]*同一 owner[\s\S]*重跑/u,
  );
  assert.match(
    sceneWorkflow,
    /不得[^\n]*owner-failed[^\n]*校验控制流/u,
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
  const normalProductionWords = [
    skill,
    workflow,
    producerConfig,
    sceneWorkflow,
    globalVisualWorkflow,
    coverWorkflow,
  ].reduce((total, document) => total + wordCount(document), 0);
  const normalProductionCharacters = [
    skill,
    workflow,
    producerConfig,
    sceneWorkflow,
    globalVisualWorkflow,
    coverWorkflow,
  ].reduce((total, document) => total + Array.from(document).length, 0);
  assert.ok(
    normalProductionWords <= policy.contextBudgets.normalProductionMaxWords,
    `normal production context exceeds its policy budget (${normalProductionWords} words)`,
  );
  assert.ok(
    policy.contextBudgets.normalProductionMaxCharacters <=
      NORMAL_PRODUCTION_HARD_MAX_CHARACTERS,
    "normal production character budget exceeds the test-owned hard ceiling",
  );
  assert.ok(
    normalProductionCharacters <=
      policy.contextBudgets.normalProductionMaxCharacters,
    `normal production context exceeds its policy budget (${normalProductionCharacters} characters)`,
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
  assert.match(workflow, /StoryBeat/u);
  assert.match(workflow, /Agent-authored ttsChunks/u);
  assert.match(workflow, /VisualStyleSpec/u);
  assert.match(workflow, /Scene brief/u);
  assert.match(workflow, /Cover/u);
  assert.match(
    workflow,
    /scripts?\s+(?:freeze|validate|execute)[\s\S]*do not choose creative direction/iu,
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
