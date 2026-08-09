import {
  ProductionRenderPlanSchema,
  ProductionRenderReadySchema,
  type ProductionRenderPlan,
  type ProductionRenderReady,
} from "../../../src/contracts";
import {
  acquireProductionRunLock,
  appendProductionRunEvent,
  readProductionRunStore,
} from "../adapters/run-store";
import { createProductionStageEvent } from "../domain/events";
import { createUnexpectedProductionError } from "../domain/errors";
import { createDefaultRenderReadyDependencies } from "./render-ready-default";

type CommonRequest = Readonly<{
  rootDir: string;
  runId: string;
  storyId: string;
  requirementsFingerprint: string;
}>;

export type RenderReadyDependencies = Readonly<{
  assertCurrentFreeze: (request: CommonRequest) => Promise<void>;
  prepareRenderPlan: (
    request: CommonRequest & Readonly<{ mode: "write" | "check" }>,
  ) => Promise<ProductionRenderPlan>;
  projectRegistry: (
    request: CommonRequest & Readonly<{ mode: "write" | "check" }>,
  ) => Promise<{
    readonly compositionId: string;
    readonly registryChecksum: string;
  }>;
  compileProjectComposition: (request: CommonRequest) => Promise<unknown>;
  writeOrCheckRenderReady: (
    request: CommonRequest &
      Readonly<{
        mode: "write" | "check";
        plan: ProductionRenderPlan;
      }>,
  ) => Promise<ProductionRenderReady>;
}>;

const assertReadyBindings = ({
  common,
  plan: rawPlan,
  ready: rawReady,
  registry,
}: {
  readonly common: CommonRequest;
  readonly plan: ProductionRenderPlan;
  readonly ready: ProductionRenderReady;
  readonly registry: {
    readonly compositionId: string;
    readonly registryChecksum: string;
  };
}) => {
  const plan = ProductionRenderPlanSchema.parse(rawPlan);
  const ready = ProductionRenderReadySchema.parse(rawReady);
  if (
    plan.runId !== common.runId ||
    ready.runId !== common.runId ||
    plan.storyId !== common.storyId ||
    ready.storyId !== common.storyId ||
    plan.requirementsFingerprint !== common.requirementsFingerprint ||
    ready.requirementsFingerprint !== common.requirementsFingerprint ||
    ready.renderPlanFingerprint !== plan.renderPlanFingerprint ||
    registry.compositionId !== plan.compositionId
  ) {
    throw new Error("Production render-ready bindings are stale.");
  }
  return { plan, ready, registry } as const;
};

const resultFor = ({
  runId,
  ready,
  noOp,
}: {
  readonly runId: string;
  readonly ready: ProductionRenderReady;
  readonly noOp: boolean;
}) => ({
  runId,
  status: "render-ready" as const,
  handoff: "awaiting-automatic-delivery" as const,
  renderPlanFingerprint: ready.renderPlanFingerprint,
  renderReadyFingerprint: ready.renderReadyFingerprint,
  statePath: `.producer-runs/${runId}/state.generated.json`,
  noOp,
});

