import { pathToFileURL } from "node:url";

import { reportCliFailure } from "../../packages/studio/src/cli/failure";
import { analyzeReferenceVideo } from "./analyze";
import {
  validateReferenceInputPath,
  validateReferenceThreshold,
} from "./domain";

export const parseReferenceAnalysisArguments = (args: readonly string[]) => {
  if (
    (args.length !== 2 && args.length !== 4) ||
    args[0] !== "--input" ||
    args[1] === undefined ||
    (args.length === 4 && args[2] !== "--threshold")
  )
    throw new Error(
      "Expected --input <public-relative-video> [--threshold <0..1>].",
    );
  const rawThreshold = args[3];
  if (
    rawThreshold !== undefined &&
    !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu.test(rawThreshold)
  )
    throw new Error(
      "Reference detection threshold must be a decimal between 0 and 1.",
    );
  return {
    inputPath: validateReferenceInputPath(args[1]),
    threshold: validateReferenceThreshold(
      rawThreshold === undefined ? 0.3 : Number(rawThreshold),
    ),
  };
};

export const runReferenceAnalysisCli = async (
  args: readonly string[],
  context: Readonly<{
    rootDir: string;
    stdout: (line: string) => void;
    analyzeVideo?: typeof analyzeReferenceVideo;
  }> = {
    rootDir: process.cwd(),
    stdout: (line) => process.stdout.write(`${line}\n`),
  },
) => {
  const options = parseReferenceAnalysisArguments(args);
  const result = await (context.analyzeVideo ?? analyzeReferenceVideo)({
    rootDir: context.rootDir,
    ...options,
  });
  context.stdout(JSON.stringify(result));
  return result;
};

export const isReferenceAnalysisScriptEntrypoint = (
  moduleUrl: string,
  argvPath: string | undefined,
) =>
  argvPath !== undefined &&
  moduleUrl.endsWith("/scripts/reference-analysis/cli.ts") &&
  moduleUrl === pathToFileURL(argvPath).href;

if (isReferenceAnalysisScriptEntrypoint(import.meta.url, process.argv[1])) {
  runReferenceAnalysisCli(process.argv.slice(2)).catch((error: unknown) => {
    const report = reportCliFailure(error);
    process.stderr.write(`${report.serialized}\n`);
    process.exitCode = report.exitCode;
  });
}
