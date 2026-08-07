import { execFile } from "node:child_process";
import { lstat, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import {
  ResourceCatalogSchema,
  SceneTaskInputSchema,
  VisualStyleSpecSchema,
  buildNotApplicableFidelityReceipt,
  buildSceneSoundPlan,
  buildSceneSyncAnchors,
  buildSceneVisualPlan,
  buildShotPlanSet,
  buildShotRecipeSelection,
  serializeCanonicalJson,
  validateScenePlanBundle,
  validateSelectedResourceRef,
  type ResourceCatalog,
} from "../../../../contracts";
import { deriveCatalogWithoutProjectOwnedDescriptors } from "../../../../../scripts/catalog/domain";
import { collectRendererSourceGraph } from "../../../../../scripts/renderer-registry/domain";
import {
  readJsonFile,
  writeOrCheckSceneArtifact,
  type SceneArtifactMode,
} from "../../../../../scripts/scene-package/project-files";
import { GPS_M7_MEANING_IDS, buildGpsM7FrozenInputs } from "./scene-inputs";

const execFileAsync = promisify(execFile);
const STORY_ID = "gps-relativity";

type MeaningId = (typeof GPS_M7_MEANING_IDS)[number];

const isMeaningId = (value: string): value is MeaningId =>
  GPS_M7_MEANING_IDS.includes(value as MeaningId);

const sceneRoot = (meaningId: MeaningId) =>
  `src/projects/${STORY_ID}/scenes/${meaningId}`;

const readRegularText = async (path: string): Promise<string> => {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new Error("M7 GPS authoring inputs must be regular files.");
  }
  return readFile(path, "utf8");
};

const readSceneJson = async (
  rootDir: string,
  meaningId: MeaningId,
  file: string,
): Promise<unknown> => {
  try {
    return await readJsonFile(join(rootDir, sceneRoot(meaningId), file));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`M7 GPS Scene authored input is missing: ${file}.`);
    }
    throw error;
  }
};

const without = (
  raw: unknown,
  ...fields: readonly string[]
): Record<string, unknown> => {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("M7 GPS Scene authored input must be an object.");
  }
  const result = { ...(raw as Record<string, unknown>) };
  for (const field of fields) delete result[field];
  return result;
};

const getCatalogEntry = (catalog: ResourceCatalog, resourceId: string) => {
  const entry = catalog.entries.find(
    ({ descriptor }) => descriptor.id === resourceId,
  );
  if (entry === undefined) {
    throw new Error(`M7 GPS selected resource is missing: ${resourceId}.`);
  }
  return entry;
};

const normalizePlanResource = ({
  raw,
  role,
  catalog,
}: {
  readonly raw: unknown;
  readonly role: "scene-ambience" | "scene-sfx";
  readonly catalog: ResourceCatalog;
}): unknown => {
  const resource = without(raw);
  if (
    Object.keys(resource).length !== 1 ||
    typeof resource.resourceId !== "string"
  ) {
    return raw;
  }
  const entry = getCatalogEntry(catalog, resource.resourceId);
  return validateSelectedResourceRef({
    selected: {
      schemaVersion: 1,
      resourceId: entry.descriptor.id,
      kind: entry.descriptor.kind,
      role,
      descriptorFingerprint: entry.descriptorFingerprint,
      catalogFingerprint: catalog.catalogFingerprint,
    },
    descriptor: entry.descriptor,
    currentCatalogFingerprint: catalog.catalogFingerprint,
  });
};

const normalizeSoundResources = (
  rawSound: Record<string, unknown>,
  catalog: ResourceCatalog,
): Record<string, unknown> => ({
  ...rawSound,
  ambience:
    rawSound.ambience === null || rawSound.ambience === undefined
      ? null
      : normalizePlanResource({
          raw: rawSound.ambience,
          role: "scene-ambience",
          catalog,
        }),
  cues: Array.isArray(rawSound.cues)
    ? rawSound.cues.map((rawCue) => {
        const cue = without(rawCue);
        return {
          ...cue,
          resource: normalizePlanResource({
            raw: cue.resource,
            role: "scene-sfx",
            catalog,
          }),
        };
      })
    : rawSound.cues,
});

const normalizeSelectedResourceRequests = (
  raw: unknown,
): readonly { readonly resourceId: string; readonly role: string }[] => {
  const value = without(raw);
  if (value.schemaVersion !== 1 || !Array.isArray(value.selectedResources)) {
    throw new Error("M7 GPS selected-resources declaration is invalid.");
  }
  return value.selectedResources.map((entry) => {
    const item = without(entry);
    if (item.selected !== undefined) {
      const selected = without(item.selected);
      if (
        typeof selected.resourceId !== "string" ||
        typeof selected.role !== "string"
      ) {
        throw new Error("M7 GPS selected resource identity is invalid.");
      }
      return { resourceId: selected.resourceId, role: selected.role };
    }
    if (typeof item.resourceId !== "string" || typeof item.role !== "string") {
      throw new Error("M7 GPS selected resource request is invalid.");
    }
    return { resourceId: item.resourceId, role: item.role };
  });
};

