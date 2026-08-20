import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

import { createProject } from "./application/create-project";

const usage =
  "Expected --project <storyId> --input <repository-relative-json>.";

export const parseProjectCreateArguments = (args: readonly string[]) => {
  if (args.length !== 4 || args[0] !== "--project" || args[2] !== "--input") {
    throw new Error(usage);
  }
  const projectId = args[1];
  const inputPath = args[3];
  if (
    projectId === undefined ||
    inputPath === undefined ||
    isAbsolute(inputPath) ||
    inputPath.includes("\\") ||
    inputPath.includes("://") ||
    inputPath
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(usage);
  }
  return { projectId, inputPath } as const;
};

export const runProjectCreateCli = async (
  args: readonly string[],
  context: Readonly<{
    rootDir: string;
    env: Readonly<Record<string, string | undefined>>;
    stdout: (line: string) => void;
  }> = {
    rootDir: process.cwd(),
    env: process.env,
    stdout: (line) => process.stdout.write(`${line}\n`),
  },
) => {
  const parsed = parseProjectCreateArguments(args);
  const result = await createProject({
    rootDir: context.rootDir,
    projectId: parsed.projectId,
    inputPath: join(context.rootDir, parsed.inputPath),
    env: context.env,
  });
  context.stdout(JSON.stringify(result));
  return result;
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runProjectCreateCli(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Project creation failed."}\n`,
    );
    process.exitCode = 1;
  });
}
