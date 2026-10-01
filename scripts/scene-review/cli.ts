import { pathToFileURL } from "node:url";

import { StoryIdSchema } from "@axmorf/studio/contracts";
import { reportCliFailure } from "../../packages/studio/src/cli/failure";
import { generateSceneReview } from "./generate";

export const parseSceneReviewArguments = (args: readonly string[]) => {
  if (
    (args.length !== 2 && !(args.length === 3 && args[2] === "--motion")) ||
    args[0] !== "--project" ||
    args[1] === undefined
  ) {
    throw new Error("Expected --project <storyId> [--motion].");
  }
  return {
    projectId: StoryIdSchema.parse(args[1]),
    motion: args[2] === "--motion",
  };
};

export const runSceneReviewCli = async (
  args: readonly string[],
  context: Readonly<{ rootDir: string; stdout: (line: string) => void }> = {
    rootDir: process.cwd(),
    stdout: (line) => process.stdout.write(`${line}\n`),
  },
) => {
  const { projectId, motion } = parseSceneReviewArguments(args);
  const result = await generateSceneReview({
    rootDir: context.rootDir,
    projectId,
    motion,
  });
  context.stdout(JSON.stringify(result));
  return result;
};

// esbuild gives bundled source modules the package main URL too. Only the source
// script owns this auto-run; the npm router explicitly calls runSceneReviewCli.
export const isSceneReviewScriptEntrypoint = (
  moduleUrl: string,
  argvPath: string | undefined,
) =>
  argvPath !== undefined &&
  moduleUrl.endsWith("/scripts/scene-review/cli.ts") &&
  moduleUrl === pathToFileURL(argvPath).href;

if (isSceneReviewScriptEntrypoint(import.meta.url, process.argv[1])) {
  runSceneReviewCli(process.argv.slice(2)).catch((error: unknown) => {
    const report = reportCliFailure(error);
    process.stderr.write(`${report.serialized}\n`);
    process.exitCode = report.exitCode;
  });
}
