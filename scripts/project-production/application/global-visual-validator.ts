import { lstat, readFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import ts from "typescript";
import { createFingerprint } from "../../../src/contracts";
import { checksumExternalBytes } from "../../external-references/project-files";
import { assertGuardedSource } from "../../external-references/source-guard";
import { compileTypeScriptImportGraph } from "./typescript-compile";
import type { ProductionLocations } from "./production-locations";

export type GlobalVisualSourceGraph = Readonly<{
  entryPath: string;
  files: readonly { readonly sourcePath: string; readonly checksum: string }[];
  sourceGraphFingerprint: string;
}>;

type GlobalVisualSourceLocations = Pick<
  ProductionLocations,
  "layoutKind" | "projectSourceRoot" | "runtimeResources"
>;

const globalVisualRuntimeSourceRoot = (
  locations: GlobalVisualSourceLocations,
) =>
  locations.layoutKind === "repository"
    ? locations.runtimeResources
    : join(locations.runtimeResources, "source");

const resolveGlobalVisualLogicalPath = ({
  locations,
  storyId,
  sourcePath,
}: {
  readonly locations: GlobalVisualSourceLocations;
  readonly storyId: string;
  readonly sourcePath: string;
}) => {
  const projectPrefix = `src/projects/${storyId}/`;
  if (sourcePath.startsWith(projectPrefix)) {
    return join(
      locations.projectSourceRoot,
      storyId,
      sourcePath.slice(projectPrefix.length),
    );
  }
  if (sourcePath.startsWith("src/remotion/capabilities/")) {
    return join(globalVisualRuntimeSourceRoot(locations), sourcePath);
  }
  throw new Error("GlobalVisual source path is outside explicit source roots.");
};

const readGlobalVisualRegularFile = async ({
  locations,
  storyId,
  sourcePath,
}: {
  readonly locations: GlobalVisualSourceLocations;
  readonly storyId: string;
  readonly sourcePath: string;
}) => {
  const absolutePath = resolveGlobalVisualLogicalPath({
    locations,
    storyId,
    sourcePath,
  });
  const metadata = await lstat(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("GlobalVisual source must be a regular non-symbolic file.");
  }
  return readFile(absolutePath);
};

export const assertGlobalVisualLayersComponentInterface = async ({
  locations,
  storyId,
}: {
  readonly locations: GlobalVisualSourceLocations;
  readonly storyId: string;
}) => {
  const logicalRootPath = `src/projects/${storyId}/global-visual/global-visual-interface.generated.tsx`;
  const rootPath =
    locations.layoutKind === "repository"
      ? join(
          locations.projectSourceRoot,
          storyId,
          "global-visual/global-visual-interface.generated.tsx",
        )
      : join(globalVisualRuntimeSourceRoot(locations), logicalRootPath);
  const virtualSource = `import type {GlobalVisualLayersComponent} from "../../../remotion/runtime/global-visual";
import {GlobalVisualLayers} from "./GlobalVisualLayers";

const CheckedGlobalVisualLayers: GlobalVisualLayersComponent<typeof GlobalVisualLayers> = GlobalVisualLayers;
export const GlobalVisualLayersInterfaceProof = CheckedGlobalVisualLayers;
`;
  if (locations.layoutKind === "repository") {
    compileTypeScriptImportGraph({
      rootDir: globalVisualRuntimeSourceRoot(locations),
      rootPath,
      typescriptLibRoot: join(
        locations.runtimeResources,
        "node_modules/typescript/lib",
      ),
      label: "GlobalVisualLayers component interface compile",
      virtualSource,
    });
    return;
  }
  const entryPath = join(
    globalVisualRuntimeSourceRoot(locations),
    `src/projects/${storyId}/global-visual/GlobalVisualLayers.tsx`,
  );
  const entrySource = await readFile(
    join(
      locations.projectSourceRoot,
      storyId,
      "global-visual/GlobalVisualLayers.tsx",
    ),
    "utf8",
  );
  compileTypeScriptImportGraph({
    rootDir: globalVisualRuntimeSourceRoot(locations),
    rootPath,
    typescriptLibRoot: join(
      locations.runtimeResources,
      "node_modules/typescript/lib",
    ),
    label: "GlobalVisualLayers component interface compile",
    virtualSources: {
      [rootPath]: virtualSource,
      [entryPath]: entrySource,
    },
  });
};

const resolveSourceFile = async (
  locations: GlobalVisualSourceLocations,
  storyId: string,
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
      const metadata = await lstat(
        resolveGlobalVisualLogicalPath({
          locations,
          storyId,
          sourcePath: candidate,
        }),
      );
      if (metadata.isDirectory()) continue;
      await readGlobalVisualRegularFile({
        locations,
        storyId,
        sourcePath: candidate,
      });
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error(
    `GlobalVisual static import cannot be resolved: ${specifier}.`,
  );
};

export const assertGlobalVisualSource = ({
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
    "SoundContribution",
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
  locations,
  storyId,
}: {
  readonly locations: GlobalVisualSourceLocations;
  readonly storyId: string;
}): Promise<GlobalVisualSourceGraph> => {
  const entryPath = `src/projects/${storyId}/global-visual/GlobalVisualLayers.tsx`;
  const ownedRoot = `src/projects/${storyId}/global-visual`;
  const pending = [entryPath];
  const files = new Map<string, Buffer>();
  while (pending.length > 0) {
    const sourcePath = pending.pop();
    if (sourcePath === undefined || files.has(sourcePath)) continue;
    const bytes = await readGlobalVisualRegularFile({
      locations,
      storyId,
      sourcePath,
    });
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
        locations,
        storyId,
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
  await assertGlobalVisualLayersComponentInterface({
    locations,
    storyId,
  });
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
