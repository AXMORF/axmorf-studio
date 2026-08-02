import { pathToFileURL } from "node:url";

import { StoryIdSchema } from "../../src/contracts";
import type { ProcessRunner } from "../baseline/evidence";
import { discoverProjectEntries } from "../registry/project-files";
import {
  checkPersistedNarrativeAutoCheck,
  writeNarrativeAutoCheckIfPassed,
} from "./report-files";
import { runNarrativeAutoCheck } from "./run";

export type ProjectCheckCliContext = {
  readonly rootDir: string;
  readonly runM3EvidenceProcess?: ProcessRunner;
  readonly stdout: (line: string) => void;
};

const defaultContext = (): ProjectCheckCliContext => ({
  rootDir: process.cwd(),
  stdout: (line) => process.stdout.write(`${line}\n`),
});

const parseArgs = (args: readonly string[]) => {
  const isDefault =
    args.length === 4 &&
    args[0] === "--project" &&
    args[2] === "--level";
  const isWrite =
    args.length === 5 &&
    args[0] === "--project" &&
    args[2] === "--level" &&
    args[4] === "--write-auto-check";
  if (!isDefault && !isWrite) {
    throw new Error(
      "Expected exactly --project <slug> --level narrative [--write-auto-check].",
    );
  }
  if (args[3] !== "narrative") {
    throw new Error("Only the narrative project check level is supported.");
  }
  let storyId;
  try {
    storyId = StoryIdSchema.parse(args[1]);
  } catch {
    throw new Error("Invalid project slug.");
  }
  return { storyId, write: isWrite } as const;
};

export const runProjectCheckCli = async (
  args: readonly string[],
  context: ProjectCheckCliContext = defaultContext(),
) => {
  const parsed = parseArgs(args);
  const expectedCompositionPath =
    `src/projects/${parsed.storyId}/Composition.tsx`;
  let discovered: readonly string[];
  try {
    discovered = await discoverProjectEntries(context.rootDir);
  } catch {
    throw new Error("Project discovery failed.");
  }
  if (!discovered.includes(expectedCompositionPath)) {
    throw new Error(`Unknown project: ${parsed.storyId}.`);
  }
  const report = await runNarrativeAutoCheck({
    rootDir: context.rootDir,
    projectId: parsed.storyId,
    runM3EvidenceProcess: context.runM3EvidenceProcess,
  });
  if (report.aggregateStatus !== "pass") {
    throw new Error("Narrative project check failed.");
  }
  if (parsed.write) {
    await writeNarrativeAutoCheckIfPassed({
      rootDir: context.rootDir,
      report,
    });
  } else {
    await checkPersistedNarrativeAutoCheck({
      rootDir: context.rootDir,
      expectedReport: report,
    });
  }
  context.stdout(
    JSON.stringify({
      storyId: report.storyId,
      level: report.level,
      aggregateStatus: report.aggregateStatus,
      reportFingerprint: report.reportFingerprint,
    }),
  );
  return report;
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runProjectCheckCli(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Project check failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
