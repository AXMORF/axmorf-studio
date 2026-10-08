import { buildRendererRegistry } from "./domain";
import {
  writeOrCheckRendererRegistry,
  type RendererRegistryMode,
} from "./project-files";

export const generateRendererRegistry = async ({
  mode,
  destination,
  ...input
}: {
  readonly mode: RendererRegistryMode;
  readonly destination: string;
  readonly rootDir: string;
  readonly projectId: unknown;
  readonly coverage: unknown;
  readonly packages: readonly unknown[];
}) => {
  const registry = await buildRendererRegistry(input);
  if (registry === null) return null;
  await writeOrCheckRendererRegistry({
    destination,
    source: registry.source,
    mode,
  });
  return registry;
};

export const generateRendererRegistryFromProjectFiles = async ({
  rootDir,
  projectId,
  mode,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly mode: RendererRegistryMode;
}) => {
  const projectRoot = join(rootDir, "src/projects", projectId);
  const coverage = SceneCoverageMapSchema.parse(
    await readJsonFile(
      join(projectRoot, "generated/scene-coverage.generated.json"),
    ),
  );
  const ready = coverage.entries.filter((entry) => entry.status === "ready");
  const story =
    ready.length === 0
      ? null
      : StorySpecSchema.parse(
          await readJsonFile(join(projectRoot, "story.json")),
        );
  if (
    story !== null &&
    (story.storyId !== projectId ||
      serializeCanonicalJson(story.beats.map(({ meaningId }) => meaningId)) !==
        serializeCanonicalJson(coverage.storyBeatOrder))
  ) {
    throw new Error("Renderer coverage is stale against current Story order.");
  }
  const groups = story === null ? [] : resolveStorySceneGroups(story);
  const groupByMember = new Map(
    groups.flatMap((group) =>
      group.beats.map((beat) => [beat.meaningId, group] as const),
    ),
  );
  const ownerIds = [
    ...new Set(
      ready.map((entry) => {
        const group = groupByMember.get(entry.meaningId);
        if (group === undefined)
          throw new Error("Ready Renderer coverage has no owning Story Scene.");
        return group.meaningId;
      }),
    ),
  ];
  const packages = await Promise.all(
    ownerIds.map(async (meaningId) => {
      const scenePackage = ScenePackageSchema.parse(
        await readJsonFile(
          join(
            projectRoot,
            "scenes",
            meaningId,
            "generated/scene-package.generated.json",
          ),
        ),
      );
      const group = groupByMember.get(meaningId)!;
      if (
        serializeCanonicalJson(
          scenePackage.coveredMeaningIds ?? [scenePackage.meaningId],
        ) !== serializeCanonicalJson(group.beats.map((beat) => beat.meaningId))
      ) {
        throw new Error(
          "Renderer Scene package ownership is stale against current Story groups.",
        );
      }
      return scenePackage;
    }),
  );
  return generateRendererRegistry({
    mode,
    destination: join(projectRoot, "renderer-registry.generated.ts"),
    rootDir,
    projectId,
    coverage,
    packages,
  });
};
import { join } from "node:path";

import {
  SceneCoverageMapSchema,
  ScenePackageSchema,
  StorySpecSchema,
  resolveStorySceneGroups,
  serializeCanonicalJson,
} from "@axmorf/studio/contracts";
import { readJsonFile } from "../scene-package/project-files";
