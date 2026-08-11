import { lstat, readFile } from "node:fs/promises";
import { join, posix } from "node:path";
import ts from "typescript";

import {
  MeaningIdSchema,
  SceneAssignmentSchema,
  ScenePackageSchema,
  SceneProductionResultSchema,
  buildSceneProductionResult,
  createFingerprint,
  serializeCanonicalJson,
  type SceneAssignment,
  type ScenePackage,
  type SceneProductionResult,
} from "../../../src/contracts";
import { collectRendererSourceGraph } from "../../renderer-registry/domain";
import { generateScenePackageFromProjectFiles } from "../../scene-package/generate";
import { readJsonFile } from "../../scene-package/project-files";
import { redactProductionErrorDescription } from "../domain/error-redaction";
import { validateSceneReadability } from "./readability-validator";
import {
  getProductionRunPaths,
  readProductionRunStore,
  writeProductionFileAtomic,
} from "../adapters/run-store";
import { createExpectedProductionError } from "../domain/errors";
import { resolveCurrentSceneAssignments } from "./scene-freeze";

type SceneValidation = Readonly<{
  scenePackage: ScenePackage;
  rendererSourceGraphFingerprint: string;
  mechanicalCheckFingerprint: string;
}>;

type CurrentSceneAssignment = SceneAssignment;
type CurrentSceneResult = SceneProductionResult;

const parseCurrentSceneAssignment = (raw: unknown): CurrentSceneAssignment =>
  SceneAssignmentSchema.parse(raw);

type SceneAssignmentResolver = (request: {
  readonly rootDir: string;
  readonly runId: string;
  readonly meaningId: string;
}) => Promise<CurrentSceneAssignment>;

type SceneValidator = (request: {
  readonly rootDir: string;
  readonly assignment: CurrentSceneAssignment;
}) => Promise<SceneValidation>;

const scenePackagePath = (storyId: string, meaningId: string) =>
  `src/projects/${storyId}/scenes/${meaningId}/generated/scene-package.generated.json`;

const sceneAssignmentPath = (storyId: string, meaningId: string) =>
  `src/projects/${storyId}/production/scene-assignments/${meaningId}.generated.json`;

export const loadStoredSceneAssignment: SceneAssignmentResolver = async ({
  rootDir,
  runId,
  meaningId,
}) => {
  const loaded = await readProductionRunStore({ rootDir, runId });
  const assignment = parseCurrentSceneAssignment(
    await readJsonFile(
      join(rootDir, sceneAssignmentPath(loaded.run.storyId, meaningId)),
    ),
  );
  if (assignment.runId !== runId || assignment.meaningId !== meaningId) {
    throw new Error(
      "Stored SceneAssignment identity does not match the request.",
    );
  }
  return assignment;
};

const resolveCurrentSceneAssignment: SceneAssignmentResolver = async ({
  rootDir,
  runId,
  meaningId,
}) => {
  const stored = await loadStoredSceneAssignment({
    rootDir,
    runId,
    meaningId,
  });
  const current = await resolveCurrentSceneAssignments({ rootDir, runId });
  const assignment = current.assignments.find(
    (candidate) => candidate.meaningId === meaningId,
  );
  if (
    assignment === undefined ||
    assignment.assignmentFingerprint !== stored.assignmentFingerprint
  ) {
    throw new Error("SceneAssignment is missing or stale.");
  }
  return assignment;
};

const assertFocusedCompile = ({
  rootDir,
  sourcePaths,
}: {
  readonly rootDir: string;
  readonly sourcePaths: readonly string[];
}) => {
  const configPath = join(rootDir, "tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error !== undefined) {
    throw new Error("Focused Scene compile could not read tsconfig.json.");
  }
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    rootDir,
    { noEmit: true, incremental: false },
    configPath,
  );
  if (parsed.errors.length > 0) {
    throw new Error(
      "Focused Scene compile found an invalid TypeScript config.",
    );
  }
  const program = ts.createProgram({
    rootNames: sourcePaths.map((sourcePath) => join(rootDir, sourcePath)),
    options: parsed.options,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length > 0) {
    const first = diagnostics[0];
    const message = ts.flattenDiagnosticMessageText(first.messageText, " ");
    throw new Error(`Focused Scene compile failed: ${message}`);
  }
};

