import { pathToFileURL } from "node:url";

import { StoryIdSchema } from "../../src/contracts";
import { buildProject } from "./application/build";

type BuildRequest = Readonly<{ projectId: string }>;

export type ProjectBuildCliContext = Readonly<{
  rootDir: string;
  stdout: (line: string) => void;
  build?: (request: BuildRequest) => Promise<unknown>;
}>;

const defaultContext = (): ProjectBuildCliContext => ({
  rootDir: process.cwd(),
  stdout: (line) => process.stdout.write(`${line}\n`),
});

export const runProjectBuildCli = async (
  args: readonly string[],
  context: ProjectBuildCliContext = defaultContext(),
) => {
  if (args.length !== 2 || args[0] !== "--project") {
    throw new Error("Expected project:build -- --project <storyId>.");
  }
  const projectId = StoryIdSchema.parse(args[1]);
  const result = context.build
    ? await context.build({ projectId })
    : await buildProject({ rootDir: context.rootDir, projectId });
  context.stdout(JSON.stringify(result));
  return result;
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runProjectBuildCli(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Project build failed."}\n`,
    );
    process.exitCode = 1;
  });
}
