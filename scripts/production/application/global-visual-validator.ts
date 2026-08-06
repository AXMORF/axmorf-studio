import { lstat, readFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import ts from "typescript";
import { z } from "zod";

import {
  GlobalVisualAssignmentSchema,
  GlobalVisualPackageSchema,
  GlobalVisualPlanSchema,
  ResourceCatalogSchema,
  SelectedResourceRefSchema,
  StoryResourcePoolSchema,
  buildGlobalVisualPackage,
  createFingerprint,
  serializeCanonicalJson,
  validateSelectedResourceRef,
  type GlobalVisualAssignment,
  type GlobalVisualPackage,
} from "../../../src/contracts";
import {
  checksumExternalBytes,
  readExternalRegularFile,
} from "../../external-references/project-files";
import { assertGuardedSource } from "../../external-references/source-guard";
import { writeOrCheckSceneArtifact } from "../../scene-package/project-files";

export type GlobalVisualSourceGraph = Readonly<{
  entryPath: string;
  files: readonly { readonly sourcePath: string; readonly checksum: string }[];
  sourceGraphFingerprint: string;
}>;

const resolveSourceFile = async (
  rootDir: string,
  importerPath: string,
  specifier: string,
) => {
  const base = posix.normalize(posix.join(dirname(importerPath), specifier));
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ]) {
    try {
      const metadata = await lstat(join(rootDir, candidate));
      if (metadata.isDirectory()) continue;
      await readExternalRegularFile(rootDir, candidate);
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error(
    `GlobalVisual static import cannot be resolved: ${specifier}.`,
  );
};

const assertGlobalVisualSource = ({
  source,
  sourcePath,
  entryPath,
}: {
  readonly source: string;
  readonly sourcePath: string;
  readonly entryPath: string;
}) => {
  if (/\b(?:animation|animationName|transition)\s*:/u.test(source)) {
    throw new Error(
      "GlobalVisual source cannot use CSS animation or transition.",
    );
  }
  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    sourcePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const forbidden = new Set([
    "Audio",
    "CaptionLayer",
    "NarrativeCore",
    "NarrationAudioTrack",
    "ScenePackage",
    "SceneProductionResult",
    "StoryBeat",
    "GlobalSoundPlan",
    "fetch",
    "WebSocket",
    "XMLHttpRequest",
  ]);
  let violation: string | null = null;
  let usesFrameApi = false;
  let pointerEventsNone = false;
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      if (forbidden.has(node.text)) violation = node.text;
      if (node.text === "useCurrentFrame") usesFrameApi = true;
    }
    if (ts.isJsxText(node) && node.getText(sourceFile).trim().length > 0) {
      violation = "visible text";
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (node.tagName.getText(sourceFile).toLowerCase() === "text") {
        violation = "visible text";
      }
    }
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText(sourceFile) === "pointerEvents" &&
      ts.isStringLiteral(node.initializer) &&
      node.initializer.text === "none"
    ) {
      pointerEventsNone = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (violation !== null) {
    throw new Error(
      `GlobalVisual source crosses its visual-only boundary: ${violation}.`,
    );
  }
  if (sourcePath === entryPath) {
    const namedEntryExports = sourceFile.statements.filter((statement) => {
      const exported =
        ts.canHaveModifiers(statement) &&
        ts
          .getModifiers(statement)
          ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
      if (!exported) return false;
      if (ts.isFunctionDeclaration(statement)) {
        return statement.name?.text === "GlobalVisualLayers";
      }
      if (ts.isVariableStatement(statement)) {
        return statement.declarationList.declarations.some(
          (declaration) =>
            ts.isIdentifier(declaration.name) &&
            declaration.name.text === "GlobalVisualLayers",
        );
      }
      return false;
    }).length;
    if (!usesFrameApi) {
      throw new Error("GlobalVisual entry must use the Remotion frame API.");
    }
    if (!pointerEventsNone) {
      throw new Error("GlobalVisual root must declare pointerEvents none.");
    }
    if (namedEntryExports !== 1) {
      throw new Error(
        "GlobalVisual entry must export GlobalVisualLayers exactly once.",
      );
    }
  }
};

