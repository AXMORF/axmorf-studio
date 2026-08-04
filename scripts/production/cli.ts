import { pathToFileURL } from "node:url";

import { ProductionRunIdSchema, StoryIdSchema } from "../../src/contracts";
import { redactProductionErrorDescription } from "./adapters/error-redaction";
import { readProductionRunStore } from "./adapters/run-store";
import { runProductionStart } from "./start";
import { runProductionNarrative } from "./narrative";

type ProductionCliContext = Readonly<{
  rootDir: string;
  stdout: (line: string) => void;
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
  if (args.length !== 3) {
    throw new Error(
      "Expected start --project <storyId>, status --run <runId>, or narrative --run <runId>.",
    );
  }
  let result: unknown;
  if (args[0] === "start" && args[1] === "--project") {
    const projectId = StoryIdSchema.parse(args[2]);
    result = context.start
      ? await context.start({ rootDir: context.rootDir, projectId })
      : await runProductionStart({ rootDir: context.rootDir, projectId });
  } else if (args[0] === "status" && args[1] === "--run") {
    const runId = ProductionRunIdSchema.parse(args[2]);
    result = context.status
      ? await context.status({ rootDir: context.rootDir, runId })
      : await runStatus({ rootDir: context.rootDir, runId });
  } else if (args[0] === "narrative" && args[1] === "--run") {
    const runId = ProductionRunIdSchema.parse(args[2]);
    result = context.narrative
      ? await context.narrative({ rootDir: context.rootDir, runId })
      : await runProductionNarrative({ rootDir: context.rootDir, runId });
  } else {
    throw new Error(
      "Expected start --project <storyId>, status --run <runId>, or narrative --run <runId>.",
    );
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