const validateSceneFromProjectFiles: SceneValidator = async ({
  rootDir,
  assignment,
}) => {
  const scenePackage = ScenePackageSchema.parse(
    await generateScenePackageFromProjectFiles({
      rootDir,
      projectId: assignment.storyId,
      meaningId: assignment.meaningId,
      mode: "write",
    }),
  );
  const checkedPackage = ScenePackageSchema.parse(
    await generateScenePackageFromProjectFiles({
      rootDir,
      projectId: assignment.storyId,
      meaningId: assignment.meaningId,
      mode: "check",
    }),
  );
  if (
    scenePackage.schemaVersion !== 3 ||
    checkedPackage.schemaVersion !== 3 ||
    checkedPackage.packageFingerprint !== scenePackage.packageFingerprint ||
    scenePackage.taskInputFingerprint !==
      assignment.taskInput.taskInputFingerprint
  ) {
    throw new Error("ScenePackage is stale against the SceneAssignment.");
  }

  const rendererPath = `src/projects/${assignment.storyId}/scenes/${assignment.meaningId}/Renderer.tsx`;
  const graph = await collectRendererSourceGraph({
    rootDir,
    projectId: assignment.storyId,
    rendererPath,
  });
  const scenePrefix = `${posix.dirname(rendererPath)}/`;
  for (const file of graph.files) {
    if (
      !file.sourcePath.startsWith(scenePrefix) &&
      !file.sourcePath.startsWith("src/remotion/capabilities/") &&
      !file.sourcePath.startsWith("src/remotion/runtime/readability/")
    ) {
      throw new Error("Renderer crosses another Scene directory.");
    }
  }
  if (
    graph.sourceGraphFingerprint !==
    scenePackage.rendererBinding.rendererSourceFingerprint
  ) {
    throw new Error("Renderer source graph is stale against ScenePackage.");
  }
  await validateSceneReadability({ rootDir, assignment, graph });
  assertFocusedCompile({
    rootDir,
    sourcePaths: graph.files.map(({ sourcePath }) => sourcePath),
  });

  return {
    scenePackage,
    rendererSourceGraphFingerprint: graph.sourceGraphFingerprint,
    mechanicalCheckFingerprint: createFingerprint({
      namespace: "production-scene-mechanical-check",
      version: 1,
      value: {
        assignmentFingerprint: assignment.assignmentFingerprint,
        packageFingerprint: scenePackage.packageFingerprint,
        rendererSourceGraphFingerprint: graph.sourceGraphFingerprint,
        readabilityPolicyFingerprint:
          assignment.readabilityPolicy.policyFingerprint,
        sceneCompositionBoundaryVersion:
          assignment.sceneCompositionBoundaryVersion,
      },
    }),
  };
};

export const readExistingSceneResult = async ({
  rootDir,
  runId,
  meaningId,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly meaningId: string;
}): Promise<CurrentSceneResult | null> => {
  const path = join(
    getProductionRunPaths({ rootDir, runId }).sceneResults,
    `${meaningId}.json`,
  );
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error("Scene result must be a regular file.");
    }
    const result = SceneProductionResultSchema.parse(
      JSON.parse(await readFile(path, "utf8")),
    );
    return result;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
};

export const writeSceneProductionResult = async ({
  rootDir,
  result: rawResult,
}: {
  readonly rootDir: string;
  readonly result: CurrentSceneResult;
}) => {
  const result = SceneProductionResultSchema.parse(rawResult);
  const resultPath = join(
    getProductionRunPaths({ rootDir, runId: result.runId }).sceneResults,
    `${result.meaningId}.json`,
  );
  const write = await writeProductionFileAtomic({
    destination: resultPath,
    bytes: `${serializeCanonicalJson(result)}\n`,
    mode: "create",
  });
  return { result, resultPath, written: write.written } as const;
};

const commonResultInput = (
  assignment: CurrentSceneAssignment,
  occurredAt: string,
) => {
  const common = {
    runId: assignment.runId,
    storyId: assignment.storyId,
    meaningId: assignment.meaningId,
    assignmentFingerprint: assignment.assignmentFingerprint,
    taskInputFingerprint: assignment.taskInput.taskInputFingerprint,
    requirementsFingerprint: assignment.requirementsFingerprint,
    sceneBriefFingerprint: assignment.sceneBriefFingerprint,
    resourcePoolFingerprint: assignment.resourcePoolFingerprint,
    occurredAt,
  };
  return {
    ...common,
    readabilityPolicyFingerprint:
      assignment.readabilityPolicy.policyFingerprint,
    sceneCompositionBoundaryVersion: assignment.sceneCompositionBoundaryVersion,
  };
};

const buildResultForAssignment = (
  _assignment: CurrentSceneAssignment,
  input: Record<string, unknown>,
) => buildSceneProductionResult(input);

export const createSceneFailureResult = ({
  assignment,
  code,
  description,
  redactionApplied,
  occurredAt,
  commandId,
}: {
  readonly assignment: CurrentSceneAssignment;
  readonly code: string;
  readonly description: string;
  readonly redactionApplied: boolean;
  readonly occurredAt: string;
  readonly commandId: "production-scene-submit" | "production-scene-fail";
}) =>
  buildResultForAssignment(assignment, {
    ...commonResultInput(assignment, occurredAt),
    status: "failure",
    error: createExpectedProductionError({
      code,
      stageId: "scenes",
      scope: "scene",
      meaningId: assignment.meaningId,
      summary: "Scene production did not complete.",
      description,
      retryable: false,
      remediation:
        "Inspect the Scene assignment and submit a new production run after correcting the isolated Scene input.",
      commandId,
      inputFingerprint: assignment.assignmentFingerprint,
      redactionApplied,
    }),
  });