export const collectGlobalVisualSourceGraph = async ({
  rootDir,
  storyId,
}: {
  readonly rootDir: string;
  readonly storyId: string;
}): Promise<GlobalVisualSourceGraph> => {
  const entryPath = `src/projects/${storyId}/global-visual/GlobalVisualLayers.tsx`;
  const ownedRoot = `src/projects/${storyId}/global-visual`;
  const pending = [entryPath];
  const files = new Map<string, Buffer>();
  while (pending.length > 0) {
    const sourcePath = pending.pop();
    if (sourcePath === undefined || files.has(sourcePath)) continue;
    const bytes = await readExternalRegularFile(rootDir, sourcePath);
    const source = bytes.toString("utf8");
    assertGlobalVisualSource({ source, sourcePath, entryPath });
    const guarded = assertGuardedSource({
      source,
      sourcePath,
      allowedBarePackages: new Map([
        ["react", "19.2.3"],
        ["remotion", "4.0.489"],
      ]),
      relativeRoot: "src",
    });
    files.set(sourcePath, bytes);
    for (const relativeImport of guarded.relativeImports) {
      const specifier = posix.relative(dirname(sourcePath), relativeImport);
      const dependencyPath = await resolveSourceFile(
        rootDir,
        sourcePath,
        specifier,
      );
      if (
        !dependencyPath.startsWith(`${ownedRoot}/`) &&
        !dependencyPath.startsWith("src/remotion/capabilities/")
      ) {
        throw new Error(
          "GlobalVisual import escapes owned or approved shared source.",
        );
      }
      if (dependencyPath.includes("/scenes/")) {
        throw new Error("GlobalVisual cannot import Scene source.");
      }
      pending.push(dependencyPath);
    }
  }
  const graphFiles = [...files.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sourcePath, bytes]) => ({
      sourcePath,
      checksum: checksumExternalBytes(bytes),
    }));
  return {
    entryPath,
    files: graphFiles,
    sourceGraphFingerprint: createFingerprint({
      namespace: "global-visual-renderer-source-graph",
      version: 1,
      value: { entryPath, files: graphFiles },
    }),
  };
};

const readJson = async (path: string) =>
  JSON.parse(await readFile(path, "utf8"));

