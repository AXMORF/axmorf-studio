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
import {runM9FinalPreviewEvidence} from "./final-evidence";

const STORY_ID = "product-comic-vertical";
const COMPOSITION_ID = "ProductComicVertical";
const PROJECT_ROOT = `src/projects/${STORY_ID}`;
const APPROVAL_PATH =
  `${PROJECT_ROOT}/generated/final-preview-approval.generated.json`;
const APPROVAL_AUTHORING_PATH =
  `${PROJECT_ROOT}/reviews/final-preview-approval.json`;
const ASSEMBLY_PATH = `${PROJECT_ROOT}/generated/final-assembly.generated.json`;

export type M9ApprovalErrorCode =
  | "missing-approval"
  | "stale-approval"
  | "approval-write-not-authorized";

export class M9ApprovalError extends Error {
  public readonly code: M9ApprovalErrorCode;

  public constructor(code: M9ApprovalErrorCode) {
    super(code);
    this.name = "M9ApprovalError";
    this.code = code;
  }
}

const loadCurrentInputs = async (rootDir: string) => {
  const [evidence, assembly] = await Promise.all([
    runM9FinalPreviewEvidence({rootDir, mode: "check"}),
    readFile(join(rootDir, ASSEMBLY_PATH), "utf8").then((value) =>
      FinalAssemblyPlanSchema.parse(JSON.parse(value)),
    ),
  ]);
  if (
    evidence.storyId !== STORY_ID ||
    evidence.compositionId !== COMPOSITION_ID ||
    evidence.finalAssemblyFingerprint !== assembly.finalAssemblyFingerprint
  ) {
    throw new M9ApprovalError("stale-approval");
  }
  return {evidence, assembly};
};

export const validateM9ApprovalAuthoringRecord = ({
  rawAuthoring,
  evidence,
  assembly,
}: {
  readonly rawAuthoring: unknown;
  readonly evidence: Awaited<ReturnType<typeof runM9FinalPreviewEvidence>>;
  readonly assembly: ReturnType<typeof FinalAssemblyPlanSchema.parse>;
}) => {
  const parsed = FinalPreviewApprovalInputSchema.safeParse(rawAuthoring);
  if (!parsed.success) {
    throw new M9ApprovalError("approval-write-not-authorized");
  }
  if (
    parsed.data.storyId !== STORY_ID ||
    parsed.data.compositionId !== COMPOSITION_ID ||
    parsed.data.previewChecksum !== evidence.media.fullPreview.checksum ||
    parsed.data.evidenceFingerprint !== evidence.evidenceFingerprint ||
    parsed.data.finalAssemblyFingerprint !== assembly.finalAssemblyFingerprint
  ) {
    throw new M9ApprovalError("stale-approval");
  }
  return parsed.data;
};

export const persistM9FinalPreviewApprovalArtifact = async ({
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

const persistM9ApprovalAuthoringRecord = async ({
  destination,
  authoring,
  mode,
}: {
  readonly destination: string;
  readonly authoring: unknown;
  readonly mode: "write" | "check";
}) => {
  const parsed = FinalPreviewApprovalInputSchema.parse(authoring);
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
    throw new M9ApprovalError(missingCode);
  }
};

export const checkM9FinalPreviewApproval = async ({
  rootDir,
}: {
  readonly rootDir: string;
}) => {
  const {evidence, assembly} = await loadCurrentInputs(rootDir);
  const authoring = validateM9ApprovalAuthoringRecord({
    rawAuthoring: await loadApprovalAuthoringRecord({
      rootDir,
      missingCode: "missing-approval",
    }),
    evidence,
    assembly,
  });
  let rawApproval: unknown;
  try {
    rawApproval = JSON.parse(
      await readFile(join(rootDir, APPROVAL_PATH), "utf8"),
    );
  } catch {
    throw new M9ApprovalError("missing-approval");
  }
  let approval: ReturnType<typeof FinalPreviewApprovalSchema.parse>;
  try {
    approval = FinalPreviewApprovalSchema.parse(rawApproval);
  } catch {
    throw new M9ApprovalError("stale-approval");
  }
  const expected = createFinalPreviewApproval(authoring);
  if (
    approval.storyId !== STORY_ID ||
    approval.compositionId !== COMPOSITION_ID ||
    approval.previewChecksum !== evidence.media.fullPreview.checksum ||
    approval.evidenceFingerprint !== evidence.evidenceFingerprint ||
    approval.finalAssemblyFingerprint !== assembly.finalAssemblyFingerprint ||
    approval.approvalFingerprint !== expected.approvalFingerprint
  ) {
    throw new M9ApprovalError("stale-approval");
  }
  await Promise.all([
    persistM9ApprovalAuthoringRecord({
      destination: join(rootDir, APPROVAL_AUTHORING_PATH),
      authoring,
      mode: "check",
    }),
    persistM9FinalPreviewApprovalArtifact({
      destination: join(rootDir, APPROVAL_PATH),
      approval: expected,
      mode: "check",
    }),
  ]).catch(() => {
    throw new M9ApprovalError("stale-approval");
  });
  return approval;
};

const ExplicitUserAuthorizationSchema = z
  .object({
    source: z.literal("explicit-user-current-preview"),
    decision: z.literal("approved"),
  })
  .strict();

export const writeM9FinalPreviewApproval = async ({
  rootDir,
  authorization,
}: {
  readonly rootDir: string;
  readonly authorization: unknown;
}) => {
  const parsed = ExplicitUserAuthorizationSchema.safeParse(authorization);
  if (!parsed.success) {
    throw new M9ApprovalError("approval-write-not-authorized");
  }
  const {evidence, assembly} = await loadCurrentInputs(rootDir);
  const authoring = validateM9ApprovalAuthoringRecord({
    rawAuthoring: {
      schemaVersion: 1,
      approvalVersion: "final-preview-approval-v1",
      storyId: STORY_ID,
      compositionId: COMPOSITION_ID,
      decision: "approved",
      previewChecksum: evidence.media.fullPreview.checksum,
      evidenceFingerprint: evidence.evidenceFingerprint,
      finalAssemblyFingerprint: assembly.finalAssemblyFingerprint,
      approvalReference: "user-approved-current-preview",
    },
    evidence,
    assembly,
  });
  const approval = createFinalPreviewApproval(authoring);
  await persistM9ApprovalAuthoringRecord({
    destination: join(rootDir, APPROVAL_AUTHORING_PATH),
    authoring,
    mode: "write",
  });
  await persistM9FinalPreviewApprovalArtifact({
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
      const approval = await checkM9FinalPreviewApproval({
        rootDir: process.cwd(),
      });
      return {
        status: "approved",
        approvalFingerprint: approval.approvalFingerprint,
      };
    }
    if (
      args.length === 2 &&
      args[0] === "write" &&
      args[1] === "explicit-user-current-preview"
    ) {
      const approval = await writeM9FinalPreviewApproval({
        rootDir: process.cwd(),
        authorization: {source: args[1], decision: "approved"},
      });
      return {
        status: "approved",
        approvalFingerprint: approval.approvalFingerprint,
      };
    }
    throw new M9ApprovalError("approval-write-not-authorized");
  };
  run()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error: unknown) => {
      const code =
        error instanceof M9ApprovalError ? error.code : "stale-approval";
      process.stderr.write(`${JSON.stringify({status: "fail", code})}\n`);
      process.exitCode = 1;
    });
}