const assertSceneResultState = (state: string) => {
  if (
    state !== "scene-inputs-frozen" &&
    state !== "waiting-for-owner-results"
  ) {
    throw new Error("Scene results require frozen Scene inputs.");
  }
};

export const runProductionSceneSubmit = async ({
  rootDir,
  runId,
  meaningId: rawMeaningId,
  clock = () => new Date(),
  resolveAssignment = resolveCurrentSceneAssignment,
  validateScene = validateSceneFromProjectFiles,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly meaningId: string;
  readonly clock?: () => Date;
  readonly resolveAssignment?: SceneAssignmentResolver;
  readonly validateScene?: SceneValidator;
}) => {
  const meaningId = MeaningIdSchema.parse(rawMeaningId);
  const loaded = await readProductionRunStore({ rootDir, runId });
  assertSceneResultState(loaded.state.state);
  const assignment = parseCurrentSceneAssignment(
    await resolveAssignment({ rootDir, runId, meaningId }),
  );
  if (
    assignment.runId !== loaded.run.runId ||
    assignment.storyId !== loaded.run.storyId ||
    assignment.meaningId !== meaningId
  ) {
    throw new Error("SceneAssignment identity does not match the run.");
  }
  const existing = await readExistingSceneResult({
    rootDir,
    runId,
    meaningId,
  });
  try {
    const validated = await validateScene({ rootDir, assignment });
    const current = existing?.occurredAt ?? clock().toISOString();
    const success = buildResultForAssignment(assignment, {
      ...commonResultInput(assignment, current),
      status: "success",
      scenePackage: {
        repositoryPath: scenePackagePath(
          assignment.storyId,
          assignment.meaningId,
        ),
        packageFingerprint: validated.scenePackage.packageFingerprint,
      },
      rendererSourceGraphFingerprint: validated.rendererSourceGraphFingerprint,
      selectedResourcesFingerprint: createFingerprint({
        namespace: "production-scene-selected-resources",
        version: 1,
        value: validated.scenePackage.selectedResources,
      }),
      fidelityReceiptFingerprint:
        validated.scenePackage.fidelityReceiptFingerprint,
      mechanicalCheckFingerprint: validated.mechanicalCheckFingerprint,
    });
    if (
      existing !== null &&
      (existing.status !== "success" ||
        existing.resultFingerprint !== success.resultFingerprint)
    ) {
      throw new Error("A conflicting Scene production result already exists.");
    }
    return writeSceneProductionResult({ rootDir, result: success });
  } catch (error) {
    if (existing?.status === "success") throw error;
    const redacted = redactProductionErrorDescription({
      error,
      fallback: "Scene submit validation failed.",
    });
    const failure = createSceneFailureResult({
      assignment,
      code: /(?:resource.*outside|outside.*resource|allowlist)/iu.test(
        redacted.description,
      )
        ? "RESOURCE_NOT_ALLOWED"
        : "SCENE_SUBMIT_FAILED",
      description: redacted.description,
      redactionApplied: redacted.redactionApplied,
      occurredAt: existing?.occurredAt ?? clock().toISOString(),
      commandId: "production-scene-submit",
    });
    if (
      existing !== null &&
      (existing.status !== "failure" ||
        existing.resultFingerprint !== failure.resultFingerprint)
    ) {
      throw new Error("A conflicting Scene production result already exists.");
    }
    await writeSceneProductionResult({ rootDir, result: failure });
    throw error;
  }
};

export const runProductionSceneCheck = async ({
  rootDir,
  runId,
  meaningId: rawMeaningId,
  resolveAssignment = resolveCurrentSceneAssignment,
  validateScene = validateSceneFromProjectFiles,
}: {
  readonly rootDir: string;
  readonly runId: string;
  readonly meaningId: string;
  readonly resolveAssignment?: SceneAssignmentResolver;
  readonly validateScene?: SceneValidator;
}) => {
  const meaningId = MeaningIdSchema.parse(rawMeaningId);
  const loaded = await readProductionRunStore({ rootDir, runId });
  assertSceneResultState(loaded.state.state);
  const assignment = parseCurrentSceneAssignment(
    await resolveAssignment({ rootDir, runId, meaningId }),
  );
  if (
    assignment.runId !== loaded.run.runId ||
    assignment.storyId !== loaded.run.storyId ||
    assignment.meaningId !== meaningId
  ) {
    throw new Error("SceneAssignment identity does not match the run.");
  }
  const existing = await readExistingSceneResult({ rootDir, runId, meaningId });
  if (existing !== null) {
    throw new Error("Scene check requires no existing production result.");
  }
  const validated = await validateScene({ rootDir, assignment });
  return {
    runId,
    storyId: assignment.storyId,
    meaningId,
    status: "ready-to-submit" as const,
    assignmentFingerprint: assignment.assignmentFingerprint,
    scenePackageFingerprint: validated.scenePackage.packageFingerprint,
    rendererSourceGraphFingerprint: validated.rendererSourceGraphFingerprint,
    mechanicalCheckFingerprint: validated.mechanicalCheckFingerprint,
  } as const;
};
