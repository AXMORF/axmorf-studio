import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {pathToFileURL} from "node:url";

import {z} from "zod";

import {
  FinalAssemblyPlanSchema,
  FinalPreviewApprovalInputSchema,
  FinalPreviewApprovalSchema,
  createFinalPreviewApproval,
} from "../../src/contracts";
import {writeOrCheckSceneArtifact} from "../scene-package/project-files";
import {runM8FinalPreviewEvidence} from "./evidence";

const STORY_ID = "gps-relativity";
const COMPOSITION_ID = "GpsRelativity";
const APPROVAL_PATH =
  "src/projects/gps-relativity/generated/final-preview-approval.generated.json";
const APPROVAL_AUTHORING_PATH =
  "src/projects/gps-relativity/reviews/final-preview-approval.json";
const ASSEMBLY_PATH =
  "src/projects/gps-relativity/generated/final-assembly.generated.json";

export type M8ApprovalErrorCode =
  | "missing-approval"
  | "stale-approval"
  | "approval-write-not-authorized";

export class M8ApprovalError extends Error {
  public readonly code: M8ApprovalErrorCode;

  public constructor(code: M8ApprovalErrorCode) {
    super(code);
    this.name = "M8ApprovalError";
    this.code = code;
  }
}

const loadCurrentInputs = async (rootDir: string) => {
  const [evidence, assembly] = await Promise.all([
    runM8FinalPreviewEvidence({rootDir, mode: "check"}),
    readFile(join(rootDir, ASSEMBLY_PATH), "utf8").then((value) =>
      FinalAssemblyPlanSchema.parse(JSON.parse(value)),
    ),
  ]);
  if (
    evidence.storyId !== STORY_ID ||
    evidence.compositionId !== COMPOSITION_ID ||
    evidence.finalAssemblyFingerprint !== assembly.finalAssemblyFingerprint
  ) {
    throw new M8ApprovalError("stale-approval");
  }
  return {evidence, assembly};
};

export const validateM8ApprovalAuthoringRecord = ({
  rawAuthoring,
  evidence,
  assembly,
}: {
  readonly rawAuthoring: unknown;
  readonly evidence: Awaited<ReturnType<typeof runM8FinalPreviewEvidence>>;
  readonly assembly: ReturnType<typeof FinalAssemblyPlanSchema.parse>;
}) => {
  const parsed = FinalPreviewApprovalInputSchema.safeParse(rawAuthoring);
  if (!parsed.success) {
    throw new M8ApprovalError("approval-write-not-authorized");
  }
  if (
    parsed.data.storyId !== STORY_ID ||
    parsed.data.compositionId !== COMPOSITION_ID ||
    parsed.data.previewChecksum !== evidence.media.fullPreview.checksum ||
    parsed.data.evidenceFingerprint !== evidence.evidenceFingerprint ||
    parsed.data.finalAssemblyFingerprint !== assembly.finalAssemblyFingerprint
  ) {
    throw new M8ApprovalError("stale-approval");
  }
  return parsed.data;
};

export const persistM8FinalPreviewApprovalArtifact = async ({
  destination,
  approval,
  mode,
}: {
  readonly destination: string;
  readonly approval: unknown;
  readonly mode: "write" | "check";
}) => {
  const parsed = FinalPreviewApprovalSchema.parse(approval);
  await writeOrCheckSceneArtifact({destination, value: parsed, mode});
  return parsed;
};

const loadApprovalAuthoringRecord = async ({
  rootDir,
  missingCode,
}: {
  readonly rootDir: string;
  readonly missingCode: "missing-approval" | "approval-write-not-authorized";
}): Promise<unknown> => {
  try {
    return JSON.parse(
      await readFile(join(rootDir, APPROVAL_AUTHORING_PATH), "utf8"),
    );
  } catch {
    throw new M8ApprovalError(missingCode);
  }
};

export const checkM8FinalPreviewApproval = async ({
  rootDir,
}: {
  readonly rootDir: string;
}) => {
  const {evidence, assembly} = await loadCurrentInputs(rootDir);
  const authoring = validateM8ApprovalAuthoringRecord({
    rawAuthoring: await loadApprovalAuthoringRecord({
      rootDir,
      missingCode: "missing-approval",
    }),
    evidence,
    assembly,
  });
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(join(rootDir, APPROVAL_PATH), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new M8ApprovalError("missing-approval");
    }
    throw new M8ApprovalError("stale-approval");
  }
  let approval: ReturnType<typeof FinalPreviewApprovalSchema.parse>;
  try {
    approval = FinalPreviewApprovalSchema.parse(raw);
  } catch {
    throw new M8ApprovalError("stale-approval");
  }
  if (
    approval.storyId !== STORY_ID ||
    approval.compositionId !== COMPOSITION_ID ||
    approval.previewChecksum !== evidence.media.fullPreview.checksum ||
    approval.evidenceFingerprint !== evidence.evidenceFingerprint ||
    approval.finalAssemblyFingerprint !== assembly.finalAssemblyFingerprint
  ) {
    throw new M8ApprovalError("stale-approval");
  }
  const expectedApproval = createFinalPreviewApproval(authoring);
  await persistM8FinalPreviewApprovalArtifact({
    destination: join(rootDir, APPROVAL_PATH),
    approval: expectedApproval,
    mode: "check",
  }).catch(() => {
    throw new M8ApprovalError("stale-approval");
  });
  return approval;
};

const ExplicitUserAuthorizationSchema = z
  .object({
    source: z.literal("explicit-user-current-preview"),
    decision: z.literal("approved"),
  })
  .strict();

export const writeM8FinalPreviewApproval = async ({
  rootDir,
  authorization,
}: {
  readonly rootDir: string;
  readonly authorization: unknown;
}) => {
  const parsed = ExplicitUserAuthorizationSchema.safeParse(authorization);
  if (!parsed.success) {
    throw new M8ApprovalError("approval-write-not-authorized");
  }
  const rawAuthoring = await loadApprovalAuthoringRecord({
    rootDir,
    missingCode: "approval-write-not-authorized",
  });
  const {evidence, assembly} = await loadCurrentInputs(rootDir);
  const authoring = validateM8ApprovalAuthoringRecord({
    rawAuthoring,
    evidence,
    assembly,
  });
  const approval = createFinalPreviewApproval(authoring);
  await persistM8FinalPreviewApprovalArtifact({
    destination: join(rootDir, APPROVAL_PATH),
    approval,
    mode: "write",
  });
  return approval;
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const run = async () => {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === "check") {
      const approval = await checkM8FinalPreviewApproval({
        rootDir: process.cwd(),
      });
      return {status: "approved", approvalFingerprint: approval.approvalFingerprint};
    }
    if (
      args.length === 2 &&
      args[0] === "write" &&
      args[1] === "explicit-user-current-preview"
    ) {
      const approval = await writeM8FinalPreviewApproval({
        rootDir: process.cwd(),
        authorization: {
          source: args[1],
          decision: "approved",
        },
      });
      return {status: "approved", approvalFingerprint: approval.approvalFingerprint};
    }
    throw new M8ApprovalError("approval-write-not-authorized");
  };
  run()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error: unknown) => {
      const code =
        error instanceof M8ApprovalError ? error.code : "stale-approval";
      process.stderr.write(`${JSON.stringify({status: "fail", code})}\n`);
      process.exitCode = 1;
    });
}
