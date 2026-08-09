import {
  buildProductionOwnerReceipt,
  type DeliveryCoverAssignment,
  type GlobalVisualAssignment,
  type ProductionOwnerKind,
  type ProductionOwnerReceipt,
  type SceneAssignment,
} from "../../../src/contracts";
import { loadCurrentDeliveryCoverAssignment } from "../../delivery/application/cover-inputs";
import { redactProductionErrorDescription } from "../adapters/error-redaction";
import {
  collectOwnerOutputManifest,
  readOwnerReceipt,
  writeOwnerReceiptAtomic,
  type OwnerOutputScope,
} from "../adapters/owner-inbox";
import { readProductionRunStore } from "../adapters/run-store";
import {
  loadCurrentGlobalVisualAssignment,
} from "./global-visual-check";
import { resolveCurrentSceneAssignments } from "./scene-freeze";

type OwnerAssignment =
  | Readonly<{ ownerKind: "scene"; assignment: SceneAssignment }>
  | Readonly<{
      ownerKind: "global-visual";
      assignment: GlobalVisualAssignment;
    }>
  | Readonly<{ ownerKind: "cover"; assignment: DeliveryCoverAssignment }>;

export const ownerOutputScope = (owner: OwnerAssignment): OwnerOutputScope => {
  if (owner.ownerKind === "scene") {
    const { sceneRoot, publicAssetRoot } = owner.assignment.taskInput.allowedDirectories;
    return {
      directories: [sceneRoot, publicAssetRoot],
      excludedPrefixes: [`${sceneRoot}/generated`],
      requiredFiles: [`${sceneRoot}/Renderer.tsx`],
    };
  }
  if (owner.ownerKind === "global-visual") {
    const paths = owner.assignment.exclusivePaths;
    return {
      directories: [paths.sourceDirectory, paths.publicDirectory],
      files: [paths.plan],
      excludedPrefixes: [`${paths.sourceDirectory}/generated`],
      requiredFiles: [
        paths.plan,
        `${paths.sourceDirectory}/GlobalVisualLayers.tsx`,
        `${paths.sourceDirectory}/selected-resources.json`,
      ],
    };
  }
  const source = owner.assignment.exclusivePaths.sourceDirectory;
  const files = [
    `${source}/Cover4x3.tsx`,
    `${source}/Cover3x4.tsx`,
    `${source}/Root.tsx`,
    `${source}/index.ts`,
  ];
  return {
    files,
    requiredFiles: files,
    coverSourceDirectory: source,
  };
};

export const assertOwnerAssignmentsIsolated = (
  owners: readonly OwnerAssignment[],
) => {
  const groups = owners.map((owner) => {
    const scope = ownerOutputScope(owner);
    return [
      ...(scope.directories ?? []),
      ...(scope.files ?? []),
      ...(scope.coverSourceDirectory === undefined
        ? []
        : [scope.coverSourceDirectory]),
    ];
  });
  for (let left = 0; left < groups.length; left += 1) {
    for (let right = left + 1; right < groups.length; right += 1) {
      for (const leftPath of groups[left]!) {
        for (const rightPath of groups[right]!) {
          if (
            leftPath === rightPath ||
            leftPath.startsWith(`${rightPath}/`) ||
            rightPath.startsWith(`${leftPath}/`)
          ) {
            throw new Error("Owner assignment output paths overlap.");
          }
        }
      }
    }
  }
};

export const resolveOwnerAssignment = async ({
  rootDir,
  runId,
  ownerKind,
  meaningId,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly ownerKind: ProductionOwnerKind;
  readonly meaningId: string | null;
}): Promise<OwnerAssignment> => {
  const loaded = await readProductionRunStore({ rootDir, runId });
  if (
    !new Set([
      "scene-inputs-frozen",
      "waiting-for-owner-results",
      "render-ready-running",
      "render-ready",
    ]).has(loaded.state.state)
  ) {
    throw new Error("Owner receipt requires frozen owner assignments.");
  }
  if (ownerKind === "scene") {
    if (meaningId === null) throw new Error("Scene owner receipt requires meaningId.");
    const resolved = await resolveCurrentSceneAssignments({ rootDir, runId });
    const assignment = resolved.assignments.find(
      (candidate) => candidate.meaningId === meaningId,
    );
    if (assignment === undefined) throw new Error("Scene assignment identity is unknown.");
    return { ownerKind, assignment };
  }
  if (meaningId !== null) throw new Error("Non-Scene owner receipt must not carry meaningId.");
  if (ownerKind === "global-visual") {
    const assignment = await loadCurrentGlobalVisualAssignment({ rootDir, runId });
    return { ownerKind, assignment };
  }
  const { assignment } = await loadCurrentDeliveryCoverAssignment({
    rootDir,
    projectId: loaded.run.storyId,
  });
  return { ownerKind, assignment };
};

