import {
  createDeliveryBuildId,
  DELIVERY_BUILD_POLICY_VERSION,
  getStoryCompositionDurationInFrames,
  serializeCanonicalJson,
} from "../contracts";
import type { RuntimePolicyManifest } from "../runtime/policy-manifest";
import {
  parseProjectCheckArgs,
  runProjectCheckCli,
} from "../../../../scripts/project-check/cli";
import { buildCurrentProductionPlan } from "../../../../scripts/project-production/application/build-current-plan";
import { captureProductionInspectionSnapshot } from "../../../../scripts/project-production/adapters/production-inspection";
import { inspectCurrentDelivery } from "../../../../scripts/project-production/adapters/current-delivery-inspection";

type FullPlan = Awaited<ReturnType<typeof buildCurrentProductionPlan>>;
type CurrentPlan = Readonly<{
  inputs: Readonly<{
    render: Pick<
      FullPlan["inputs"]["render"],
      "compositionId" | "fps" | "width" | "height" | "output"
    >;
    timing: Pick<FullPlan["inputs"]["timing"], "durationInFrames">;
  }>;
  revision: Pick<FullPlan["revision"], "revisionId">;
  plan: Readonly<{
    artifactSetFingerprint: FullPlan["plan"]["artifactSetFingerprint"];
    tasks: readonly Pick<
      FullPlan["plan"]["tasks"][number],
      "action" | "taskRevision" | "artifactState"
    >[];
  }>;
}>;
type Dependencies = Readonly<{
  buildPlan?: (
    input: Parameters<typeof buildCurrentProductionPlan>[0],
  ) => Promise<CurrentPlan>;
  inspectDelivery?: typeof inspectCurrentDelivery;
  captureSnapshot?: typeof captureProductionInspectionSnapshot;
  runProofCheck?: (
    ...args: Parameters<typeof runProjectCheckCli>
  ) => Promise<unknown>;
}>;
type Check = Readonly<{
  checkId: string;
  status: "pass" | "fail";
  code: string | null;
  message: string | null;
}>;

