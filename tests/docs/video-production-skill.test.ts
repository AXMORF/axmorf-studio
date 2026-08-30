import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { z } from "zod";

const skillRoot = path.join(process.cwd(), ".agents/skills/axmorf-video");
const readSkillFile = (relativePath: string) =>
  readFile(path.join(skillRoot, relativePath), "utf8");
const wordCount = (value: string) => value.trim().split(/\s+/u).length;

const PolicySchema = z
  .object({
    schemaVersion: z.literal(18),
    policyVersion: z.literal("axmorf-video-policy-v21"),
    rootEndpoints: z.tuple([
      z.literal("project-production-complete"),
      z.literal("project-production-current"),
    ]),
    privateConfigPath: z.literal("private/producer.config.json"),
    executionPreferencesPath: z.literal("private/execution-preferences.json"),
    requiredEntrypointHeadings: z.array(z.string().min(1)).min(8),
    requiredReferences: z.array(z.string().min(1)).min(6),
    workflowCommands: z.tuple([
      z.literal("project:create"),
      z.literal("project:originality:freeze"),
      z.literal("project:revise:context"),
      z.literal("project:revise:validate"),
      z.literal("project:revise"),
      z.literal("project:revision:promote"),
      z.literal("project:execution:resolve"),
      z.literal("project:produce:inspect"),
      z.literal("project:produce:prepare"),
      z.literal("project:task:bind"),
      z.literal("project:task:describe"),
      z.literal("project:task:finalize"),
      z.literal("project:task:check"),
      z.literal("project:task:commit"),
      z.literal("project:task:fail"),
      z.literal("project:task:file-read"),
      z.literal("project:task:file-write"),
      z.literal("project:attempt:recover-inspect"),
      z.literal("project:attempt:reissue"),
      z.literal("project:produce:continue"),
    ]),
    executionPolicy: z
      .object({
        resolutionPhase: z.literal("before-production-inspect"),
        precedence: z.tuple([
          z.literal("user-prompt"),
          z.literal("settings-page"),
          z.literal("builtin-default"),
        ]),
        promptOverridePersistence: z.literal(
          "current-production-only-unless-explicit-save",
        ),
        defaultMode: z.literal("inline"),
        defaultSubagentMaxConcurrency: z.literal(4),
        repositoryMaxConcurrency: z.literal(4),
        unknownRuntimeMaxConcurrency: z.literal(1),
        inlinePolicy: z.literal("root-sequential-one-workspace-at-a-time"),
        subagentPolicy: z.literal("bounded-pool-wait-any-admission"),
        subagentWorkerTransport: z.literal(
          "verified-shared-workspace-or-controller-io",
        ),
        unverifiedWorkerTransportPolicy: z.literal("block-before-prepare"),
        exactCapacityFailurePolicy: z.literal("block-before-prepare"),
        automaticModeFallback: z.literal(false),
        identityVisibility: z.literal("none"),
      })
      .strict(),
    optionalCapabilitySlots: z
      .object({
        externalAssetAcquisition: z
          .object({
            slotVersion: z.literal("external-asset-acquisition-agent-slot-v1"),
            owner: z.literal("root-agent"),
            activation: z.literal(
              "current-agent-exposes-import-compatible-mcp-tools",
            ),
            phase: z.literal("after-project-create-before-production-inspect"),
            absencePolicy: z.literal("omit-without-error-or-placeholder"),
            admissionBoundary: z.literal("project-asset-import-receipt"),
            downstreamVisibility: z.literal("none"),
          })
          .strict(),
      })
      .strict(),
    invariants: z
      .object({
        productionAuthority: z.literal(
          "production-revision-task-dag-artifact-attestation",
        ),
        rootAgentRole: z.literal(
          "resolved-inline-sequential-or-bounded-dispatch",
        ),
        executionAttemptRole: z.literal("diagnostics-only"),
        sceneAuthoringSkill: z.literal(
          "repository-local-remotion-best-practices",
        ),
        sharedCheckout: z.literal(true),
        taskExecutionContract: z.literal(
          "immutable-attempt-neutral-agent-task-input",
        ),
        agentWriteBoundary: z.literal(
          "declared-task-outputs-only-after-successful-attempt-bound-bind",
        ),
        artifactAuthority: z.literal("validated-artifact-attestation"),
        artifactReusePolicy: z.literal(
          "reuse-valid-content-addressed-artifacts",
        ),
        rootWaitsForAllChildTerminalStates: z.literal(false),
        rootPostDispatchParticipation: z.literal(
          "none-after-fixed-continuation-starts",
        ),
        fixedContinuationMonitorsTaskEvents: z.literal(true),
        convergePolicy: z.literal(
          "fixed-exactly-once-after-all-agent-artifacts",
        ),
        agentFailurePolicy: z.literal("terminal-exit-without-converge"),
        fixedFailurePolicy: z.literal(
          "terminal-exit-without-root-reentry-or-retry",
        ),
        globalVisualReadsSceneOutputs: z.literal(false),
        childIdentityPersisted: z.literal(false),
        timingPolicy: z.literal("pcm-cumulative-ceil-v1"),
        templateCopyPolicy: z.literal("fixed-task-artifact-without-agent"),
        deliveryPolicy: z.literal(
          "synchronous-exact-four-file-controlled-promotion",
        ),
      })
      .passthrough(),
    forbiddenActions: z.array(z.string().min(1)).min(8),
    contextBudgets: z
      .object({
        entrypointMaxWords: z.number().int().positive(),
        directWorkflowMaxWords: z.number().int().positive(),
        projectRevisionMaxWords: z.number().int().positive(),
        normalProductionMaxWords: z.number().int().positive(),
        normalProductionMaxCharacters: z.number().int().positive().max(18_000),
        sceneOrchestrationMaxWords: z.number().int().positive(),
        globalVisualOrchestrationMaxWords: z.number().int().positive(),
        coverOrchestrationMaxWords: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();

test("repository video skill uses Revision, Task DAG, artifacts, and synchronous delivery", async () => {
  const [
    skill,
    openAiMetadata,
    workflow,
    revisionWorkflow,
    scene,
    globalVisual,
    cover,
    hardening,
    taskProtocol,
    producerConfig,
    rawPolicy,
  ] = await Promise.all([
    readSkillFile("SKILL.md"),
    readSkillFile("agents/openai.yaml"),
    readSkillFile("references/direct-production-workflow.md"),
    readSkillFile("references/project-revision.md"),
    readSkillFile("references/scene-agent-orchestration.md"),
    readSkillFile("references/global-visual-agent-orchestration.md"),
    readSkillFile("references/cover-agent-orchestration.md"),
    readSkillFile("references/agent-rework-and-system-hardening.md"),
    readSkillFile("references/task-execution-protocol.md"),
    readSkillFile("references/producer-config.md"),
    readSkillFile("policy.json"),
  ]);
  const policy = PolicySchema.parse(JSON.parse(rawPolicy));
  const executable = `${workflow}\n${revisionWorkflow}\n${scene}\n${globalVisual}\n${cover}`;
  const bundle = `${skill}\n${executable}\n${hardening}\n${taskProtocol}\n${producerConfig}\n${rawPolicy}`;

  assert.match(skill, /^name: axmorf-video$/mu);
  assert.match(openAiMetadata, /\$axmorf-video/u);
  assert.match(openAiMetadata, /内置 inline/u);
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
  for (const command of policy.workflowCommands) {
    assert.match(executable, new RegExp(`npm run ${command}`, "u"));
  }

  assert.match(workflow, /ProductionRevision/u);
  assert.match(workflow, /Task DAG/u);
  assert.match(workflow, /ArtifactAttestation/u);
  assert.match(workflow, /dirtyAgentTasks/u);
  assert.match(workflow, /read-only/iu);
  assert.ok(
    workflow.indexOf("project:execution:resolve") <
      workflow.indexOf("project:produce:inspect"),
  );
  assert.ok(
    workflow.indexOf("project:produce:inspect") <
      workflow.indexOf("project:produce:prepare"),
  );
  assert.match(workflow, /project-production-current/u);
  assert.match(
    workflow,
    /video\.mp4[\s\S]*cover-4x3\.png[\s\S]*cover-3x4\.png[\s\S]*publish\.json/u,
  );
  assert.match(workflow, /checksum[\s\S]*EOF-decode/u);
  assert.match(workflow, /attempt ID[\s\S]*never enter[\s\S]*TaskRevision/iu);
  assert.match(
    skill,
    /current Agent's actually callable tools[\s\S]*get_provider_status[\s\S]*search_images[\s\S]*preview_images[\s\S]*acquire_image/u,
  );
  assert.match(
    workflow,
    /If the MCP is absent[\s\S]*omit this entire stage without error, placeholder task,[\s\S]*DAG node/u,
  );
  assert.match(
    workflow,
    /project:asset:import[\s\S]*Project-owned manifest IDs and\s+fingerprints/u,
  );
  assert.ok(
    workflow.indexOf("project:asset:import") <
      workflow.indexOf("project:produce:inspect"),
  );
  assert.match(skill, /another Agent's tools do[\s\S]*not count/u);
  assert.match(skill, /revision workflow[\s\S]*never edit live authoring/u);
  assert.match(
    revisionWorkflow,
    /project:revise:validate[\s\S]*baseDeliveryBuildId[\s\S]*--candidate/u,
  );
  assert.match(
    revisionWorkflow,
    /project:revision:promote[\s\S]*Do not reissue/u,
  );
  assert.match(
    taskProtocol,
    /runtime-native child[\s\S]*shared-workspace[\s\S]*controller-io/u,
  );
  assert.match(taskProtocol, /Transport is ephemeral host evidence/u);
  assert.match(
    taskProtocol,
    /immutable[\s\S]*attempt-neutral[\s\S]*TaskExecutionContract/u,
  );
  assert.match(skill, /validated ArtifactAttestation[\s\S]*durable authority/u);
  assert.match(skill, /exactly once/u);
  assert.match(
    skill,
    /User silence means inheritance[\s\S]*never infer `null`/u,
  );
  assert.match(
    skill,
    /Root's final production action[\s\S]*continuationCommand/u,
  );
  assert.match(skill, /without polling[\s\S]*token-consuming supervision/u);
  assert.match(skill, /failure exits nonzero without converge/u);
  assert.equal(
    policy.invariants.fixedContinuationClaimPolicy,
    "one-shot-atomic-exact-attempt",
  );
  assert.equal(
    policy.invariants.fixedContinuationEventSource,
    "immutable-attempt-event-log",
  );
  assert.equal(policy.invariants.fixedContinuationTimeoutMs, 3_600_000);
  assert.equal(
    policy.invariants.fixedContinuationDeadlineOrigin,
    "execution-attempt-created-at",
  );
  assert.deepEqual(policy.executionPolicy.precedence, [
    "user-prompt",
    "settings-page",
    "builtin-default",
  ]);
  assert.match(workflow, /bounded pool[\s\S]*wait-any/iu);
  assert.match(workflow, /automatic inline fallback/iu);
  assert.match(workflow, /--worker-transport shared-workspace\|controller-io/u);
  assert.match(workflow, /zero-write gate[\s\S]*task-worker-bound/iu);
  assert.match(workflow, /user silence[\s\S]*never become `null`/iu);
  assert.match(
    producerConfig,
    /absence of a request is not authorization to disable bookends/u,
  );

  assert.match(scene, /remotion-best-practices\/SKILL\.md/u);
  assert.match(scene, /remotion-markup\/REFERENCE\.md/u);
  assert.match(scene, /bindingId: <bindingId>/u);
  assert.match(scene, /shared-workspace[\s\S]*controller-io/u);
  assert.match(scene, /inputs\/task-contract\.json/u);
  assert.match(scene, /task-input\.generated\.json/u);
  assert.match(scene, /fixed materialization/u);
  assert.doesNotMatch(scene, /taskInput 必须完整投影/u);
  assert.match(scene, /sceneViewport/u);
  assert.doesNotMatch(scene, /完整画布坐标系/u);
  assert.match(scene, /sceneViewport\.minFontSizePx/u);
  assert.match(scene, /allowedResourceIds/u);
  assert.match(scene, /allowedSnapshots/u);
  assert.match(scene, /不得读取、推导或重复/u);
  assert.match(scene, /透明 Scene/u);
  assert.match(scene, /不得读取其他 workspace/u);
  assert.match(scene, /scene-template[\s\S]*不由 Agent executor/u);

  assert.match(globalVisual, /不得读取 Scene 输出/u);
  assert.match(globalVisual, /simplest[\s\S]*full-frame base/u);
  assert.match(globalVisual, /current[\s\S]*VisualStyleSpec/u);
  assert.match(globalVisual, /must not invent[\s\S]*continuity motifs/u);
  assert.match(globalVisual, /GlobalVisualBaseLayer/u);
  assert.match(globalVisual, /GlobalVisualDecorationLayers/u);
  assert.match(globalVisual, /layerPolicy[\s\S]*窗口 local frame 0/u);
  assert.match(globalVisual, /caption|字幕/u);
  assert.match(globalVisual, /DSL|automatic director/u);
  assert.match(cover, /StorySpec[\s\S]*VisualStyleSpec[\s\S]*fixed CoverSpec/u);
  assert.match(cover, /不得读取 PublishingIntent/u);
  for (const taskPrompt of [scene, globalVisual, cover]) {
    assert.doesNotMatch(
      taskPrompt,
      /get_provider_status|search_images|preview_images|acquire_image/u,
    );
  }

  const finalizeCommand =
    "npm run project:task:finalize -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>";
  const checkCommand =
    "npm run project:task:check -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>";
  const commitCommand =
    "npm run project:task:commit -- --task <taskRevision> --attempt <attemptId> --binding <bindingId>";
  for (const prompt of [scene, globalVisual, cover]) {
    assert.match(prompt, /exact task bind command/u);
    assert.match(prompt, /task-worker-bound/u);
    assert.ok(prompt.indexOf(finalizeCommand) >= 0);
    assert.ok(prompt.indexOf(checkCommand) > prompt.indexOf(finalizeCommand));
    assert.ok(prompt.indexOf(commitCommand) > prompt.indexOf(checkCommand));
    assert.match(prompt, /taskFailureCommand/u);
    assert.match(prompt, /spawnFailureCommand/u);
    assert.match(prompt, /fixedFailureCommand/u);
  }
  assert.match(
    workflow,
    /project:produce:continue[\s\S]*--attempt <attemptId>/u,
  );
  assert.doesNotMatch(workflow, /npm run project:produce:converge/u);
  assert.match(
    hardening,
    /project:attempt:recover-inspect[\s\S]*project:attempt:reissue[\s\S]*fresh attempt/iu,
  );
  assert.match(
    hardening,
    /(?:does not require|needs no|不要求)[\s\S]*current delivery/iu,
  );
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
  assert.doesNotMatch(
    bundle,
    /owner[- ](?:ready|failed)|render-ready|detached spawn|launch-ambiguous/u,
  );
  assert.doesNotMatch(bundle, /create_thread/u);
  assert.doesNotMatch(
    bundle,
    /\brsp\b|Desktop|\bDeliveryPolicy\b|source-current|compat(?:ibility)? shim/u,
  );

  assert.ok(wordCount(skill) <= policy.contextBudgets.entrypointMaxWords);
  assert.ok(
    wordCount(workflow) <= policy.contextBudgets.directWorkflowMaxWords,
  );
  assert.ok(
    wordCount(revisionWorkflow) <=
      policy.contextBudgets.projectRevisionMaxWords,
  );
  assert.ok(
    wordCount(scene) <= policy.contextBudgets.sceneOrchestrationMaxWords,
  );
  assert.ok(
    wordCount(globalVisual) <=
      policy.contextBudgets.globalVisualOrchestrationMaxWords,
  );
  assert.ok(
    wordCount(cover) <= policy.contextBudgets.coverOrchestrationMaxWords,
  );
  const normal = [skill, workflow, producerConfig, scene, globalVisual, cover];
  assert.ok(
    normal.reduce((sum, source) => sum + wordCount(source), 0) <=
      policy.contextBudgets.normalProductionMaxWords,
  );
  assert.ok(
    normal.reduce((sum, source) => sum + Array.from(source).length, 0) <=
      policy.contextBudgets.normalProductionMaxCharacters,
  );
  assert.equal(
    new Set(policy.workflowCommands).size,
    policy.workflowCommands.length,
  );
  assert.equal(
    new Set(policy.forbiddenActions).size,
    policy.forbiddenActions.length,
  );
});

test("skill directory contains only the declared operational bundle", async () => {
  const references = (await readdir(path.join(skillRoot, "references"))).sort();
  assert.deepEqual(references, [
    "agent-rework-and-system-hardening.md",
    "cover-agent-orchestration.md",
    "direct-production-workflow.md",
    "global-visual-agent-orchestration.md",
    "producer-config.md",
    "project-revision.md",
    "scene-agent-orchestration.md",
    "task-execution-protocol.md",
  ]);
});
