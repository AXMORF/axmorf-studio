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
    projectId: StoryIdSchema,
    steps: z.array(ProjectVerificationStepSchema).min(1).readonly(),
  })
  .strict()
  .superRefine((profile, context) => {
    if (new Set(profile.steps).size !== profile.steps.length) {
      context.addIssue({
        code: "custom",
        message: "Formal project verification steps must be unique.",
        path: ["steps"],
      });
    }
    if (profile.steps[0] !== "narrative" || profile.steps.at(-1) !== "final") {
      context.addIssue({
        code: "custom",
        message:
          "Formal project verification must start narrative and end final.",
        path: ["steps"],
      });
    }
  });

const ProjectVerificationProfilesSchema = z
  .object({
    schemaVersion: z.literal(1),
    profileVersion: z.literal("formal-project-verification-v1"),
    projects: z.array(ProjectVerificationProfileSchema).min(1).readonly(),
  })
  .strict()
  .superRefine((manifest, context) => {
    const ids = manifest.projects.map(({ projectId }) => projectId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        message: "Formal project verification profiles must be unique.",
        path: ["projects"],
      });
    }
    if ([...ids].sort().some((id, index) => id !== ids[index])) {
      context.addIssue({
        code: "custom",
        message: "Formal project verification profiles must be sorted.",
        path: ["projects"],
      });
    }
  });

export type ProjectVerificationStep = z.infer<
  typeof ProjectVerificationStepSchema
>;
export type ProjectVerificationScope = "full" | "evidence" | "approval";

export const parseProjectVerificationProfiles = (raw: unknown) =>
  ProjectVerificationProfilesSchema.parse(raw);

const stepScopes: Readonly<
  Record<ProjectVerificationScope, readonly ProjectVerificationStep[] | null>
> = {
  full: null,
  evidence: ["scene-evidence", "final-evidence"],
  approval: ["approval"],
};

export const resolveProfileSteps = (
  manifest: ReturnType<typeof parseProjectVerificationProfiles>,
  projectId: string,
  scope: ProjectVerificationScope,
) => {
  const profile = manifest.projects.find(
    (candidate) => candidate.projectId === projectId,
  );
  if (profile === undefined) {
    throw new Error(
      `Unknown formal project verification profile: ${projectId}.`,
    );
  }
  const selected = stepScopes[scope];
  return selected === null
    ? profile.steps
    : profile.steps.filter((step) => selected.includes(step));
};

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
    args.length !== 4 ||
    args[0] !== "--project" ||
    args[2] !== "--scope" ||
    !["full", "evidence", "approval"].includes(args[3] ?? "")
  ) {
    throw new Error(
      "Expected --all, evidence|approval --project <id>, or --project <id> --scope full|evidence|approval.",
    );
  }
  return {
    target: StoryIdSchema.parse(args[1]),
    scope: args[3] as ProjectVerificationScope,
  } as const;
};
