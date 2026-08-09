import { pathToFileURL } from "node:url";

import {
  MeaningIdSchema,
  ProductionOwnerKindSchema,
  ProductionRunIdSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "../../src/contracts";
import { redactProductionErrorDescription } from "./adapters/error-redaction";
import { readProductionRunStore } from "./adapters/run-store";
import { readOwnerReceipt } from "./adapters/owner-inbox";
import { loadCurrentDeliveryCoverAssignment } from "../delivery/application/cover-inputs";
import {
  runProductionNarrative,
  runProductionGlobalVisualCheck,
  checkProductionRenderReady,
  runProductionPreflight,
  runProductionSceneFreeze,
  runProductionSceneCheck,
  runProductionStart,
  runProductionWatch,
  startProductionWatcher,
  publishProductionOwnerReceipt,
} from "./application";
import { resolveCurrentSceneAssignments } from "./application/scene-freeze";

type ProductionCliContext = Readonly<{
  rootDir: string;
  stdout: (line: string) => void;
  preflight?: (request: {
    readonly rootDir: string;
    readonly projectId: string;
  }) => Promise<unknown>;
  start?: (request: {
    readonly rootDir: string;
    readonly projectId: string;
  }) => Promise<unknown>;
  status?: (request: {
    readonly rootDir: string;
    readonly runId: string;
  }) => Promise<unknown>;
  narrative?: (request: {
    readonly rootDir: string;
    readonly runId: string;
    readonly supersedeFingerprint?: string;
  }) => Promise<unknown>;
  sceneFreeze?: (request: {
    readonly rootDir: string;
    readonly runId: string;
  }) => Promise<unknown>;
  sceneCheck?: (request: {
    readonly rootDir: string;
    readonly runId: string;
    readonly meaningId: string;
  }) => Promise<unknown>;
  globalVisualCheck?: (request: {
    readonly rootDir: string;
    readonly runId: string;
  }) => Promise<unknown>;
  watch?: (request: {
    readonly rootDir: string;
    readonly runId: string;
  }) => Promise<unknown>;
  watchStart?: (request: {
    readonly rootDir: string;
    readonly runId: string;
  }) => Promise<unknown>;
  ownerReceipt?: (request: {
    readonly rootDir: string;
    readonly runId: string;
    readonly ownerKind: "scene" | "global-visual" | "cover";
    readonly meaningId: string | null;
    readonly status: "owner-ready" | "owner-failed";
    readonly code?: string;
    readonly description?: string;
  }) => Promise<unknown>;
  renderReadyCheck?: (request: {
    readonly rootDir: string;
    readonly runId: string;
  }) => Promise<unknown>;
}>;

const defaultContext = (): ProductionCliContext => ({
  rootDir: process.cwd(),
  stdout: (line) => process.stdout.write(`${line}\n`),
});

const runStatus = async ({
  rootDir,
  runId,
}: {
  readonly rootDir: string;
  readonly runId: string;
}) => {
  const loaded = await readProductionRunStore({ rootDir, runId });
  const missingOwnerAssignments: Array<{
    ownerKind: "scene" | "global-visual" | "cover";
    meaningId: string | null;
    assignmentFingerprint: string;
  }> = [];
  if (
    new Set([
      "scene-inputs-frozen",
      "waiting-for-owner-results",
      "render-ready-running",
      "render-ready",
    ]).has(loaded.state.state)
  ) {
    const [resolved, cover] = await Promise.all([
      resolveCurrentSceneAssignments({ rootDir, runId }),
      loadCurrentDeliveryCoverAssignment({ rootDir, projectId: loaded.run.storyId }),
    ]);
    const identities = [
      ...resolved.assignments.map((assignment) => ({
        ownerKind: "scene" as const,
        meaningId: assignment.meaningId,
        assignmentFingerprint: assignment.assignmentFingerprint,
      })),
      ...(resolved.globalVisualAssignment === null
        ? []
        : [{
            ownerKind: "global-visual" as const,
            meaningId: null,
            assignmentFingerprint:
              resolved.globalVisualAssignment.assignmentFingerprint,
          }]),
      {
        ownerKind: "cover" as const,
        meaningId: null,
        assignmentFingerprint: cover.assignment.assignmentFingerprint,
      },
    ];
    for (const identity of identities) {
      if (await readOwnerReceipt({ rootDir, runId, ...identity }) === null) {
        missingOwnerAssignments.push(identity);
      }
    }
  }
  return {
    runId: loaded.run.runId,
    status: loaded.state.state,
    statePath: `.producer-runs/${loaded.run.runId}/state.generated.json`,
    requirementsFingerprint: loaded.run.requirementsFingerprint,
    lastSequence: loaded.state.lastSequence,
    missingOwnerAssignments,
  } as const;
};

export const runProductionCli = async (
  args: readonly string[],
  context: ProductionCliContext = defaultContext(),
) => {
  let result: unknown;
  if (args.length === 3 && args[0] === "preflight" && args[1] === "--project") {
    const projectId = StoryIdSchema.parse(args[2]);
    result = context.preflight
      ? await context.preflight({ rootDir: context.rootDir, projectId })
      : await runProductionPreflight({ rootDir: context.rootDir, projectId });
    if (
      result !== null &&
      typeof result === "object" &&
      (result as { status?: unknown }).status === "failed"
    ) {
      throw new Error(JSON.stringify(result));
    }
  } else if (
    args.length === 3 &&
    args[0] === "start" &&
    args[1] === "--project"
  ) {
    const projectId = StoryIdSchema.parse(args[2]);
    result = context.start
      ? await context.start({ rootDir: context.rootDir, projectId })
      : await runProductionStart({ rootDir: context.rootDir, projectId });
  } else if (args.length === 3 && args[0] === "status" && args[1] === "--run") {
    const runId = ProductionRunIdSchema.parse(args[2]);
    result = context.status
      ? await context.status({ rootDir: context.rootDir, runId })
      : await runStatus({ rootDir: context.rootDir, runId });
  } else if (
    (args.length === 3 || args.length === 5) &&
    args[0] === "narrative" &&
    args[1] === "--run" &&
    (args.length === 3 || args[3] === "--supersede")
  ) {
    const runId = ProductionRunIdSchema.parse(args[2]);
    const supersedeFingerprint =
      args.length === 5 ? Sha256DigestSchema.parse(args[4]) : undefined;
    const request = {
      rootDir: context.rootDir,
      runId,
      ...(supersedeFingerprint === undefined
        ? {}
        : { supersedeFingerprint }),
    } as const;
    result = context.narrative
      ? await context.narrative(request)
      : await runProductionNarrative(request);
  } else if (
    args.length === 3 &&
    args[0] === "scene-freeze" &&
    args[1] === "--run"
  ) {
    const runId = ProductionRunIdSchema.parse(args[2]);
    result = context.sceneFreeze
      ? await context.sceneFreeze({ rootDir: context.rootDir, runId })
      : await runProductionSceneFreeze({ rootDir: context.rootDir, runId });
  } else if (
    args.length === 3 &&
    args[0] === "global-visual-check" &&
    args[1] === "--run"
  ) {
    const runId = ProductionRunIdSchema.parse(args[2]);
    result = context.globalVisualCheck
      ? await context.globalVisualCheck({ rootDir: context.rootDir, runId })
      : await runProductionGlobalVisualCheck({
          rootDir: context.rootDir,
          runId,
        });
  } else if (
    args.length === 5 &&
    args[0] === "scene-check" &&
    args[1] === "--run" &&
    args[3] === "--scene"
  ) {
    const runId = ProductionRunIdSchema.parse(args[2]);
    const meaningId = MeaningIdSchema.parse(args[4]);
    result = context.sceneCheck
      ? await context.sceneCheck({
          rootDir: context.rootDir,
          runId,
          meaningId,
        })
      : await runProductionSceneCheck({
          rootDir: context.rootDir,
          runId,
          meaningId,
        });
  } else if (
    args.length === 3 &&
    args[0] === "watch-start" &&
    args[1] === "--run"
  ) {
    const runId = ProductionRunIdSchema.parse(args[2]);
    result = context.watchStart
      ? await context.watchStart({ rootDir: context.rootDir, runId })
      : await startProductionWatcher({ rootDir: context.rootDir, runId });
  } else if (
    args.length === 3 &&
    args[0] === "watch-worker" &&
    args[1] === "--run"
  ) {
    const runId = ProductionRunIdSchema.parse(args[2]);
    result = context.watch
      ? await context.watch({ rootDir: context.rootDir, runId })
      : await runProductionWatch({ rootDir: context.rootDir, runId });
  } else if (
    (args[0] === "owner-ready" || args[0] === "owner-failed") &&
    args[1] === "--run" &&
    args[3] === "--owner"
  ) {
    const status = args[0];
    const runId = ProductionRunIdSchema.parse(args[2]);
    const ownerKind = ProductionOwnerKindSchema.parse(args[4]);
    const isScene = ownerKind === "scene";
    const readyLength = isScene ? 7 : 5;
    const failedLength = isScene ? 11 : 9;
    if (
      args.length !== (status === "owner-ready" ? readyLength : failedLength) ||
      (isScene && args[5] !== "--scene") ||
      (status === "owner-failed" &&
        (args[isScene ? 7 : 5] !== "--code" ||
          args[isScene ? 9 : 7] !== "--description"))
    ) {
      throw new Error("Expected an exact documented owner receipt command form.");
    }
    const meaningId = isScene ? MeaningIdSchema.parse(args[6]) : null;
    const request = {
      rootDir: context.rootDir,
      runId,
      ownerKind,
      meaningId,
      status,
      ...(status === "owner-failed"
        ? {
            code: args[isScene ? 8 : 6],
            description: args[isScene ? 10 : 8],
          }
        : {}),
    } as const;
    result = context.ownerReceipt
      ? await context.ownerReceipt(request)
      : await publishProductionOwnerReceipt(request);
  } else if (
    args.length === 3 &&
    args[0] === "render-ready-check" &&
    args[1] === "--run"
  ) {
    const runId = ProductionRunIdSchema.parse(args[2]);
    result = context.renderReadyCheck
      ? await context.renderReadyCheck({ rootDir: context.rootDir, runId })
      : await checkProductionRenderReady({ rootDir: context.rootDir, runId });
  } else {
    throw new Error("Expected an exact documented production command form.");
  }
  context.stdout(JSON.stringify(result));
  return result;
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runProductionCli(process.argv.slice(2)).catch((error: unknown) => {
    const safe = redactProductionErrorDescription({
      error,
      fallback: "Production command failed.",
    });
    process.stderr.write(`${safe.description}\n`);
    process.exitCode = 1;
  });
}
