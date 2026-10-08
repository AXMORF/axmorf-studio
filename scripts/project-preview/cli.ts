import { pathToFileURL } from "node:url";

import {
  ProjectRevisionCandidateIdSchema,
  StoryIdSchema,
} from "@axmorf/studio/contracts";
import { reportCliFailure } from "../../packages/studio/src/cli/failure";
import type { RuntimePolicyManifest } from "../../packages/studio/src/runtime/policy-manifest";
import { generateProjectPreview } from "./generate";

export const parseProjectPreviewArguments = (args: readonly string[]) => {
  if (
    (args.length !== 2 && args.length !== 4) ||
    args[0] !== "--project" ||
    args[1] === undefined ||
    (args.length === 4 && (args[2] !== "--candidate" || args[3] === undefined))
  ) {
    throw new Error(
      "Expected --project <storyId> [--candidate <candidateId>].",
    );
  }
  return {
    projectId: StoryIdSchema.parse(args[1]),
    ...(args.length === 4
      ? { candidateId: ProjectRevisionCandidateIdSchema.parse(args[3]) }
      : {}),
  };
};

export const runProjectPreviewCli = async (
  args: readonly string[],
  context: Readonly<{
    rootDir: string;
    stdout: (line: string) => void;
    runtimePolicyManifest?: RuntimePolicyManifest;
    generatePreview?: typeof generateProjectPreview;
  }> = {
    rootDir: process.cwd(),
    stdout: (line) => process.stdout.write(`${line}\n`),
  },
) => {
  const request = parseProjectPreviewArguments(args);
  const result = await (context.generatePreview ?? generateProjectPreview)({
    rootDir: context.rootDir,
    runtimePolicyManifest: context.runtimePolicyManifest,
    ...request,
  });
  context.stdout(JSON.stringify(result));
  return result;
};

export const isProjectPreviewScriptEntrypoint = (
  moduleUrl: string,
  argvPath: string | undefined,
) =>
  argvPath !== undefined &&
  moduleUrl.endsWith("/scripts/project-preview/cli.ts") &&
  moduleUrl === pathToFileURL(argvPath).href;

if (isProjectPreviewScriptEntrypoint(import.meta.url, process.argv[1])) {
  runProjectPreviewCli(process.argv.slice(2)).catch((error: unknown) => {
    const report = reportCliFailure(error);
    process.stderr.write(`${report.serialized}\n`);
    process.exitCode = report.exitCode;
  });
}
