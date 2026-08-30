import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

import { StoryIdSchema } from "@axmorf/studio/contracts";
import { reportCliFailure } from "../../packages/studio/src/cli/failure";
import {
  createProjectRevisionCandidate,
  readProjectRevisionContext,
  readProjectRevisionInputFile,
  validateProjectRevisionAuthoring,
  type ProjectRevisionStateDependencies,
} from "./application/project-revision";
import { runProjectRevisionPromotionCli } from "./revision-promotion";

const contextUsage = "Expected --project <storyId>.";
const validateUsage = "Expected --input <repository-relative-json>.";
const createUsage =
  "Expected --project <storyId> --input <repository-relative-json>.";

const parseRepositoryRelativeInput = (value: string | undefined) => {
  if (
    value === undefined ||
    isAbsolute(value) ||
    value.includes("\\") ||
    value.includes("://") ||
    value
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(validateUsage);
  }
  return value;
};

export const parseProjectRevisionContextArguments = (
  args: readonly string[],
) => {
  if (args.length !== 2 || args[0] !== "--project" || args[1] === undefined) {
    throw new Error(contextUsage);
  }
  return { projectId: StoryIdSchema.parse(args[1]) } as const;
};

export const parseProjectRevisionValidateArguments = (
  args: readonly string[],
) => {
  if (args.length !== 2 || args[0] !== "--input") {
    throw new Error(validateUsage);
  }
  return { inputPath: parseRepositoryRelativeInput(args[1]) } as const;
};

export const parseProjectRevisionCreateArguments = (
  args: readonly string[],
) => {
  if (
    args.length !== 4 ||
    args[0] !== "--project" ||
    args[2] !== "--input" ||
    args[1] === undefined
  ) {
    throw new Error(createUsage);
  }
  return {
    projectId: StoryIdSchema.parse(args[1]),
    inputPath: parseRepositoryRelativeInput(args[3]),
  } as const;
};

export type ProjectRevisionCliContext = Readonly<{
  rootDir: string;
  env: Readonly<Record<string, string | undefined>>;
  stdout: (line: string) => void;
  dependencies?: ProjectRevisionStateDependencies;
}>;

const defaultContext = (): ProjectRevisionCliContext => ({
  rootDir: process.cwd(),
  env: process.env,
  stdout: (line) => process.stdout.write(`${line}\n`),
});

export const runProjectRevisionContextCli = async (
  args: readonly string[],
  context: ProjectRevisionCliContext = defaultContext(),
) => {
  const { projectId } = parseProjectRevisionContextArguments(args);
  const result = await readProjectRevisionContext({
    rootDir: context.rootDir,
    projectId,
    dependencies: context.dependencies,
  });
  context.stdout(JSON.stringify(result));
  return result;
};

export const runProjectRevisionValidateCli = async (
  args: readonly string[],
  context: ProjectRevisionCliContext = defaultContext(),
) => {
  const { inputPath } = parseProjectRevisionValidateArguments(args);
  const input = await readProjectRevisionInputFile({
    rootDir: context.rootDir,
    inputPath: join(context.rootDir, inputPath),
  });
  const result = await validateProjectRevisionAuthoring({
    rootDir: context.rootDir,
    input,
    dependencies: context.dependencies,
  });
  context.stdout(JSON.stringify(result));
  return result;
};

export const runProjectRevisionCreateCli = async (
  args: readonly string[],
  context: ProjectRevisionCliContext = defaultContext(),
) => {
  const { projectId, inputPath } = parseProjectRevisionCreateArguments(args);
  const input = await readProjectRevisionInputFile({
    rootDir: context.rootDir,
    inputPath: join(context.rootDir, inputPath),
  });
  const result = await createProjectRevisionCandidate({
    rootDir: context.rootDir,
    projectId,
    input,
    env: context.env,
    dependencies: context.dependencies,
  });
  context.stdout(JSON.stringify(result));
  return result;
};

export const runProjectRevisionCli = async (
  action: "context" | "validate" | "create" | "promote",
  args: readonly string[],
  context: ProjectRevisionCliContext = defaultContext(),
) => {
  if (action === "context") return runProjectRevisionContextCli(args, context);
  if (action === "validate") {
    return runProjectRevisionValidateCli(args, context);
  }
  if (action === "create") return runProjectRevisionCreateCli(args, context);
  if (action === "promote") {
    return runProjectRevisionPromotionCli({
      args,
      rootDir: context.rootDir,
      stdout: (line) => context.stdout(line.replace(/\n$/u, "")),
    });
  }
  action satisfies never;
  throw new Error("Unknown Project revision action.");
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [action, ...args] = process.argv.slice(2);
  if (
    action !== "context" &&
    action !== "validate" &&
    action !== "create" &&
    action !== "promote"
  ) {
    process.stderr.write("Expected context, validate, create, or promote.\n");
    process.exitCode = 1;
  } else {
    runProjectRevisionCli(action, args).catch((error: unknown) => {
      const report = reportCliFailure(error);
      process.stderr.write(`${report.serialized}\n`);
      process.exitCode = report.exitCode;
    });
  }
}
