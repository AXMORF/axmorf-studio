import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import { StoryIdSchema } from "../../src/contracts";

export const ProjectVerificationStepSchema = z.enum([
  "narrative",
  "scene-audio",
  "scene-inputs",
  "scene-evidence",
  "global-audio",
  "final-inputs",
  "final-assembly",
  "final-evidence",
  "approval",
  "final",
]);

const ProjectVerificationProfileSchema = z
  .object({
    schemaVersion: z.literal(1),
    profileVersion: z.literal("project-verification-v2"),
    steps: z.array(ProjectVerificationStepSchema).min(1).readonly(),
  })
  .strict()
  .superRefine((profile, context) => {
    if (new Set(profile.steps).size !== profile.steps.length) {
      context.addIssue({
        code: "custom",
        message: "Project verification steps must be unique.",
        path: ["steps"],
      });
    }
    if (profile.steps[0] !== "narrative" || profile.steps.at(-1) !== "final") {
      context.addIssue({
        code: "custom",
        message: "Project verification must start narrative and end final.",
        path: ["steps"],
      });
    }
  });

export type ProjectVerificationStep = z.infer<
  typeof ProjectVerificationStepSchema
>;
export type ProjectVerificationScope =
  | "full"
  | "source"
  | "evidence"
  | "approval";

export type ProjectVerificationProfiles = Readonly<{
  profileVersion: "project-verification-v2";
  projects: readonly Readonly<{
    projectId: z.infer<typeof StoryIdSchema>;
    steps: readonly ProjectVerificationStep[];
  }>[];
}>;

export const parseProjectVerificationProfile = (raw: unknown) =>
  ProjectVerificationProfileSchema.parse(raw);

export const loadProjectVerificationProfiles = async (
  rootDir: string,
): Promise<ProjectVerificationProfiles> => {
  const projectsRoot = join(rootDir, "src/projects");
  const entries = await readdir(projectsRoot, { withFileTypes: true });
  const projects: ProjectVerificationProfiles["projects"][number][] = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (entry.isSymbolicLink()) {
      throw new Error(`Project symbolic links are not allowed: ${entry.name}.`);
    }
    if (!entry.isDirectory()) continue;
    const profilePath = join(
      projectsRoot,
      entry.name,
      "verification.profile.json",
    );
    let stat;
    try {
      stat = await lstat(profilePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(
        `Project verification profile must be a regular file: ${entry.name}.`,
      );
    }
    const profile = parseProjectVerificationProfile(
      JSON.parse(await readFile(profilePath, "utf8")),
    );
    projects.push({
      projectId: StoryIdSchema.parse(entry.name),
      steps: profile.steps,
    });
  }
  return { profileVersion: "project-verification-v2", projects };
};

const evidenceSteps = new Set<ProjectVerificationStep>([
  "scene-evidence",
  "final-evidence",
]);

export const resolveProfileSteps = (
  manifest: ProjectVerificationProfiles,
  projectId: string,
  scope: ProjectVerificationScope,
) => {
  const profile = manifest.projects.find(
    (candidate) => candidate.projectId === projectId,
  );
  if (profile === undefined) {
    throw new Error(`Unknown Project verification profile: ${projectId}.`);
  }
  if (scope === "full") return profile.steps;
  if (scope === "evidence") {
    return profile.steps.filter((step) => evidenceSteps.has(step));
  }
  if (scope === "approval") {
    return profile.steps.filter((step) => step === "approval");
  }
  return profile.steps.filter(
    (step) => !evidenceSteps.has(step) && step !== "approval",
  );
};

const scopes = ["full", "source", "evidence", "approval"] as const;

export const parseProjectValidationArgs = (args: readonly string[]) => {
  if (
    args.length === 3 &&
    (args[0] === "evidence" || args[0] === "approval") &&
    args[1] === "--project"
  ) {
    return {
      target: StoryIdSchema.parse(args[2]),
      scope: args[0],
    } as const;
  }
  if (args.length === 1 && args[0] === "--all") {
    return { target: "all", scope: "full" } as const;
  }
  if (
    args.length === 3 &&
    args[0] === "--all" &&
    args[1] === "--scope" &&
    scopes.includes(args[2] as (typeof scopes)[number])
  ) {
    return {
      target: "all",
      scope: args[2] as ProjectVerificationScope,
    } as const;
  }
  if (
    args.length !== 4 ||
    args[0] !== "--project" ||
    args[2] !== "--scope" ||
    !scopes.includes(args[3] as (typeof scopes)[number])
  ) {
    throw new Error(
      "Expected --all [--scope source|full|evidence|approval], evidence|approval --project <id>, or --project <id> --scope source|full|evidence|approval.",
    );
  }
  return {
    target: StoryIdSchema.parse(args[1]),
    scope: args[3] as ProjectVerificationScope,
  } as const;
};