const buildSelectedResources = ({
  raw,
  catalog,
  task,
}: {
  readonly raw: unknown;
  readonly catalog: ResourceCatalog;
  readonly task: ReturnType<typeof SceneTaskInputSchema.parse>;
}) => {
  const requests = normalizeSelectedResourceRequests(raw);
  if (
    new Set(requests.map(({ resourceId }) => resourceId)).size !==
    requests.length
  ) {
    throw new Error("M7 GPS selected resource identities must be unique.");
  }
  return requests
    .map(({ resourceId, role }) => {
      if (
        !task.allowedResourceIds.some((allowedId) => allowedId === resourceId)
      ) {
        throw new Error(
          "M7 GPS selected resource is outside the Scene allowlist.",
        );
      }
      const entry = getCatalogEntry(catalog, resourceId);
      const selected = {
        schemaVersion: 1 as const,
        resourceId: entry.descriptor.id,
        kind: entry.descriptor.kind,
        role,
        descriptorFingerprint: entry.descriptorFingerprint,
        catalogFingerprint: catalog.catalogFingerprint,
      };
      return {
        selected: validateSelectedResourceRef({
          selected,
          descriptor: entry.descriptor,
          currentCatalogFingerprint: catalog.catalogFingerprint,
        }),
        descriptor: entry.descriptor,
      };
    })
    .sort((left, right) =>
      left.selected.resourceId.localeCompare(right.selected.resourceId),
    );
};

const requiredResourceIds = ({
  visual,
  shots,
  sound,
}: {
  readonly visual: ReturnType<typeof buildSceneVisualPlan>;
  readonly shots: ReturnType<typeof buildShotPlanSet>;
  readonly sound: ReturnType<typeof buildSceneSoundPlan>;
}) =>
  new Set([
    ...visual.visualResourceIds,
    ...shots.shots.flatMap((shot) => shot.visualResourceIds),
    ...(sound.ambience ? [sound.ambience.resourceId] : []),
    ...sound.cues.map((cue) => cue.resource.resourceId),
  ]);