const receiptIdentity = (owner: OwnerAssignment) => {
  if (owner.ownerKind === "scene") {
    const { assignment } = owner;
    return {
      storyId: assignment.storyId,
      ownerKind: owner.ownerKind,
      meaningId: assignment.meaningId,
      assignmentFingerprint: assignment.assignmentFingerprint,
      taskInputFingerprint: assignment.taskInput.taskInputFingerprint,
      requirementsFingerprint: assignment.requirementsFingerprint,
      inputFingerprints: [
        { artifactId: "assignment", fingerprint: assignment.assignmentFingerprint },
        { artifactId: "requirements", fingerprint: assignment.requirementsFingerprint },
        { artifactId: "resource-pool", fingerprint: assignment.resourcePoolFingerprint },
        { artifactId: "scene-brief", fingerprint: assignment.sceneBriefFingerprint },
        { artifactId: "task-input", fingerprint: assignment.taskInput.taskInputFingerprint },
      ],
    } as const;
  }
  if (owner.ownerKind === "global-visual") {
    const { assignment } = owner;
    return {
      storyId: assignment.storyId,
      ownerKind: owner.ownerKind,
      meaningId: null,
      assignmentFingerprint: assignment.assignmentFingerprint,
      taskInputFingerprint: null,
      requirementsFingerprint: assignment.requirementsFingerprint,
      inputFingerprints: [
        { artifactId: "assignment", fingerprint: assignment.assignmentFingerprint },
        { artifactId: "global-visual-brief", fingerprint: assignment.globalVisualBriefFingerprint },
        { artifactId: "requirements", fingerprint: assignment.requirementsFingerprint },
        { artifactId: "resource-pool", fingerprint: assignment.resourcePoolFingerprint },
      ],
    } as const;
  }
  const { assignment } = owner;
  return {
    storyId: assignment.storyId,
    ownerKind: owner.ownerKind,
    meaningId: null,
    assignmentFingerprint: assignment.assignmentFingerprint,
    taskInputFingerprint: null,
    requirementsFingerprint: null,
    inputFingerprints: [
      { artifactId: "assignment", fingerprint: assignment.assignmentFingerprint },
      ...assignment.inputs.map((input) => ({
        artifactId: `cover-input.${input.kind}`,
        fingerprint: input.fingerprint,
      })),
    ],
  } as const;
};

export const publishProductionOwnerReceipt = async ({
  rootDir,
  runId,
  ownerKind,
  meaningId,
  status,
  code,
  description,
  clock = () => new Date(),
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly ownerKind: ProductionOwnerKind;
  readonly meaningId: string | null;
  readonly status: "owner-ready" | "owner-failed";
  readonly code?: string;
  readonly description?: string;
  readonly clock?: () => Date;
}) => {
  const owner = await resolveOwnerAssignment({
    rootDir,
    runId,
    ownerKind,
    meaningId,
  });
  const loaded = await readProductionRunStore({ rootDir, runId });
  const scope = ownerOutputScope(owner);
  const outputManifest = await collectOwnerOutputManifest({
    rootDir,
    scope,
    allowMissing: status === "owner-failed",
  });
  const identity = receiptIdentity(owner);
  const now = clock();
  if (Number.isNaN(now.getTime())) throw new Error("Owner receipt clock is invalid.");
  const error =
    status === "owner-failed"
      ? redactProductionErrorDescription({
          error: description ?? "Owner reported a terminal failure.",
          fallback: "Owner reported a terminal failure.",
          maximumLength: 500,
        })
      : null;
  const receipt = buildProductionOwnerReceipt({
    ...identity,
    runId: loaded.run.runId,
    outputManifest,
    occurredAt: now.toISOString(),
    status,
    ...(status === "owner-failed"
      ? {
          error: {
            code: code ?? "OWNER_FAILED",
            description: error!.description,
            redactionApplied: error!.redactionApplied,
          },
        }
      : {}),
  }) as ProductionOwnerReceipt;
  const existing = await readOwnerReceipt({
    rootDir,
    runId,
    ownerKind,
    meaningId,
  });
  if (existing !== null) {
    const comparable = (value: ProductionOwnerReceipt) => {
      const record: Record<string, unknown> = { ...value };
      delete record.occurredAt;
      delete record.receiptFingerprint;
      return record;
    };
    if (JSON.stringify(comparable(existing)) !== JSON.stringify(comparable(receipt))) {
      throw new Error("Owner receipt identity already has conflicting content.");
    }
    return {
      runId,
      storyId: loaded.run.storyId,
      ownerKind,
      meaningId,
      status: existing.status,
      noOp: true,
      receiptFingerprint: existing.receiptFingerprint,
    } as const;
  }
  const written = await writeOwnerReceiptAtomic({ rootDir, receipt });
  return {
    runId,
    storyId: loaded.run.storyId,
    ownerKind,
    meaningId,
    status: written.receipt.status,
    noOp: !written.written,
    receiptFingerprint: written.receipt.receiptFingerprint,
  } as const;
};
