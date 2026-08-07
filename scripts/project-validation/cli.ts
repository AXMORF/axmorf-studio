import { pathToFileURL } from "node:url";

import { runProjectVerificationStep } from "./adapters";
import {
  loadProjectVerificationProfiles,
  parseProjectValidationArgs,
  resolveProfileSteps,
} from "./profiles";

export const runProjectValidationCli = async ({
  rootDir,
  args,
  stdout = (value: string) => process.stdout.write(value),
}: {
  readonly rootDir: string;
  readonly args: readonly string[];
  readonly stdout?: (value: string) => void;
}) => {
  const parsed = parseProjectValidationArgs(args);
  const manifest = await loadProjectVerificationProfiles(rootDir);
  const projects =
    parsed.target === "all"
      ? manifest.projects.map(({ projectId }) => projectId)
      : [parsed.target];
  const completed = [];
  for (const projectId of projects) {
    const steps = resolveProfileSteps(manifest, projectId, parsed.scope);
    if (steps.length === 0) {
      throw new Error(
        `Formal project profile has no ${parsed.scope} verification steps: ${projectId}.`,
      );
    }
    for (const step of steps) {
      const result = await runProjectVerificationStep({
        rootDir,
        projectId,
        step,
      });
      if (result.stdout.length > 0) stdout(result.stdout);
      if (result.stderr.length > 0) process.stderr.write(result.stderr);
      completed.push({ projectId, step });
    }
  }
  stdout(
    `${JSON.stringify({ profileVersion: manifest.profileVersion, completed })}\n`,
  );
  return completed;
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runProjectValidationCli({
    rootDir: process.cwd(),
    args: process.argv.slice(2),
  }).catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Project verification failed."}\n`,
    );
    process.exitCode = 1;
  });
}