export class PublicProjectCheckError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const runPublicProjectCheck = async (
  args: readonly string[],
  context: Readonly<{
    rootDir: string;
    stdout: (line: string) => void;
    env?: Readonly<Record<string, string | undefined>>;
    runtimePolicyManifest?: RuntimePolicyManifest;
  }>,
  dependencies: Dependencies = {},
) => {
  const parsed = parseProjectCheckArgs(args);
  if (parsed.level !== "final" || parsed.sourceOnly) {
    return (dependencies.runProofCheck ?? runProjectCheckCli)(args, context);
  }
  if (parsed.write) {
    throw new PublicProjectCheckError(
      "legacy-final-report-unsupported",
      `Workspace final validation is read-only and does not write legacy proof reports. Run npm run project:check -- --project ${parsed.storyId} --level final.`,
    );
  }
  const capture =
    dependencies.captureSnapshot ?? captureProductionInspectionSnapshot;
  const buildPlan = dependencies.buildPlan ?? buildCurrentProductionPlan;
  const readDelivery = dependencies.inspectDelivery ?? inspectCurrentDelivery;
  const input = { rootDir: context.rootDir, projectId: parsed.storyId };
  const checks: Check[] = [];
  let before: Awaited<ReturnType<typeof capture>> | undefined;
  let current: CurrentPlan | undefined;
  let delivery: Awaited<ReturnType<typeof readDelivery>> | undefined;
  const fail = (checkId: string, code: string, error: unknown) =>
    checks.push({
      checkId,
      status: "fail",
      code,
      message: error instanceof Error ? error.message : String(error),
    });
  const pass = (checkId: string) =>
    checks.push({ checkId, status: "pass", code: null, message: null });
  try {
    before = await capture(input);
  } catch (error) {
    fail("snapshot", "production-snapshot-invalid", error);
  }
  if (before !== undefined) {
    try {
      current = await buildPlan({
        ...input,
        ...(context.env === undefined ? {} : { env: context.env }),
        ...(context.runtimePolicyManifest === undefined
          ? {}
          : { runtimePolicyManifest: context.runtimePolicyManifest }),
      });
      const dirty = current.plan.tasks.filter(
        ({ action }) => action !== "reuse",
      );
      if (dirty.length > 0) {
        fail(
          "artifacts",
          "current-artifacts-unavailable",
          `Current production artifacts require work: ${dirty.map(({ taskRevision, action, artifactState }) => `${taskRevision}: ${action} (${artifactState})`).join("; ")}`,
        );
      } else pass("artifacts");
    } catch (error) {
      fail("production-plan", "production-plan-invalid", error);
    }
    try {
      delivery = await readDelivery({
        rootDir: context.rootDir,
        storyId: parsed.storyId,
      });
      if (delivery === null)
        fail(
          "delivery",
          "current-delivery-missing",
          "Current four-file delivery does not exist.",
        );
      else pass("delivery");
    } catch (error) {
      fail("delivery", "current-delivery-invalid", error);
    }
    if (current !== undefined && delivery != null) {
      if (delivery.revisionId !== current.revision.revisionId)
        fail(
          "revision",
          "delivery-revision-stale",
          "Current delivery belongs to a different ProductionRevision.",
        );
      else pass("revision");
      if (
        delivery.artifactSetFingerprint !== current.plan.artifactSetFingerprint
      )
        fail(
          "artifact-set",
          "delivery-artifact-set-stale",
          "Current delivery does not match the verified production artifact set.",
        );
      else pass("artifact-set");
      const render = current.inputs.render;
      const expectedBuildId = createDeliveryBuildId({
        storyId: parsed.storyId,
        revisionId: current.revision.revisionId,
        artifactSetFingerprint: current.plan.artifactSetFingerprint,
        compositionId: render.compositionId,
        fps: render.fps,
        frameCount: getStoryCompositionDurationInFrames(
          current.inputs.timing.durationInFrames,
        ),
        width: render.width,
        height: render.height,
        policyVersion: DELIVERY_BUILD_POLICY_VERSION,
      });
      if (delivery.deliveryBuildId !== expectedBuildId)
        fail(
          "delivery-build",
          "delivery-build-stale",
          "Current delivery does not match the current Composition, render dimensions, fps, and sealed timing duration.",
        );
      else pass("delivery-build");
      if (
        delivery.artifacts.video.media.audioChannels !==
        render.output.audioChannels
      )
        fail(
          "audio-channels",
          "delivery-audio-channels-stale",
          "Current delivery audio channels do not match current RenderSpec.output.audioChannels.",
        );
      else pass("audio-channels");
    }
    try {
      const after = await capture(input);
      if (serializeCanonicalJson(before) !== serializeCanonicalJson(after))
        fail(
          "snapshot",
          "production-changed-during-check",
          "Project inputs or production state changed during final validation; run the read-only check again after production stops.",
        );
      else pass("snapshot");
    } catch (error) {
      fail("snapshot", "production-snapshot-invalid", error);
    }
  }
  const report = {
    schemaVersion: 1,
    status: "project-final-check" as const,
    storyId: parsed.storyId,
    level: "final" as const,
    scope: "current-production" as const,
    aggregateStatus: checks.some(({ status }) => status === "fail")
      ? ("fail" as const)
      : ("pass" as const),
    revisionId: current?.revision.revisionId ?? null,
    artifactSetFingerprint: current?.plan.artifactSetFingerprint ?? null,
    deliveryBuildId: delivery?.deliveryBuildId ?? null,
    checks,
  };
  context.stdout(JSON.stringify(report));
  if (report.aggregateStatus !== "pass")
    throw new PublicProjectCheckError(
      "project-final-check-failed",
      checks
        .filter(({ status }) => status === "fail")
        .map(({ code, message }) => `${code}: ${message}`)
        .join("; "),
    );
  return report;
};
