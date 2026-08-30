import { pathToFileURL } from "node:url";

import { StoryIdSchema } from "@axmorf/studio/contracts";
import { reportCliFailure } from "../../packages/studio/src/cli/failure";
import { freezeProjectSceneOriginalityBaseline } from "./application/scene-originality";

const usage = "Expected --project <storyId>.";

export const parseProjectOriginalityArguments = (args: readonly string[]) => {
  if (args.length !== 2 || args[0] !== "--project" || args[1] === undefined) {
    throw new Error(usage);
  }
  return { projectId: StoryIdSchema.parse(args[1]) } as const;
};

export const runProjectOriginalityFreezeCli = async (
  args: readonly string[],
  context: Readonly<{
    rootDir: string;
    stdout: (line: string) => void;
  }> = {
    rootDir: process.cwd(),
    stdout: (line) => process.stdout.write(`${line}\n`),
  },
) => {
  const { projectId } = parseProjectOriginalityArguments(args);
  const result = await freezeProjectSceneOriginalityBaseline({
    rootDir: context.rootDir,
    subjectStoryId: projectId,
  });
  context.stdout(JSON.stringify(result));
  return result;
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runProjectOriginalityFreezeCli(process.argv.slice(2)).catch(
    (error: unknown) => {
      const report = reportCliFailure(error);
      process.stderr.write(`${report.serialized}\n`);
      process.exitCode = report.exitCode;
    },
  );
}
