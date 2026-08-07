import { pathToFileURL } from "node:url";

import { DeliveryReleaseIdSchema, StoryIdSchema } from "../../src/contracts";
import { buildDelivery } from "./application/build";
import { checkDelivery } from "./application/check";

type BuildRequest = Readonly<{ projectId: string }>;
type CheckRequest = Readonly<{ projectId: string; releaseId: string }>;

export type DeliveryCliContext = Readonly<{
  rootDir: string;
  stdout: (line: string) => void;
  build?: (request: BuildRequest) => Promise<unknown>;
  check?: (request: CheckRequest) => Promise<unknown>;
}>;

const defaultContext = (): DeliveryCliContext => ({
  rootDir: process.cwd(),
  stdout: (line) => process.stdout.write(`${line}\n`),
});

export const runDeliveryCli = async (
  args: readonly string[],
  context: DeliveryCliContext = defaultContext(),
) => {
  if (args.length === 3 && args[0] === "build" && args[1] === "--project") {
    const projectId = StoryIdSchema.parse(args[2]);
    const result = context.build
      ? await context.build({ projectId })
      : await buildDelivery({ rootDir: context.rootDir, projectId });
    context.stdout(JSON.stringify(result));
    return result;
  }
  if (
    args.length === 5 &&
    args[0] === "check" &&
    args[1] === "--project" &&
    args[3] === "--release"
  ) {
    const projectId = StoryIdSchema.parse(args[2]);
    const releaseId = DeliveryReleaseIdSchema.parse(args[4]);
    const result = context.check
      ? await context.check({ projectId, releaseId })
      : await checkDelivery({
          rootDir: context.rootDir,
          projectId,
          releaseId,
        });
    context.stdout(JSON.stringify(result));
    return result;
  }
  throw new Error(
    "Expected delivery build --project <id> or delivery check --project <id> --release <release-id>.",
  );
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runDeliveryCli(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Delivery failed."}\n`,
    );
    process.exitCode = 1;
  });
}
