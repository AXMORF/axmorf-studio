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

const projectInvocations: Readonly<
  Record<string, Partial<Record<ProjectVerificationStep, Invocation>>>
> = {
  "gps-relativity": {
    "scene-audio": {
      script: "scripts/project-tools/gps-relativity/scene-audio.ts",
      args: ["check"],
    },
    "scene-inputs": {
      script: "scripts/project-tools/gps-relativity/scene-inputs.ts",
      args: ["check"],
    },
    "scene-evidence": {
      script: "scripts/project-tools/gps-relativity/scene-evidence.ts",
      args: ["check"],
    },
    "global-audio": {
      script: "scripts/project-tools/gps-relativity/global-audio.ts",
      args: ["check"],
    },
    "final-inputs": {
      script: "scripts/project-tools/gps-relativity/final-inputs.ts",
      args: ["check"],
    },
    "final-evidence": {
      script: "scripts/project-tools/gps-relativity/final-evidence.ts",
      args: ["check"],
    },
    approval: {
      script: "scripts/project-tools/gps-relativity/approval.ts",
      args: ["check"],
    },
  },
  "product-comic-vertical": {
    "scene-audio": {
      script: "scripts/project-tools/product-comic-vertical/scene-audio.ts",
      args: ["check"],
    },
    "global-audio": {
      script: "scripts/project-tools/product-comic-vertical/global-audio.ts",
      args: ["check"],
    },
    "scene-evidence": {
      script: "scripts/project-tools/product-comic-vertical/scene-evidence.ts",
      args: ["check"],
    },
    "final-evidence": {
      script: "scripts/project-tools/product-comic-vertical/final-evidence.ts",
      args: ["check"],
    },
    approval: {
      script: "scripts/project-tools/product-comic-vertical/approval.ts",
      args: ["check"],
    },
  },
};

export const resolveProjectVerificationInvocation = ({
  projectId,
  step,
}: {
  readonly projectId: string;
  readonly step: ProjectVerificationStep;
}) => {
  const invocation =
    commonInvocation(projectId, step) ?? projectInvocations[projectId]?.[step];
  if (invocation === undefined) {
    throw new Error(`No static verification adapter for ${projectId}/${step}.`);
  }
  return invocation;
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
  const env = { ...process.env };
  if (invocation.withoutPrivateNarrationConfig) {
    delete env.RSP_VOXCPM_PRIVATE_CONFIG;
  }
  const result = await execFileAsync(
    process.execPath,
    ["--import", "tsx", join(rootDir, invocation.script), ...invocation.args],
    { cwd: rootDir, env, maxBuffer: 16 * 1024 * 1024 },
  );
  return { stdout: result.stdout, stderr: result.stderr } as const;
};
