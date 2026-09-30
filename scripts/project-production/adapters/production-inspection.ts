import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import {
  ExecutionAttemptProgressSchema,
  buildProjectDurationBudget,
  type DurationBudget,
  MasteredNarrationManifestSchema,
  NarrationPreparationReceiptSchema,
  SceneProductionBriefSchema,
  SealedNarrationManifestSchema,
  SemanticTimingSchema,
  StoryIdSchema,
  computeGenerationInputFingerprint,
  flattenTtsChunks,
  serializeCanonicalJson,
  validateNarrativeArtifactBundle,
} from "@axmorf/studio/contracts";
import { generateProjectResourceCatalog } from "../../catalog/generate";
import { loadScopedProjectCatalogAuthorityDescriptors } from "../../catalog/project-files";
import { resolveProducerNarrationInspection } from "../../config/narration-execution";
import { loadVerifiedProgress } from "../../narration/adapters/candidate-workspace";
import {
  planChunkGeneration,
  type NarrationGenerationExpected,
} from "../../narration/domain/candidate-progress";
import type { NarrationPreparationReceipt } from "@axmorf/studio/contracts";
import { computeChunkRequestFingerprint } from "../../narration/domain/provider-input";
import { loadNarrationProjectFiles } from "../../narration/project-files";
import { isTemplateSceneLiveProjectionPath } from "../domain/template-scene-output";
import { inspectCurrentDelivery as inspectVerifiedCurrentDelivery } from "./current-delivery-inspection";
import {
  createLiveProjectProductionScope,
  type ProductionScope,
} from "../domain/production-scope";

type TreeEntry = Readonly<{
  path: string;
  kind: "directory" | "file";
  size: number;
  mtimeNs: string;
  checksum: string | null;
}>;

