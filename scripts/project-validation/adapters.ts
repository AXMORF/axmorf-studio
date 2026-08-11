import { access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

import type {
  ProjectVerificationScope,
  ProjectVerificationStep,
} from "./profiles";

const execFileAsync = promisify(execFile);

type Invocation = Readonly<{
  script: string;
  args: readonly string[];
  withoutPrivateNarrationConfig?: boolean;
}>;

const commonInvocation = (
  projectId: string,
  step: ProjectVerificationStep,
  scope: ProjectVerificationScope,
): Invocation | null => {
  if (step === "narrative" || step === "final") {
    return {
      script: "scripts/project-check/cli.ts",
      args: [
        "--project",
        projectId,
        "--level",
        step,
        ...(scope === "source" ? ["--scope", "source"] : []),
      ],
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
  scope = "full",
}: {
  readonly projectId: string;
  readonly step: ProjectVerificationStep;
  readonly scope?: ProjectVerificationScope;
}): Invocation =>
  commonInvocation(projectId, step, scope) ?? {
    script: `src/projects/${projectId}/tools/verification/${step}.ts`,
    args: ["check"],
  };

export const runProjectVerificationStep = async ({
  rootDir,
  projectId,
  step,
  scope,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly step: ProjectVerificationStep;
  readonly scope: ProjectVerificationScope;
}) => {
  const invocation = resolveProjectVerificationInvocation({
    projectId,
    step,
    scope,
  });
  const scriptPath = join(rootDir, invocation.script);
  try {
    await access(scriptPath);
  } catch {
    throw new Error(`Missing verification adapter for ${projectId}/${step}.`);
  }
  const env = { ...process.env };
  if (invocation.withoutPrivateNarrationConfig) {
    delete env.RSP_PRODUCER_CONFIG;
    delete env.RSP_VOXCPM_PRIVATE_CONFIG;
  }
  const result = await execFileAsync(
    process.execPath,
    ["--import", "tsx", scriptPath, ...invocation.args],
    { cwd: rootDir, env, maxBuffer: 16 * 1024 * 1024 },
  );
  return { stdout: result.stdout, stderr: result.stderr } as const;
};