export const authorGpsM7Scene = async ({
  rootDir,
  meaningId,
  mode,
}: {
  readonly rootDir: string;
  readonly meaningId: MeaningId;
  readonly mode: SceneArtifactMode;
}) => {
  const frozen = await buildGpsM7FrozenInputs(rootDir);
  const expectedTask = frozen.tasks.find(
    (candidate) => candidate.meaningId === meaningId,
  );
  if (expectedTask === undefined) {
    throw new Error("M7 GPS frozen task is missing.");
  }
  const task = SceneTaskInputSchema.parse(
    await readSceneJson(rootDir, meaningId, "task-input.generated.json"),
  );
  if (serializeCanonicalJson(task) !== serializeCanonicalJson(expectedTask)) {
    throw new Error("M7 GPS frozen task input is stale.");
  }
  const visualStyle = VisualStyleSpecSchema.parse(
    JSON.parse(
      await readRegularText(
        join(rootDir, "src/projects/gps-relativity/visual-style.json"),
      ),
    ),
  );
  if (
    visualStyle.storyId !== STORY_ID ||
    task.visualStyleFingerprint !== frozen.visualStyleFingerprint
  ) {
    throw new Error("M7 GPS visual style identity is stale.");
  }
  const projectCatalog = ResourceCatalogSchema.parse(
    JSON.parse(
      await readRegularText(
        join(
          rootDir,
          "src/projects/gps-relativity/generated/resource-catalog.generated.json",
        ),
      ),
    ),
  );
  const catalog = deriveCatalogWithoutProjectOwnedDescriptors(
    projectCatalog,
    STORY_ID,
  );
  if (catalog.catalogFingerprint !== task.resourceCatalogFingerprint) {
    throw new Error("M7 GPS Catalog identity is stale.");
  }
  const duration = task.timingBeat.endFrame - task.timingBeat.startFrame;
  const rawVisual = without(
    await readSceneJson(rootDir, meaningId, "visual-plan.json"),
    "schemaVersion",
    "visualPlanFingerprint",
  );
  const rawShots = without(
    await readSceneJson(rootDir, meaningId, "shot-plan.json"),
    "schemaVersion",
    "shotPlanFingerprint",
  );
  const rawAnchors = without(
    await readSceneJson(rootDir, meaningId, "sync-anchors.json"),
    "schemaVersion",
    "syncAnchorFingerprint",
  );
  const rawSound = without(
    await readSceneJson(rootDir, meaningId, "sound-plan.json"),
    "schemaVersion",
    "soundPlanFingerprint",
  );
  const visual = buildSceneVisualPlan({
    ...rawVisual,
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId,
  } as unknown as Parameters<typeof buildSceneVisualPlan>[0]);
  const shots = buildShotPlanSet({
    ...rawShots,
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId,
    sceneDurationInFrames: duration,
  } as unknown as Parameters<typeof buildShotPlanSet>[0]);
  const anchors = buildSceneSyncAnchors({
    ...rawAnchors,
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId,
    sceneDurationInFrames: duration,
  } as unknown as Parameters<typeof buildSceneSyncAnchors>[0]);
  const sound = buildSceneSoundPlan({
    ...normalizeSoundResources(rawSound, catalog),
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId,
    sceneDurationInFrames: duration,
  } as unknown as Parameters<typeof buildSceneSoundPlan>[0]);
  validateScenePlanBundle({
    taskInputFingerprint: task.taskInputFingerprint,
    meaningId,
    sceneDurationInFrames: duration,
    allowedResourceIds: task.allowedResourceIds,
    visualPlan: visual,
    shotPlan: shots,
    syncAnchors: anchors,
    soundPlan: sound,
  });
  const rawSelection = without(
    await readSceneJson(rootDir, meaningId, "shot-recipe-selection.json"),
    "schemaVersion",
    "selectionFingerprint",
    "taskInputFingerprint",
  );
  const selection = buildShotRecipeSelection({
    taskInputFingerprint: task.taskInputFingerprint,
    selections: Array.isArray(rawSelection.selections)
      ? rawSelection.selections
      : [],
  });
  if (
    selection.selections.some(
      (item) =>
        !task.allowedSnapshots.some(
          (snapshot) =>
            snapshot.snapshotFingerprint === item.snapshotFingerprint &&
            snapshot.allowedCardIds.includes(item.cardId),
        ),
    )
  ) {
    throw new Error("M7 GPS recipe selection is outside the frozen allowlist.");
  }
  const recipeMode =
    selection.selections.length === 0
      ? "empty"
      : new Set(selection.selections.map((item) => item.mode)).size === 1
        ? selection.selections[0]?.mode
        : "mixed";
  if (
    recipeMode === "mixed" ||
    recipeMode === "exact-demo-localized" ||
    visual.recipeDecision !== recipeMode
  ) {
    throw new Error("M7 GPS recipe decision is unsupported or inconsistent.");
  }
  const fidelity = buildNotApplicableFidelityReceipt({
    selectionFingerprint: selection.selectionFingerprint,
    reason: recipeMode,
  });
  const selectedResources = buildSelectedResources({
    raw: await readSceneJson(rootDir, meaningId, "selected-resources.json"),
    catalog,
    task,
  });
  const required = requiredResourceIds({ visual, shots, sound });
  if (
    selectedResources.length !== required.size ||
    selectedResources.some(({ selected }) => !required.has(selected.resourceId))
  ) {
    throw new Error(
      "M7 GPS selected resources must exactly cover the authored plans.",
    );
  }
  const rendererPath = `${sceneRoot(meaningId)}/Renderer.tsx`;
  const graph = await collectRendererSourceGraph({
    rootDir,
    projectId: STORY_ID,
    rendererPath,
  });
  const owningPrefix = `${sceneRoot(meaningId)}/`;
  if (
    graph.files.some(
      ({ sourcePath }) =>
        !sourcePath.startsWith(owningPrefix) &&
        !sourcePath.startsWith("src/remotion/capabilities/"),
    )
  ) {
    throw new Error("M7 GPS Renderer source graph crosses Scene ownership.");
  }
  for (const authoringFile of [
    "authoring/index.ts",
    "authoring/Root.tsx",
    "authoring/Composition.tsx",
  ]) {
    await readRegularText(join(rootDir, sceneRoot(meaningId), authoringFile));
  }
  const outputs: readonly [string, unknown][] = [
    ["visual-plan.json", visual],
    ["shot-plan.json", shots],
    ["sync-anchors.json", anchors],
    ["sound-plan.json", sound],
    ["selected-resources.json", { schemaVersion: 1, selectedResources }],
    ["shot-recipe-selection.json", selection],
    ["generated/reference-fidelity.generated.json", fidelity],
  ];
  for (const [file, value] of outputs) {
    await writeOrCheckSceneArtifact({
      destination: join(rootDir, sceneRoot(meaningId), file),
      value,
      mode,
    });
  }
  return {
    meaningId,
    taskInputFingerprint: task.taskInputFingerprint,
    visualPlanFingerprint: visual.visualPlanFingerprint,
    shotPlanFingerprint: shots.shotPlanFingerprint,
    syncAnchorFingerprint: anchors.syncAnchorFingerprint,
    soundPlanFingerprint: sound.soundPlanFingerprint,
    selectionFingerprint: selection.selectionFingerprint,
    fidelityReceiptFingerprint: fidelity.receiptFingerprint,
    rendererSourceGraphFingerprint: graph.sourceGraphFingerprint,
  } as const;
};

