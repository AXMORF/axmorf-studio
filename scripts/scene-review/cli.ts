import { pathToFileURL } from "node:url";

import { StoryIdSchema } from "@axmorf/studio/contracts";
import { reportCliFailure } from "../../packages/studio/src/cli/failure";
import { generateSceneReview } from "./generate";

export const parseSceneReviewArguments = (args: readonly string[]) => {
  if (args.length !== 2 || args[0] !== "--project" || args[1] === undefined) {
    throw new Error("Expected --project <storyId>.");
  }
  return { projectId: StoryIdSchema.parse(args[1]) };
};

export const runSceneReviewCli = async (
  args: readonly string[],
  context: Readonly<{ rootDir: string; stdout: (line: string) => void }> = {
    rootDir: process.cwd(),
    stdout: (line) => process.stdout.write(`${line}\n`),
  },
) => {
  const { projectId } = parseSceneReviewArguments(args);
  const result = await generateSceneReview({
    rootDir: context.rootDir,
    projectId,
  });
  context.stdout(JSON.stringify(result));
  return result;
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runSceneReviewCli(process.argv.slice(2)).catch((error: unknown) => {
    const report = reportCliFailure(error);
    process.stderr.write(`${report.serialized}\n`);
    process.exitCode = report.exitCode;
  });
}
