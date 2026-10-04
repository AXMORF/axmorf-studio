import { lstat, readdir } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import ts from "typescript";

import {
  SCENE_PRIOR_SOURCE_PATH,
  ScenePackageSchema,
  ScenePriorSourceIndexSchema,
  SceneTaskInputSchema,
  ProjectRevisionEditableAuthoringSchema,
  StoryIdSchema,
  MeaningIdSchema,
  buildSceneContinuityContract,
  buildScenePriorSource,
  computeUtf8Checksum,
  serializeCanonicalJson,
  type ScenePriorSource,
  type SceneTaskInput,
} from "@axmorf/studio/contracts";
import { collectRendererSourceGraph } from "../../renderer-registry/domain";
import { buildScenePackage } from "../../scene-package/domain";
import { parseSceneSelectedResourcesFile } from "../../scene-package/generate";
import {
  assertRealRepositoryDirectoryChain,
  readContainedRegularFile,
} from "../adapters/project-create-store";

type ProjectRevisionEditableAuthoring = ReturnType<
  typeof ProjectRevisionEditableAuthoringSchema.parse
>;

export const readScenePriorSourceIndex = async ({
  rootDir,
  storyId,
}: {
  readonly rootDir: string;
  readonly storyId: string;
}) => {
  StoryIdSchema.parse(storyId);
  let bytes;
  try {
    bytes = await readContainedRegularFile({
      rootDir,
      relativePath: `src/projects/${storyId}/${SCENE_PRIOR_SOURCE_PATH}`,
      label: "Scene prior source index",
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const index = ScenePriorSourceIndexSchema.parse(
    JSON.parse(bytes.toString("utf8")),
  );
  if (index.storyId !== storyId)
    throw new Error("Scene prior source index is cross-bound.");
  return index;
};

export const affectedPriorSourceMeaningIds = ({
  before,
  after,
}: {
  readonly before: ProjectRevisionEditableAuthoring;
  readonly after: ProjectRevisionEditableAuthoring;
}) => {
  const globalChanged = [
    "brief",
    "story",
    "visualStyle",
    "boundaryScenes",
    "sound",
  ].some(
    (section) =>
      serializeCanonicalJson(
        before[section as keyof ProjectRevisionEditableAuthoring] ?? null,
      ) !==
      serializeCanonicalJson(
        after[section as keyof ProjectRevisionEditableAuthoring] ?? null,
      ),
  );
  const sceneInputs = (authoring: ProjectRevisionEditableAuthoring) => {
    const byMeaning = new Map(
      authoring.scenes.map((scene) => [scene.meaningId, scene] as const),
    );
    return new Map(
      authoring.story.beats.map((beat, position) => {
        const brief = byMeaning.get(beat.meaningId)!;
        const neighbor = (offset: number) => {
          const adjacent = authoring.story.beats[position + offset];
          return adjacent === undefined
            ? null
            : { beat: adjacent, brief: byMeaning.get(adjacent.meaningId)! };
        };
        return [
          beat.meaningId,
          {
            brief,
            handoffs: buildSceneContinuityContract({
              storyId: authoring.story.storyId,
              beat,
              brief,
              previous: neighbor(-1),
              next: neighbor(1),
            }),
          },
        ] as const;
      }),
    );
  };
  const previous = sceneInputs(before);
  return [...sceneInputs(after)].flatMap(([meaningId, scene]) =>
    globalChanged ||
    serializeCanonicalJson(scene) !==
      serializeCanonicalJson(previous.get(meaningId))
      ? [meaningId]
      : [],
  );
};

const assertSceneLocalImports = (
  sceneRoot: string,
  file: { readonly path: string; readonly content: string },
) => {
  const sourcePath = `${sceneRoot}/${file.path}`;
  const parsed = ts.createSourceFile(
    sourcePath,
    file.content,
    ts.ScriptTarget.Latest,
    true,
    file.path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text.startsWith(".")
    ) {
      const imported = posix.normalize(
        posix.join(dirname(sourcePath), node.moduleSpecifier.text),
      );
      if (
        !imported.startsWith(`${sceneRoot}/`) &&
        !imported.startsWith("src/remotion/capabilities/") &&
        !imported.startsWith("src/remotion/runtime/readability/")
      ) {
        throw new Error(
          "Prior Scene import escapes its meaning-local source or approved runtime capability.",
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
};

export const snapshotScenePriorSource = async ({
  rootDir,
  runtimeRootDir = rootDir,
  storyId,
  meaningId,
  brief,
}: {
  readonly rootDir: string;
  readonly runtimeRootDir?: string;
  readonly storyId: string;
  readonly meaningId: string;
  readonly brief: ScenePriorSource["brief"];
}): Promise<ScenePriorSource | null> => {
  StoryIdSchema.parse(storyId);
  MeaningIdSchema.parse(meaningId);
  const sceneRoot = `src/projects/${storyId}/scenes/${meaningId}`;
  await assertRealRepositoryDirectoryChain({
    rootDir,
    relativePath: sceneRoot,
    allowMissingTail: true,
  });
  try {
    await lstat(join(rootDir, sceneRoot));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  await readContainedRegularFile({
    rootDir,
    relativePath: `${sceneRoot}/Renderer.tsx`,
    label: "Prior Scene Renderer",
  });
  const files: ScenePriorSource["files"][number][] = [];
  const walk = async (directory: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      const absolutePath = join(directory, entry.name);
      const state = await lstat(absolutePath);
      if (state.isSymbolicLink() || (!state.isDirectory() && !state.isFile()))
        throw new Error("Prior Scene tree contains an unsafe entry.");
      if (state.isDirectory()) {
        await walk(absolutePath, path);
        continue;
      }
      const source = /\.(?:ts|tsx)$/u.test(path);
      const lineage = /(?:^|\/)localization-manifest\.generated\.json$/u.test(
        path,
      );
      const license =
        /(?:^|\/)(?:LICENSE|COPYING|NOTICE|ATTRIBUTION|THIRD_PARTY_NOTICES)(?:[._-].*)?$/iu.test(
          path,
        );
      if (!source && !lineage && !license && !path.endsWith(".json")) continue;
      const bytes = await readContainedRegularFile({
        rootDir,
        relativePath: `${sceneRoot}/${path}`,
        label: "Prior Scene file",
      });
      const content = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(bytes);
      const role = source
        ? "source"
        : lineage
          ? "lineage"
          : license
            ? "license"
            : "declaration";
      const file = {
        path,
        role,
        content,
        checksum: computeUtf8Checksum(content),
        sizeBytes: bytes.byteLength,
      } as const;
      if (source) assertSceneLocalImports(sceneRoot, file);
      files.push(file);
    }
  };
  await walk(join(rootDir, sceneRoot), "");
  files.sort((a, b) => a.path.localeCompare(b.path));
  const json = (path: string) => {
    const file = files.find((file) => file.path === path);
    if (file === undefined)
      throw new Error(`Prior Scene declaration is missing: ${path}.`);
    return JSON.parse(file.content) as unknown;
  };
  const scenePackage = ScenePackageSchema.parse(
    json("generated/scene-package.generated.json"),
  );
  const task = SceneTaskInputSchema.parse(json("task-input.generated.json"));
  if (
    scenePackage.storyId !== storyId ||
    scenePackage.meaningId !== meaningId ||
    task.storyId !== storyId ||
    task.meaningId !== meaningId ||
    scenePackage.taskInputFingerprint !== task.taskInputFingerprint
  )
    throw new Error("Prior Scene package is cross-bound or stale.");
  const bundle = {
    task,
    visual: json("visual-plan.json"),
    shots: json("shot-plan.json"),
    anchors: json("sync-anchors.json"),
    sound: json("sound-plan.json"),
    selection: json("shot-recipe-selection.json"),
    fidelityReceipt: json("generated/reference-fidelity.generated.json"),
    selectedResources: parseSceneSelectedResourcesFile(
      json("selected-resources.json"),
    ).selectedResources,
  };
  const graph = await collectRendererSourceGraph({
    rootDir,
    runtimeRootDir,
    projectId: storyId,
    rendererPath: `${sceneRoot}/Renderer.tsx`,
  });
  if (
    graph.sourceGraphFingerprint !==
    scenePackage.rendererBinding.rendererSourceFingerprint
  )
    throw new Error("Prior Scene package renderer source graph is stale.");
  const rebuiltPackage = buildScenePackage({
    ...bundle,
    rendererBinding: scenePackage.rendererBinding,
    current: {
      timingBeat: task.timingBeat,
      semanticTimingFingerprint: scenePackage.semanticTimingFingerprint,
      visualStyleFingerprint: task.visualStyleFingerprint,
      resourceCatalogFingerprint: task.resourceCatalogFingerprint,
      snapshotFingerprints: task.allowedSnapshots.map(
        ({ snapshotFingerprint }) => snapshotFingerprint,
      ),
      rendererSourceFingerprint: graph.sourceGraphFingerprint,
      visualRuntimeVersion: scenePackage.visualRuntimeVersion,
      sceneAudioRuntimeVersion: scenePackage.sceneAudioRuntimeVersion,
    },
  });
  if (
    serializeCanonicalJson(rebuiltPackage) !==
    serializeCanonicalJson(scenePackage)
  )
    throw new Error("Prior Scene package declarations are stale.");
  return buildScenePriorSource({
    storyId,
    meaningId,
    brief,
    rendererSourceFingerprint: graph.sourceGraphFingerprint,
    scenePackageFingerprint: scenePackage.packageFingerprint,
    files,
  });
};

/** A policy/contract miss may rebind the verified current Scene, never history. */
export const snapshotUnchangedCurrentScene = async ({
  rootDir,
  runtimeRootDir,
  task,
  brief,
}: {
  readonly rootDir: string;
  readonly runtimeRootDir: string;
  readonly task: SceneTaskInput;
  readonly brief: ScenePriorSource["brief"];
}) => {
  SceneTaskInputSchema.parse(task);
  let bytes;
  try {
    await assertRealRepositoryDirectoryChain({
      rootDir,
      relativePath: task.allowedDirectories.sceneRoot,
      allowMissingTail: true,
    });
    await lstat(
      join(
        rootDir,
        task.allowedDirectories.sceneRoot,
        "task-input.generated.json",
      ),
    );
    bytes = await readContainedRegularFile({
      rootDir,
      relativePath: `${task.allowedDirectories.sceneRoot}/task-input.generated.json`,
      label: "Current owning Scene task input",
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const current = SceneTaskInputSchema.parse(
    JSON.parse(bytes.toString("utf8")),
  );
  if (current.taskInputFingerprint !== task.taskInputFingerprint) return null;
  return snapshotScenePriorSource({
    rootDir,
    runtimeRootDir,
    storyId: task.storyId,
    meaningId: task.meaningId,
    brief,
  });
};

export const freezeRevisionScenePriorSources = async ({
  rootDir,
  runtimeRootDir,
  before,
  after,
}: {
  readonly rootDir: string;
  readonly runtimeRootDir: string;
  readonly before: ProjectRevisionEditableAuthoring;
  readonly after: ProjectRevisionEditableAuthoring;
}) => {
  const storyId = after.story.storyId;
  const prior = await readScenePriorSourceIndex({ rootDir, storyId });
  const scenes = new Map(
    prior?.scenes.map((scene) => [scene.meaningId, scene] as const),
  );
  for (const meaningId of affectedPriorSourceMeaningIds({ before, after })) {
    const brief = before.scenes.find((scene) => scene.meaningId === meaningId);
    if (brief === undefined)
      throw new Error("Revision prior Scene authoring is missing.");
    const snapshot = await snapshotScenePriorSource({
      rootDir,
      runtimeRootDir,
      storyId,
      meaningId,
      brief,
    });
    if (snapshot === null) scenes.delete(meaningId);
    else scenes.set(meaningId, snapshot);
  }
  return scenes.size === 0 && prior === null
    ? null
    : ScenePriorSourceIndexSchema.parse({
        schemaVersion: 1,
        contractVersion: "scene-prior-source-index-v1",
        storyId,
        scenes: [...scenes.values()].sort((a, b) =>
          a.meaningId.localeCompare(b.meaningId),
        ),
      });
};