export type AuthorScenesCliContext = Readonly<{
  rootDir: string;
  stdout: (line: string) => void;
  author?: (input: {
    readonly meaningId: MeaningId;
    readonly mode: SceneArtifactMode;
  }) => Promise<unknown>;
}>;

const defaultContext = (): AuthorScenesCliContext => ({
  rootDir: process.cwd(),
  stdout: (line) => process.stdout.write(`${line}\n`),
});

const parseMeaning = (value: string | undefined): MeaningId => {
  if (value === undefined || !isMeaningId(value)) {
    throw new Error("Unknown M7 GPS meaningId.");
  }
  return value;
};

export const runM7GpsAuthorCli = async (
  args: readonly string[],
  context: AuthorScenesCliContext = defaultContext(),
) => {
  let meaningIds: readonly MeaningId[];
  let mode: SceneArtifactMode;
  if (
    args.length === 3 &&
    args[0] === "--meaning" &&
    (args[2] === "--write" || args[2] === "--check")
  ) {
    meaningIds = [parseMeaning(args[1])];
    mode = args[2] === "--write" ? "write" : "check";
  } else if (
    args.length === 2 &&
    args[0] === "--all" &&
    args[1] === "--check"
  ) {
    meaningIds = GPS_M7_MEANING_IDS;
    mode = "check";
  } else {
    throw new Error(
      "Expected --meaning <id> --write|--check or --all --check.",
    );
  }
  const results = [];
  for (const meaningId of meaningIds) {
    results.push(
      context.author
        ? await context.author({ meaningId, mode })
        : await authorGpsM7Scene({
            rootDir: context.rootDir,
            meaningId,
            mode,
          }),
    );
  }
  context.stdout(serializeCanonicalJson(results));
  return results;
};

const compositionId = (meaningId: MeaningId) =>
  `M7Gps${meaningId
    .split("-")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join("")}Authoring`;

const parsePreviewTargets = (args: readonly string[]): readonly MeaningId[] => {
  if (args.length === 1 && args[0] === "--all") return GPS_M7_MEANING_IDS;
  if (args.length === 2 && args[0] === "--meaning") {
    return [parseMeaning(args[1])];
  }
  throw new Error("Expected --meaning <id> or --all.");
};

export const runM7GpsAuthoringPreviewCli = async (
  command: "compositions" | "stills",
  args: readonly string[],
  rootDir = process.cwd(),
) => {
  const meanings = parsePreviewTargets(args);
  const remotion = join(rootDir, "node_modules/.bin/remotion");
  for (const meaningId of meanings) {
    const entry = join(rootDir, sceneRoot(meaningId), "authoring/index.ts");
    if (command === "compositions") {
      await execFileAsync(remotion, ["compositions", entry], { cwd: rootDir });
      continue;
    }
    const task = SceneTaskInputSchema.parse(
      await readSceneJson(rootDir, meaningId, "task-input.generated.json"),
    );
    const duration = task.timingBeat.endFrame - task.timingBeat.startFrame;
    const frames = [0.25, 0.5, 0.75].map((ratio) =>
      Math.min(duration - 1, Math.max(0, Math.floor(duration * ratio))),
    );
    const destinationRoot = join(
      rootDir,
      `out/gps-relativity/m7-authoring/${meaningId}`,
    );
    await mkdir(destinationRoot, { recursive: true });
    for (const [index, frame] of frames.entries()) {
      await execFileAsync(
        remotion,
        [
          "still",
          entry,
          compositionId(meaningId),
          join(destinationRoot, `${["early", "mid", "late"][index]}.png`),
          `--frame=${frame}`,
          "--log=error",
        ],
        { cwd: rootDir },
      );
    }
  }
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [command, ...args] = process.argv.slice(2);
  const run =
    command === "compositions" || command === "stills"
      ? runM7GpsAuthoringPreviewCli(command, args)
      : runM7GpsAuthorCli(process.argv.slice(2));
  Promise.resolve(run).catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "M7 GPS authoring failed."}\n`,
    );
    process.exitCode = 1;
  });
}
