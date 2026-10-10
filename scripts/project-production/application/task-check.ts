import { lstat, readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import ts from "typescript";

import type { ProducerTaskSpec } from "@axmorf/studio/contracts";
import { readTaskWorkspace } from "../adapters/task-workspace";
import { assertGlobalVisualSource } from "./global-visual-validator";
import { TaskOutputValidationError } from "../domain/task-output-validation";

const listFiles = async (
  root: string,
  directory = root,
): Promise<readonly string[]> => {
  const metadata = await lstat(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink())
    throw new Error("Task workspace root is unsafe.");
  const files: string[] = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile()))
      throw new Error("Task workspace contains a non-regular entry.");
    if (entry.isDirectory()) files.push(...(await listFiles(root, path)));
    else files.push(relative(root, path).split(sep).join("/"));
  }
  return files.sort();
};
const parseSource = async (path: string, logicalPath: string) => {
  const source = await readFile(path, "utf8");
  const result = path.endsWith(".d.ts")
    ? {
        diagnostics: (
          ts.createSourceFile(
            path,
            source,
            ts.ScriptTarget.ES2022,
            true,
          ) as ts.SourceFile & {
            readonly parseDiagnostics: readonly ts.Diagnostic[];
          }
        ).parseDiagnostics,
      }
    : ts.transpileModule(source, {
        fileName: path,
        reportDiagnostics: true,
        compilerOptions: {
          jsx: ts.JsxEmit.ReactJSX,
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
        },
      });
  const errors =
    result.diagnostics?.filter(
      ({ category }) => category === ts.DiagnosticCategory.Error,
    ) ?? [];
  if (errors.length > 0)
    throw new TaskOutputValidationError(
      "Task TypeScript source contains syntax errors.",
      { code: "invalid-typescript", outputPaths: [logicalPath] },
    );
  if (/\b(?:fetch|XMLHttpRequest|WebSocket)\b|https?:\/\//u.test(source))
    throw new Error("Task source cannot use network access.");
  if (/\b(?:animation|animationName|transition)\s*:/u.test(source))
    throw new Error("Task source cannot use CSS animation or transition.");
  return source;
};

const validateExactSet = async (workspace: string, task: ProducerTaskSpec) => {
  const actual = await listFiles(workspace);
  const expected = [
    "task.json",
    ...task.declaredReadSet,
    ...task.declaredOutputSet,
  ].sort();
  if (
    actual.some((path) => !expected.includes(path)) ||
    ["task.json", ...task.declaredReadSet].some(
      (path) => !actual.includes(path),
    )
  ) {
    throw new Error("Task workspace exact file set is invalid.");
  }
  const missing = task.declaredOutputSet.filter(
    (path) => !actual.includes(path),
  );
  if (missing.length > 0) {
    for (const path of missing) {
      try {
        await lstat(join(workspace, path));
        throw new Error("Task output must be a regular file.");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    throw new TaskOutputValidationError(
      "Task workspace exact file set is invalid: declared outputs are missing.",
      { code: "missing-output", outputPaths: [...missing].sort() },
    );
  }
};

export const checkProducerTaskWorkspace = async ({
  rootDir,
  taskRevision,
}: {
  readonly rootDir: string;
  readonly taskRevision: string;
  readonly runtimeRootDir?: string;
}) => {
  const { task, workspace } = await readTaskWorkspace({
    rootDir,
    taskRevision,
  });
  await validateExactSet(workspace, task);
  for (const logicalPath of task.declaredOutputSet) {
    const path = join(workspace, logicalPath);
    if (logicalPath.endsWith(".json")) {
      const bytes = await readFile(path, "utf8");
      try {
        JSON.parse(bytes);
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        throw new TaskOutputValidationError(
          "Task output JSON is malformed.",
          { code: "invalid-json", outputPaths: [logicalPath] },
          { cause: error },
        );
      }
    }
    if (/\.[cm]?tsx?$/u.test(logicalPath)) await parseSource(path, logicalPath);
  }
  if (task.taskKind === "global-visual-owner") {
    const context = JSON.parse(
      await readFile(join(workspace, "inputs/context.json"), "utf8"),
    ) as { visualStyle?: { theme?: unknown } };
    const source = await readFile(
      join(workspace, "src/GlobalVisualLayers.tsx"),
      "utf8",
    );
    const sourcePath = `src/projects/${task.storyId}/global-visual/GlobalVisualLayers.tsx`;
    assertGlobalVisualSource({
      source,
      sourcePath,
      entryPath: sourcePath,
      theme: context.visualStyle?.theme,
    });
  }
  if (task.taskKind === "cover-owner") {
    for (const file of [
      "Cover3x4.tsx",
      "Cover4x3.tsx",
      "Root.tsx",
      "index.ts",
    ]) {
      const source = await readFile(join(workspace, "src", file), "utf8");
      if (/\b(?:Audio|Img|Video|OffthreadVideo|staticFile)\b/u.test(source))
        throw new Error("Cover task must remain code-only graphics.");
    }
  }
  return { task, workspace, status: "task-workspace-valid" as const };
};
