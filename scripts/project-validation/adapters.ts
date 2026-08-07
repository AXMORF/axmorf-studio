import { access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

import type { ProjectVerificationStep } from "./profiles";

const execFileAsync = promisify(execFile);

type Invocation = Readonly<{
  script: string;
  args: readonly string[];
  withoutPrivateNarrationConfig?: boolean;
}>;

const commonInvocation = (
  projectId: string,
  step: ProjectVerificationStep,
): Invocation | null => {
  if (step === "narrative" || step === "final") {
    return {
      script: "scripts/project-check/cli.ts",
      args: ["--project", projectId, "--level", step],
      withoutPrivateNarrationConfig: step === "narrative",
    };
  }
  if (step === "final-assembly") {
    return {
      script: "scripts/final-assembly/cli.ts",
      args: ["--project", projectId, "--check"],
    };
  }
  return null;
};

export const resolveProjectVerificationInvocation = ({
  projectId,
  step,
}: {
  readonly projectId: string;
  readonly step: ProjectVerificationStep;
}): Invocation =>
  commonInvocation(projectId, step) ?? {
    script: `src/projects/${projectId}/tools/verification/${step}.ts`,
    args: ["check"],
  };

export const runProjectVerificationStep = async ({
  rootDir,
  projectId,
  step,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly step: ProjectVerificationStep;
}) => {
  const invocation = resolveProjectVerificationInvocation({ projectId, step });
  const scriptPath = join(rootDir, invocation.script);
  try {
    await access(scriptPath);
  } catch {
    throw new Error(`Missing verification adapter for ${projectId}/${step}.`);
  }
  const env = { ...process.env };
  if (invocation.withoutPrivateNarrationConfig) {
    delete env.RSP_VOXCPM_PRIVATE_CONFIG;
  }
  const result = await execFileAsync(
    process.execPath,
    ["--import", "tsx", scriptPath, ...invocation.args],
    { cwd: rootDir, env, maxBuffer: 16 * 1024 * 1024 },
  );
  return { stdout: result.stdout, stderr: result.stderr } as const;
};
