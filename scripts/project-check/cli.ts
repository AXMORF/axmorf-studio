import { pathToFileURL } from "node:url";

import { StoryIdSchema } from "../../src/contracts";
import type { ProcessRunner } from "../baseline/evidence";
import { discoverProjectEntries } from "../registry/project-files";
import {
  checkPersistedNarrativeAutoCheck,
  writeNarrativeAutoCheckIfPassed,
} from "./report-files";
import {
  checkPersistedFinalMechanicalCheck,
  writeFinalMechanicalCheckIfPassed,
} from "./final-report-files";
import { checkFinalSourceHealth, runFinalMechanicalCheck } from "./final-run";
import { checkNarrativeSourceHealth, runNarrativeAutoCheck } from "./run";

export type ProjectCheckCliContext = {
  readonly rootDir: string;
  readonly runM3EvidenceProcess?: ProcessRunner;
  readonly stdout: (line: string) => void;
};

const defaultContext = (): ProjectCheckCliContext => ({
  rootDir: process.cwd(),
  stdout: (line) => process.stdout.write(`${line}\n`),
});

export const parseProjectCheckArgs = (args: readonly string[]) => {
  const isSource =
    args.length === 6 &&
    args[0] === "--project" &&
    args[2] === "--level" &&
    args[4] === "--scope" &&
    args[5] === "source";
  const isDefault =
    args.length === 4 && args[0] === "--project" && args[2] === "--level";
  const isNarrativeWrite =
    args.length === 5 &&
    args[0] === "--project" &&
    args[2] === "--level" &&
    args[4] === "--write-auto-check";
  const isFinalWrite =
    args.length === 5 &&
    args[0] === "--project" &&
    args[2] === "--level" &&
    args[3] === "final" &&
    args[4] === "--write-final-check";
  if (!isDefault && !isNarrativeWrite && !isFinalWrite && !isSource) {
    throw new Error(
      "Expected an exact narrative or final project check command.",
    );
  }
  const level = args[3];
  if (level !== "narrative" && level !== "final") {
    throw new Error(
      "Only narrative and final project check levels are supported.",
    );
  }
  if (
    (level === "narrative" && isFinalWrite) ||
    (level === "final" && isNarrativeWrite)
  ) {
    throw new Error("Project check writer does not match its level.");
  }
  let storyId;
  try {
    storyId = StoryIdSchema.parse(args[1]);
  } catch {
    throw new Error("Invalid project slug.");
  }
  return {
    storyId,
    level,
    write: isNarrativeWrite || isFinalWrite,
    ...(isSource ? { sourceOnly: true as const } : {}),
  } as const;
};

export const runProjectCheckCli = async (
  args: readonly string[],
  context: ProjectCheckCliContext = defaultContext(),
) => {
  const parsed = parseProjectCheckArgs(args);
  const expectedCompositionPath = `src/projects/${parsed.storyId}/Composition.tsx`;
  let discovered: readonly string[];
  try {
    discovered = await discoverProjectEntries(context.rootDir);
  } catch {
    throw new Error("Project discovery failed.");
  }
  if (!discovered.includes(expectedCompositionPath)) {
    throw new Error(`Unknown project: ${parsed.storyId}.`);
  }
  if (parsed.sourceOnly === true) {
    const source =
      parsed.level === "narrative"
        ? await checkNarrativeSourceHealth({
            rootDir: context.rootDir,
            projectId: parsed.storyId,
          })
        : await checkFinalSourceHealth({
            rootDir: context.rootDir,
            projectId: parsed.storyId,
          });
    context.stdout(
      JSON.stringify({
        storyId: source.storyId,
        level: parsed.level,
        scope: "source",
        aggregateStatus: source.aggregateStatus,
      }),
    );
    return source;
  }
  const report =
    parsed.level === "narrative"
      ? await runNarrativeAutoCheck({
          rootDir: context.rootDir,
          projectId: parsed.storyId,
          runM3EvidenceProcess: context.runM3EvidenceProcess,
        })
      : await runFinalMechanicalCheck({
          rootDir: context.rootDir,
          projectId: parsed.storyId,
          runM3EvidenceProcess: context.runM3EvidenceProcess,
        });
  if (report.aggregateStatus !== "pass") {
    throw new Error(
      parsed.level === "narrative"
        ? "Narrative project check failed."
        : "Final project check failed.",
    );
  }
  if (parsed.level === "narrative" && parsed.write) {
    await writeNarrativeAutoCheckIfPassed({
      rootDir: context.rootDir,
      report,
    });
  } else if (parsed.level === "narrative") {
    await checkPersistedNarrativeAutoCheck({
      rootDir: context.rootDir,
      expectedReport: report,
    });
  } else if (parsed.write) {
    await writeFinalMechanicalCheckIfPassed({
      rootDir: context.rootDir,
      report,
    });
  } else {
    await checkPersistedFinalMechanicalCheck({
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
    const message =
      error instanceof Error ? error.message : "Project check failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