const loadCatalog = async (rootDir: string, storyId: string) => {
  for (const relativePath of [
    `src/projects/${storyId}/generated/resource-catalog.generated.json`,
    "src/remotion/catalog/resource-catalog.generated.json",
  ]) {
    try {
      return ResourceCatalogSchema.parse(
        await readJson(join(rootDir, relativePath)),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error("GlobalVisual ResourceCatalog is missing.");
};

export type GlobalVisualValidation = Readonly<{
  globalVisualPackage: GlobalVisualPackage;
  mechanicalCheckFingerprint: string;
}>;

export const validateGlobalVisualFromProjectFiles = async ({
  rootDir,
  assignment: rawAssignment,
}: {
  readonly rootDir: string;
  readonly assignment: GlobalVisualAssignment;
}): Promise<GlobalVisualValidation> => {
  const assignment = GlobalVisualAssignmentSchema.parse(rawAssignment);
  const projectRoot = join(rootDir, "src/projects", assignment.storyId);
  const [plan, selectedEnvelope, catalog, pool, graph] = await Promise.all([
    readJson(join(projectRoot, "global-visual-plan.json")).then(
      GlobalVisualPlanSchema.parse,
    ),
    readJson(join(projectRoot, "global-visual/selected-resources.json")),
    loadCatalog(rootDir, assignment.storyId),
    readJson(join(projectRoot, "production/story-resource-pool.json")).then(
      StoryResourcePoolSchema.parse,
    ),
    collectGlobalVisualSourceGraph({ rootDir, storyId: assignment.storyId }),
  ]);
  if (
    plan.storyId !== assignment.storyId ||
    plan.compositionId !== assignment.compositionId ||
    plan.width !== assignment.timeline.width ||
    plan.height !== assignment.timeline.height ||
    plan.fps !== assignment.timeline.fps ||
    plan.durationInFrames !== assignment.timeline.durationInFrames ||
    plan.catalogFingerprint !== assignment.resourceCatalogFingerprint ||
    serializeCanonicalJson(plan.captionSafeArea) !==
      serializeCanonicalJson(assignment.timeline.captionSafeArea)
  ) {
    throw new Error("GlobalVisualPlan is stale against its assignment.");
  }
  if (
    pool.poolFingerprint !== assignment.resourcePoolFingerprint ||
    catalog.catalogFingerprint !== assignment.resourceCatalogFingerprint
  ) {
    throw new Error("GlobalVisual resources are stale against the assignment.");
  }
  const envelope = z
    .object({
      schemaVersion: z.literal(1),
      selectedResources: z.array(SelectedResourceRefSchema).max(128).readonly(),
    })
    .strict()
    .parse(selectedEnvelope);
  const catalogById = new Map(
    catalog.entries.map((entry) => [entry.descriptor.id, entry] as const),
  );
  for (const selected of envelope.selectedResources) {
    if (
      selected.role !== "global-visual" ||
      !assignment.allowedResourceIds.includes(selected.resourceId)
    ) {
      throw new Error(
        "GlobalVisual selected resource is outside the assignment allowlist.",
      );
    }
    const entry = catalogById.get(selected.resourceId);
    if (entry === undefined)
      throw new Error("GlobalVisual selected resource is unknown.");
    validateSelectedResourceRef({
      selected,
      descriptor: entry.descriptor,
      currentCatalogFingerprint: catalog.catalogFingerprint,
    });
    if (entry.descriptor.kind === "asset") {
      const bytes = await readExternalRegularFile(
        rootDir,
        entry.descriptor.localPath,
      );
      if (checksumExternalBytes(bytes) !== entry.descriptor.checksum) {
        throw new Error("GlobalVisual selected asset checksum is stale.");
      }
    }
  }
  const globalVisualPackage = buildGlobalVisualPackage({
    storyId: assignment.storyId,
    compositionId: assignment.compositionId,
    assignmentFingerprint: assignment.assignmentFingerprint,
    requirementsFingerprint: assignment.requirementsFingerprint,
    semanticTimingFingerprint: assignment.semanticTimingFingerprint,
    visualStyleFingerprint: assignment.visualStyleFingerprint,
    readabilityPolicyFingerprint: assignment.readabilityPolicyFingerprint,
    globalVisualPlanFingerprint: plan.planFingerprint,
    rendererId: "project-global-visual",
    rendererSourceGraphFingerprint: graph.sourceGraphFingerprint,
    selectedResources: envelope.selectedResources,
  });
  const destination = join(
    projectRoot,
    "global-visual/generated/global-visual-package.generated.json",
  );
  await writeOrCheckSceneArtifact({
    destination,
    value: globalVisualPackage,
    mode: "write",
  });
  await writeOrCheckSceneArtifact({
    destination,
    value: globalVisualPackage,
    mode: "check",
  });
  const checked = GlobalVisualPackageSchema.parse(await readJson(destination));
  if (checked.packageFingerprint !== globalVisualPackage.packageFingerprint) {
    throw new Error("GlobalVisualPackage write/check drift was detected.");
  }
  return {
    globalVisualPackage,
    mechanicalCheckFingerprint: createFingerprint({
      namespace: "production-global-visual-mechanical-check",
      version: 1,
      value: {
        assignmentFingerprint: assignment.assignmentFingerprint,
        packageFingerprint: globalVisualPackage.packageFingerprint,
        rendererSourceGraphFingerprint: graph.sourceGraphFingerprint,
        selectedResourcesFingerprint:
          globalVisualPackage.selectedResourcesFingerprint,
      },
    }),
  };
};
