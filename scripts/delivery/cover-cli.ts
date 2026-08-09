import { pathToFileURL } from "node:url";

import { StoryIdSchema } from "../../src/contracts";
import { runDeliveryCoverCheck } from "./application/cover-check";
import { runDeliveryCoverFreeze } from "./application/cover-freeze";

type CoverRequest = Readonly<{ projectId: string }>;

export type DeliveryCoverCliContext = Readonly<{
  rootDir: string;
  stdout: (line: string) => void;
  freeze?: (request: CoverRequest) => Promise<unknown>;
  check?: (request: CoverRequest) => Promise<unknown>;
}>;

const defaultContext = (): DeliveryCoverCliContext => ({
  rootDir: process.cwd(),
  stdout: (line) => process.stdout.write(`${line}\n`),
});

export const runDeliveryCoverCli = async (
  args: readonly string[],
  context: DeliveryCoverCliContext = defaultContext(),
) => {
  if (
    args.length !== 3 ||
    (args[0] !== "freeze" && args[0] !== "check") ||
    args[1] !== "--project"
  ) {
    throw new Error(
      "Expected delivery Cover freeze|check --project <storyId>.",
    );
  }
  const projectId = StoryIdSchema.parse(args[2]);
  const request = { projectId };
  const result =
    args[0] === "freeze"
      ? context.freeze
        ? await context.freeze(request)
        : await runDeliveryCoverFreeze({ rootDir: context.rootDir, projectId })
      : context.check
        ? await context.check(request)
        : await runDeliveryCoverCheck({ rootDir: context.rootDir, projectId });
  context.stdout(JSON.stringify(result));
  return result;
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runDeliveryCoverCli(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Delivery Cover failed."}\n`,
    );
    process.exitCode = 1;
  });
}
