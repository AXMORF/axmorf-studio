import { pathToFileURL } from "node:url";

import {
  MeaningIdSchema,
  ProductionRunIdSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "../../src/contracts";
import { redactProductionErrorDescription } from "./adapters/error-redaction";
import { readProductionRunStore } from "./adapters/run-store";
import {
  runProductionNarrative,
  runProductionGlobalVisualFail,
  runProductionGlobalVisualCheck,
  runProductionGlobalVisualSubmit,
  checkProductionRenderReady,
  runProductionPreflight,
  runProductionSceneFail,
  runProductionSceneFreeze,
  runProductionSceneCheck,
  runProductionSceneSubmit,
  runProductionStart,
  runProductionWatch,
} from "./application";

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
  sceneSubmit?: (request: {
    readonly rootDir: string;
    readonly runId: string;
    readonly meaningId: string;
  }) => Promise<unknown>;
  sceneCheck?: (request: {
    readonly rootDir: string;
    readonly runId: string;
    readonly meaningId: string;
  }) => Promise<unknown>;
  sceneFail?: (request: {
    readonly rootDir: string;
    readonly runId: string;
    readonly meaningId: string;
    readonly code: string;
    readonly description: string;
  }) => Promise<unknown>;
  globalVisualCheck?: (request: {
    readonly rootDir: string;
    readonly runId: string;
  }) => Promise<unknown>;
  globalVisualSubmit?: (request: {
    readonly rootDir: string;
    readonly runId: string;
  }) => Promise<unknown>;
  globalVisualFail?: (request: {
    readonly rootDir: string;
    readonly runId: string;
    readonly code: string;
    readonly description: string;
  }) => Promise<unknown>;
  watch?: (request: {
    readonly rootDir: string;
    readonly runId: string;
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
  return {
    runId: loaded.run.runId,
    status: loaded.state.state,
    statePath: `.producer-runs/${loaded.run.runId}/state.generated.json`,
    requirementsFingerprint: loaded.run.requirementsFingerprint,
    lastSequence: loaded.state.lastSequence,
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
    args.length === 3 &&
    args[0] === "global-visual-submit" &&
    args[1] === "--run"
  ) {
    const runId = ProductionRunIdSchema.parse(args[2]);
    result = context.globalVisualSubmit
      ? await context.globalVisualSubmit({ rootDir: context.rootDir, runId })
      : await runProductionGlobalVisualSubmit({
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
    args.length === 5 &&
    args[0] === "scene-submit" &&
    args[1] === "--run" &&
    args[3] === "--scene"
  ) {
    const runId = ProductionRunIdSchema.parse(args[2]);
    const meaningId = MeaningIdSchema.parse(args[4]);
    result = context.sceneSubmit
      ? await context.sceneSubmit({
          rootDir: context.rootDir,
          runId,
          meaningId,
        })
      : await runProductionSceneSubmit({
          rootDir: context.rootDir,
          runId,
          meaningId,
        });
  } else if (args.length === 3 && args[0] === "watch" && args[1] === "--run") {
    const runId = ProductionRunIdSchema.parse(args[2]);
    result = context.watch
      ? await context.watch({ rootDir: context.rootDir, runId })
      : await runProductionWatch({ rootDir: context.rootDir, runId });
  } else if (
    args.length === 3 &&
    args[0] === "render-ready-check" &&
    args[1] === "--run"
  ) {
    const runId = ProductionRunIdSchema.parse(args[2]);
    result = context.renderReadyCheck
      ? await context.renderReadyCheck({ rootDir: context.rootDir, runId })
      : await checkProductionRenderReady({ rootDir: context.rootDir, runId });
  } else if (
    args.length === 7 &&
    args[0] === "global-visual-fail" &&
    args[1] === "--run" &&
    args[3] === "--code" &&
    args[5] === "--description"
  ) {
    const runId = ProductionRunIdSchema.parse(args[2]);
    const code = args[4];
    const description = args[6];
    result = context.globalVisualFail
      ? await context.globalVisualFail({
          rootDir: context.rootDir,
          runId,
          code,
          description,
        })
      : await runProductionGlobalVisualFail({
          rootDir: context.rootDir,
          runId,
          code,
          description,
        });
  } else if (
    args.length === 9 &&
    args[0] === "scene-fail" &&
    args[1] === "--run" &&
    args[3] === "--scene" &&
    args[5] === "--code" &&
    args[7] === "--description"
  ) {
    const runId = ProductionRunIdSchema.parse(args[2]);
    const meaningId = MeaningIdSchema.parse(args[4]);
    const code = args[6];
    const description = args[8];
    result = context.sceneFail
      ? await context.sceneFail({
          rootDir: context.rootDir,
          runId,
          meaningId,
          code,
          description,
        })
      : await runProductionSceneFail({
          rootDir: context.rootDir,
          runId,
          meaningId,
          code,
          description,
        });
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