const checksum = (bytes: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const inspectTree = async (
  root: string,
  current = root,
): Promise<readonly TreeEntry[]> => {
  let metadata;
  try {
    metadata = await lstat(current, { bigint: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  if (metadata.isSymbolicLink()) {
    throw new Error("Production inspection encountered an unsafe symlink.");
  }
  const logicalPath =
    current === root ? "." : relative(root, current).split(sep).join("/");
  if (metadata.isFile()) {
    const bytes = Uint8Array.from(await readFile(current));
    return [
      {
        path: logicalPath,
        kind: "file",
        size: Number(metadata.size),
        mtimeNs: metadata.mtimeNs.toString(),
        checksum: checksum(bytes),
      },
    ];
  }
  if (!metadata.isDirectory()) {
    throw new Error("Production inspection encountered a special file.");
  }
  const entries: TreeEntry[] = [
    {
      path: logicalPath,
      kind: "directory",
      size: Number(metadata.size),
      mtimeNs: metadata.mtimeNs.toString(),
      checksum: null,
    },
  ];
  for (const entry of (await readdir(current, { withFileTypes: true })).sort(
    (left, right) => left.name.localeCompare(right.name),
  )) {
    entries.push(...(await inspectTree(root, join(current, entry.name))));
  }
  return entries;
};

const fingerprintTrees = async (paths: readonly string[]) =>
  checksum(
    JSON.stringify(
      await Promise.all(
        paths.map(async (path) => ({ path, entries: await inspectTree(path) })),
      ),
    ),
  );

export type ProductionInspectionSnapshot = Readonly<{
  source: string;
  public: string;
  generated: string;
  catalog: string;
  narrationCache: string;
  artifacts: string;
  workspaces: string;
  attempts: string;
  delivery: string;
}>;

export const captureProductionInspectionSnapshot = async ({
  rootDir,
  projectId: rawProjectId,
  scope: suppliedScope,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly scope?: ProductionScope;
}): Promise<ProductionInspectionSnapshot> => {
  const projectId = StoryIdSchema.parse(rawProjectId);
  const scope =
    suppliedScope ??
    createLiveProjectProductionScope({ rootDir, storyId: projectId });
  const projectRoot = join(scope.projectSourceRoot, projectId);
  const generatedRoot = join(projectRoot, "generated");
  const [
    source,
    publicFiles,
    generated,
    catalog,
    narrationCache,
    artifacts,
    workspaces,
    attempts,
    delivery,
  ] = await Promise.all([
    fingerprintTrees([projectRoot]),
    fingerprintTrees([join(scope.projectPublicRoot, projectId)]),
    fingerprintTrees([generatedRoot]),
    fingerprintTrees([
      join(
        scope.shared.runtimeRoot,
        "src/remotion/catalog/resource-catalog.generated.json",
      ),
      join(generatedRoot, "resource-catalog.generated.json"),
    ]),
    fingerprintTrees([join(scope.narrationWorkRoot, projectId)]),
    fingerprintTrees([join(scope.shared.producerArtifactRoot, projectId)]),
    fingerprintTrees([join(scope.producerWorkRoot, projectId)]),
    fingerprintTrees([join(scope.producerAttemptsRoot, projectId)]),
    fingerprintTrees([join(scope.deliveryRoot, projectId)]),
  ]);
  return {
    source,
    public: publicFiles,
    generated,
    catalog,
    narrationCache,
    artifacts,
    workspaces,
    attempts,
    delivery,
  };
};

const isRegularFile = async (path: string) => {
  try {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new Error("Project authoring input is not a regular file.");
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
};

const readJsonContract = async <T>(
  path: string,
  schema: { readonly parse: (value: unknown) => T },
  label: string,
) => {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`${label} contains malformed JSON.`, { cause: error });
  }
  return schema.parse(raw);
};

const CONFIGURED_FILES = [
  "brief.json",
  "story.json",
  "narration.json",
  "render.json",
  "sound.json",
  "assets.manifest.json",
  "visual-style.json",
  "publishing-intent.json",
  "production/requirements.json",
  "production/story-resource-pool.json",
  "production/global-visual-brief.json",
  "production/scene-originality-baseline.json",
] as const;
const TIMING_FILES = [
  "generated/sealed-narration.generated.json",
  "generated/semantic-timing.generated.json",
  "generated/mastered-narration.generated.json",
] as const;
const NARRATION_PREPARATION_RECEIPT =
  "generated/narration-preparation.generated.json" as const;

export type ProductionSourceReadiness = Readonly<{
  sourceState:
    | "configured-authoring"
    | "timing-ready"
    | "production-inputs-ready";
  missingAuthoringInputs: readonly string[];
  durationBudget?: DurationBudget;
}>;

export const inspectProductionSourceReadiness = async ({
  rootDir,
  projectId: rawProjectId,
  scope: suppliedScope,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly scope?: ProductionScope;
}): Promise<ProductionSourceReadiness> => {
  const projectId = StoryIdSchema.parse(rawProjectId);
  const scope =
    suppliedScope ??
    createLiveProjectProductionScope({ rootDir, storyId: projectId });
  const projectRoot = join(scope.projectSourceRoot, projectId);
  const configured = await Promise.all(
    CONFIGURED_FILES.map((path) => isRegularFile(join(projectRoot, path))),
  );
  const missingConfigured = CONFIGURED_FILES.filter(
    (_path, index) => configured[index] !== true,
  );
  if (missingConfigured.length > 0) {
    throw new Error(
      `Project configured authoring is incomplete: ${missingConfigured.join(", ")}.`,
    );
  }
  const { projectSource } = await loadNarrationProjectFiles({
    rootDir: scope.isolatedRoot,
    projectId,
  });
  const durationBudget = buildProjectDurationBudget(projectSource);
  await generateProjectResourceCatalog({
    rootDir: scope.isolatedRoot,
    projectId,
    mode: "check",
    ...(scope.kind === "live-project"
      ? {}
      : {
          loadDescriptors: () =>
            loadScopedProjectCatalogAuthorityDescriptors({
              runtimeRoot: scope.shared.runtimeRoot,
              projectRoot: scope.isolatedRoot,
              projectId,
            }),
        }),
  });

  const timing = await Promise.all(
    TIMING_FILES.map((path) => isRegularFile(join(projectRoot, path))),
  );
  const timingCount = timing.filter(Boolean).length;
  if (timingCount !== 0 && timingCount !== TIMING_FILES.length) {
    throw new Error("Project narration preparation is incomplete.");
  }
  if (timingCount === 0) {
    return {
      sourceState: "configured-authoring",
      durationBudget,
      missingAuthoringInputs: [],
    };
  }
  const [sealedNarration, semanticTiming, masteredNarration] =
    await Promise.all([
      readJsonContract(
        join(projectRoot, TIMING_FILES[0]),
        SealedNarrationManifestSchema,
        "SealedNarration",
      ),
      readJsonContract(
        join(projectRoot, TIMING_FILES[1]),
        SemanticTimingSchema,
        "SemanticTiming",
      ),
      readJsonContract(
        join(projectRoot, TIMING_FILES[2]),
        MasteredNarrationManifestSchema,
        "MasteredNarration",
      ),
    ]);
  const receiptPath = join(projectRoot, NARRATION_PREPARATION_RECEIPT);
  if (!(await isRegularFile(receiptPath))) {
    return {
      sourceState: "configured-authoring",
      durationBudget,
      missingAuthoringInputs: [],
    };
  }
  const preparationReceipt = await readJsonContract(
    receiptPath,
    NarrationPreparationReceiptSchema,
    "NarrationPreparationReceipt",
  );
  try {
    validateNarrativeArtifactBundle({
      projectSource,
      sealedNarration,
      semanticTiming,
    });
    if (
      masteredNarration.sealedNarrationFingerprint !==
        sealedNarration.sealedNarrationFingerprint ||
      preparationReceipt.storyId !== projectId ||
      preparationReceipt.generationInputFingerprint !==
        sealedNarration.generationInputFingerprint ||
      preparationReceipt.sealedNarrationFingerprint !==
        sealedNarration.sealedNarrationFingerprint ||
      serializeCanonicalJson(preparationReceipt.masteringPolicy) !==
        serializeCanonicalJson(masteredNarration.masteringPolicy)
    ) {
      return {
        sourceState: "configured-authoring",
        durationBudget,
        missingAuthoringInputs: [],
      };
    }
  } catch {
    return {
      sourceState: "configured-authoring",
      durationBudget,
      missingAuthoringInputs: [],
    };
  }
  const measuredDurationBudget = buildProjectDurationBudget({
    ...projectSource,
    timing: semanticTiming,
  });
  const sceneBrief = "production/scene-production-brief.json";
  if (!(await isRegularFile(join(projectRoot, sceneBrief)))) {
    return {
      sourceState: "timing-ready",
      durationBudget: measuredDurationBudget,
      missingAuthoringInputs: [sceneBrief],
    };
  }
  const parsedSceneBrief = await readJsonContract(
    join(projectRoot, sceneBrief),
    SceneProductionBriefSchema,
    "SceneProductionBrief",
  );
  if (
    parsedSceneBrief.semanticTimingFingerprint !== semanticTiming.fingerprint
  ) {
    return {
      sourceState: "timing-ready",
      durationBudget: measuredDurationBudget,
      missingAuthoringInputs: [sceneBrief],
    };
  }
  return {
    sourceState: "production-inputs-ready",
    durationBudget: measuredDurationBudget,
    missingAuthoringInputs: [],
  };
};

const createExpectedNarration = ({
  story,
  narration,
  providerAttemptFingerprint,
}: {
  readonly story: Awaited<
    ReturnType<typeof loadNarrationProjectFiles>
  >["projectSource"]["story"];
  readonly narration: Awaited<
    ReturnType<typeof loadNarrationProjectFiles>
  >["projectSource"]["narration"];
  readonly providerAttemptFingerprint: string;
}): NarrationGenerationExpected => {
  const generationInputFingerprint = computeGenerationInputFingerprint(
    story,
    narration,
  );
  return {
    storyId: story.storyId,
    generationInputFingerprint,
    providerAttemptFingerprint,
    chunks: flattenTtsChunks(story).map((chunk) => {
      const envelope = {
        generationInputFingerprint,
        providerAttemptFingerprint,
        chunkId: chunk.chunkId,
        meaningId: chunk.meaningId,
        ttsText: chunk.ttsText,
      };
      return {
        ...envelope,
        requestFingerprint: computeChunkRequestFingerprint(envelope),
      };
    }),
  };
};

export type NarrationCacheInspection = Readonly<{
  providerRequests: number | null;
  providerCacheHits: number;
  narrationReady?: boolean;
  providerAttemptFingerprint?: string;
  masteringPolicy?: Awaited<
    ReturnType<typeof resolveProducerNarrationInspection>
  >["masteringPolicy"];
  preparationReceipt?: NarrationPreparationReceipt;
}>;

export const inspectNarrationCache = async ({
  rootDir,
  projectId,
  env,
  scope: suppliedScope,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly scope?: ProductionScope;
}): Promise<NarrationCacheInspection> => {
  const scope =
    suppliedScope ??
    createLiveProjectProductionScope({ rootDir, storyId: projectId });
  const { projectSource } = await loadNarrationProjectFiles({
    rootDir: scope.isolatedRoot,
    projectId,
  });
  const inspection = await resolveProducerNarrationInspection({
    rootDir: scope.shared.runtimeRoot,
    env,
    narration: projectSource.narration,
  });
  if (inspection.providerAttemptFingerprint === null) {
    const receiptPath = join(
      scope.projectSourceRoot,
      projectId,
      NARRATION_PREPARATION_RECEIPT,
    );
    const preparedIdentity = (await isRegularFile(receiptPath))
      ? await readJsonContract(
          receiptPath,
          NarrationPreparationReceiptSchema,
          "NarrationPreparationReceipt",
        )
      : null;
    return {
      providerRequests: null,
      providerCacheHits: 0,
      narrationReady: false,
      ...(preparedIdentity === null
        ? {}
        : {
            providerAttemptFingerprint:
              preparedIdentity.providerAttemptFingerprint,
            preparationReceipt: preparedIdentity,
          }),
      masteringPolicy: inspection.masteringPolicy,
    };
  }
  const expected = createExpectedNarration({
    story: projectSource.story,
    narration: projectSource.narration,
    providerAttemptFingerprint: inspection.providerAttemptFingerprint,
  });
  const progress = await loadVerifiedProgress({
    rootDir: scope.narrationWorkRoot,
    storyId: projectId,
    generationInputFingerprint: expected.generationInputFingerprint,
    providerAttemptFingerprint: expected.providerAttemptFingerprint,
    expected,
  });
  const actions = planChunkGeneration({ expected, verifiedProgress: progress });
  return {
    providerRequests: actions.filter(({ kind }) => kind === "generate").length,
    providerCacheHits: actions.filter(({ kind }) => kind !== "generate").length,
    narrationReady: actions.every(({ kind }) => kind === "reuse"),
    providerAttemptFingerprint: inspection.providerAttemptFingerprint,
    masteringPolicy: inspection.masteringPolicy,
  };
};

export const inspectCurrentDelivery = async ({
  rootDir,
  runtimeRootDir = rootDir,
  projectId: rawProjectId,
}: {
  readonly rootDir: string;
  readonly runtimeRootDir?: string;
  readonly projectId: string;
}) => {
  const projectId = StoryIdSchema.parse(rawProjectId);
  const publish = await inspectVerifiedCurrentDelivery({
    rootDir,
    runtimeRootDir,
    storyId: projectId,
  });
  return publish === null
    ? ({
        current: false,
        revisionId: null,
        deliveryBuildId: null,
      } as const)
    : ({
        current: true,
        revisionId: publish.revisionId,
        deliveryBuildId: publish.deliveryBuildId,
      } as const);
};

export const readProductionDiagnosticBaseline = async ({
  rootDir,
  runtimeRootDir = rootDir,
  projectId: rawProjectId,
}: {
  readonly rootDir: string;
  readonly runtimeRootDir?: string;
  readonly projectId: string;
}) => {
  const projectId = StoryIdSchema.parse(rawProjectId);
  const attemptsRoot = join(rootDir, ".producer-attempts", projectId);
  let entries;
  try {
    const metadata = await lstat(attemptsRoot);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error("Execution attempt diagnostic root is unsafe.");
    }
    entries = await readdir(attemptsRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    try {
      const progress = ExecutionAttemptProgressSchema.parse(
        JSON.parse(
          await readFile(
            join(attemptsRoot, entry.name, "progress.generated.json"),
            "utf8",
          ),
        ),
      );
      if (
        progress.storyId === projectId &&
        progress.state === "succeeded" &&
        progress.deliveryResult.status === "verified"
      ) {
        candidates.push(progress);
      }
    } catch {
      // Malformed or old diagnostics are isolated and never affect planning.
    }
  }
  candidates.sort(
    (left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) ||
      right.attemptId.localeCompare(left.attemptId),
  );
  const delivery = await inspectCurrentDelivery({
    rootDir,
    runtimeRootDir,
    projectId,
  });
  const selected =
    (delivery.current
      ? candidates.find(
          (candidate) =>
            candidate.revisionId === delivery.revisionId &&
            candidate.deliveryResult.deliveryBuildId ===
              delivery.deliveryBuildId,
        )
      : undefined) ?? candidates[0];
  if (selected === undefined) return null;
  return {
    kind:
      delivery.current &&
      selected.revisionId === delivery.revisionId &&
      selected.deliveryResult.deliveryBuildId === delivery.deliveryBuildId
        ? ("current-delivery" as const)
        : ("latest-verified-attempt" as const),
    revisionId: selected.revisionId,
    taskSnapshots: selected.taskSnapshots,
  };
};

const collectRegularFiles = async (
  root: string,
  directory = root,
): Promise<Readonly<Record<string, Uint8Array>>> => {
  let metadata;
  try {
    metadata = await lstat(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("Fixed task source root is unsafe.");
  }
  const files: Record<string, Uint8Array> = {};
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort(
    (left, right) => left.name.localeCompare(right.name),
  )) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
      throw new Error("Fixed task source contains a non-regular entry.");
    }
    if (entry.isDirectory()) {
      Object.assign(files, await collectRegularFiles(root, path));
    } else {
      files[relative(root, path).split(sep).join("/")] = Uint8Array.from(
        await readFile(path),
      );
    }
  }
  return files;
};

export const readTemplateSceneFilesForInspection = async ({
  rootDir,
  projectId,
  meaningId,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly meaningId: string;
}) => {
  const source = await collectRegularFiles(
    join(rootDir, "src/projects", projectId, "scenes", meaningId),
  );
  const publicFiles = await collectRegularFiles(
    join(rootDir, "public/projects", projectId, "scenes", meaningId),
  );
  return Object.fromEntries(
    [
      ...Object.entries(source).map(
        ([path, bytes]) => [`src/${path}`, bytes] as const,
      ),
      ...Object.entries(publicFiles).map(
        ([path, bytes]) => [`public/${path}`, bytes] as const,
      ),
    ]
      .filter(([path]) => !isTemplateSceneLiveProjectionPath(path))
      .sort(([left], [right]) => left.localeCompare(right)),
  );
};