export const runProductionRenderReady = async ({
  rootDir,
  runId,
  clock = () => new Date(),
  dependencies = createDefaultRenderReadyDependencies(),
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly clock?: () => Date;
  readonly dependencies?: RenderReadyDependencies;
}) => {
  const now = clock();
  if (Number.isNaN(now.getTime())) {
    throw new Error("Production render-ready clock is invalid.");
  }
  const lock = await acquireProductionRunLock({
    rootDir,
    runId,
    ownerId: "production-render-ready",
    acquiredAt: now.toISOString(),
  });
  try {
    let loaded = await readProductionRunStore({ rootDir, runId });
    const common = {
      rootDir,
      runId,
      storyId: loaded.run.storyId,
      requirementsFingerprint: loaded.run.requirementsFingerprint,
    } as const;
    if (loaded.state.state === "render-ready") {
      await dependencies.assertCurrentFreeze(common);
      const plan = ProductionRenderPlanSchema.parse(
        await dependencies.prepareRenderPlan({ ...common, mode: "check" }),
      );
      const registry = await dependencies.projectRegistry({
        ...common,
        mode: "check",
      });
      await dependencies.compileProjectComposition(common);
      const ready = ProductionRenderReadySchema.parse(
        await dependencies.writeOrCheckRenderReady({
          ...common,
          mode: "check",
          plan,
        }),
      );
      const current = assertReadyBindings({ common, plan, ready, registry });
      return resultFor({ runId, ready: current.ready, noOp: true });
    }
    if (loaded.state.state !== "render-ready-running") {
      throw new Error("Production render-ready requires accepted owner results.");
    }
    loaded = {
      ...loaded,
      state: (
        await appendProductionRunEvent({
          rootDir,
          runId,
          lock,
          event: createProductionStageEvent({
            type: "stage-started",
            runId: loaded.run.runId,
            storyId: loaded.run.storyId,
            sequence: loaded.state.lastSequence + 1,
            eventId: `render-ready-started-${loaded.state.lastSequence + 1}`,
            stageId: "render-ready",
            attempt: 1,
            occurredAt: now.toISOString(),
            commandId: "production-render-ready",
            previousStateFingerprint: loaded.state.stateFingerprint,
            inputFingerprints: [
              {
                artifactId: "requirements",
                fingerprint: loaded.run.requirementsFingerprint,
              },
            ],
          }),
        })
      ).state,
    };
    await dependencies.assertCurrentFreeze(common);
    const writtenPlan = ProductionRenderPlanSchema.parse(
      await dependencies.prepareRenderPlan({ ...common, mode: "write" }),
    );
    const plan = ProductionRenderPlanSchema.parse(
      await dependencies.prepareRenderPlan({ ...common, mode: "check" }),
    );
    if (writtenPlan.renderPlanFingerprint !== plan.renderPlanFingerprint) {
      throw new Error("Production render plan write/check drifted.");
    }
    const writtenRegistry = await dependencies.projectRegistry({
      ...common,
      mode: "write",
    });
    const registry = await dependencies.projectRegistry({
      ...common,
      mode: "check",
    });
    if (
      writtenRegistry.compositionId !== registry.compositionId ||
      writtenRegistry.registryChecksum !== registry.registryChecksum
    ) {
      throw new Error("ProjectRegistry write/check drifted during render-ready.");
    }
    await dependencies.compileProjectComposition(common);
    const writtenReady = ProductionRenderReadySchema.parse(
      await dependencies.writeOrCheckRenderReady({
        ...common,
        mode: "write",
        plan,
      }),
    );
    const ready = ProductionRenderReadySchema.parse(
      await dependencies.writeOrCheckRenderReady({
        ...common,
        mode: "check",
        plan,
      }),
    );
    if (writtenReady.renderReadyFingerprint !== ready.renderReadyFingerprint) {
      throw new Error("Production render-ready write/check drifted.");
    }
    const current = assertReadyBindings({ common, plan, ready, registry });
    await appendProductionRunEvent({
      rootDir,
      runId,
      lock,
      event: createProductionStageEvent({
        type: "render-ready",
        runId: loaded.run.runId,
        storyId: loaded.run.storyId,
        sequence: loaded.state.lastSequence + 1,
        eventId: `render-ready-${loaded.state.lastSequence + 1}`,
        stageId: "render-ready",
        attempt: 1,
        occurredAt: now.toISOString(),
        commandId: "production-render-ready",
        previousStateFingerprint: loaded.state.stateFingerprint,
        inputFingerprints: [
          {
            artifactId: "requirements",
            fingerprint: loaded.run.requirementsFingerprint,
          },
        ],
        outputArtifacts: [
          {
            artifactId: "production-render-plan",
            repositoryPath: `src/projects/${loaded.run.storyId}/generated/production-render-plan.generated.json`,
            fingerprint: current.plan.renderPlanFingerprint,
          },
          {
            artifactId: "production-render-ready",
            repositoryPath: `src/projects/${loaded.run.storyId}/generated/production-render-ready.generated.json`,
            fingerprint: current.ready.renderReadyFingerprint,
          },
          {
            artifactId: "production-project-registry",
            repositoryPath: "src/projects/project-registry.generated.ts",
            fingerprint: current.registry.registryChecksum,
          },
        ],
        status: "render-ready",
        handoff: "awaiting-automatic-delivery",
      }),
    });
    return resultFor({ runId, ready: current.ready, noOp: false });
  } catch (error) {
    const loaded = await readProductionRunStore({ rootDir, runId });
    if (loaded.state.state !== "failed") {
      const failure = createUnexpectedProductionError({
        error,
        summary: "Production render-ready generation failed.",
        stageId: "render-ready",
        scope: "render-ready",
        meaningId: null,
        commandId: "production-render-ready",
        inputFingerprint: loaded.run.requirementsFingerprint,
      });
      await appendProductionRunEvent({
        rootDir,
        runId,
        lock,
        event: createProductionStageEvent({
          type: "stage-failed",
          runId: loaded.run.runId,
          storyId: loaded.run.storyId,
          sequence: loaded.state.lastSequence + 1,
          eventId: `render-ready-failed-${loaded.state.lastSequence + 1}`,
          stageId: "render-ready",
          attempt: 1,
          occurredAt: clock().toISOString(),
          commandId: "production-render-ready",
          previousStateFingerprint: loaded.state.stateFingerprint,
          inputFingerprints: [
            {
              artifactId: "requirements",
              fingerprint: loaded.run.requirementsFingerprint,
            },
          ],
          error: failure,
        }),
      });
    }
    throw error;
  } finally {
    await lock.release();
  }
};

export const checkProductionRenderReady = async ({
  rootDir,
  runId,
  dependencies = createDefaultRenderReadyDependencies(),
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly dependencies?: RenderReadyDependencies;
}) => {
  const loaded = await readProductionRunStore({ rootDir, runId });
  if (loaded.state.state !== "render-ready") {
    throw new Error("Production Run is not render-ready.");
  }
  const common = {
    rootDir,
    runId,
    storyId: loaded.run.storyId,
    requirementsFingerprint: loaded.run.requirementsFingerprint,
  } as const;
  await dependencies.assertCurrentFreeze(common);
  const plan = await dependencies.prepareRenderPlan({ ...common, mode: "check" });
  const registry = await dependencies.projectRegistry({ ...common, mode: "check" });
  await dependencies.compileProjectComposition(common);
  const ready = await dependencies.writeOrCheckRenderReady({
    ...common,
    mode: "check",
    plan,
  });
  const current = assertReadyBindings({ common, plan, ready, registry });
  const planArtifact = loaded.state.outputArtifacts.find(
    ({ artifactId }) => artifactId === "production-render-plan",
  );
  const readyArtifact = loaded.state.outputArtifacts.find(
    ({ artifactId }) => artifactId === "production-render-ready",
  );
  if (
    planArtifact?.fingerprint !== current.plan.renderPlanFingerprint ||
    readyArtifact?.fingerprint !== current.ready.renderReadyFingerprint
  ) {
    throw new Error("Production render-ready Run artifact binding is stale.");
  }
  return resultFor({ runId, ready: current.ready, noOp: true });
};
