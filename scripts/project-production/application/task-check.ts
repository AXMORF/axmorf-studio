import { lstat, readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import ts from "typescript";

import type { ProducerTaskSpec } from "../../../src/contracts";
import { readTaskWorkspace } from "../adapters/task-workspace";
import type { ProductionLocations } from "./production-locations";

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
const parseSource = async (path: string) => {
  const source = await readFile(path, "utf8");
  const result = ts.transpileModule(source, {
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
    throw new Error("Task TypeScript source contains syntax errors.");
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
    actual.length !== expected.length ||
    actual.some((path, index) => path !== expected[index])
  ) {
    throw new Error("Task workspace exact file set is invalid.");
  }
};

export const checkProducerTaskWorkspace = async (
  input: Readonly<{
    locations: ProductionLocations;
    taskRevision: string;
  }>,
) => {
  const { task, workspace } = await readTaskWorkspace(input);
  await validateExactSet(workspace, task);
  for (const logicalPath of task.declaredOutputSet) {
    const path = join(workspace, logicalPath);
    if (logicalPath.endsWith(".json")) JSON.parse(await readFile(path, "utf8"));
    if (/\.[cm]?tsx?$/u.test(logicalPath)) await parseSource(path);
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
