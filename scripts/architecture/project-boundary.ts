import { readdir, readFile } from "node:fs/promises";
import { join, posix, relative, resolve, sep } from "node:path";
import ts from "typescript";

const CORE_ROOTS = [
  "src/contracts",
  "src/remotion/runtime",
  "src/remotion/capabilities",
  "scripts/production",
  "scripts/registry",
  "scripts/catalog",
  "scripts/project-check",
] as const;

const toPosix = (path: string) => path.split(sep).join(posix.sep);

const listFiles = async (directory: string): Promise<readonly string[]> => {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return listFiles(path);
      return entry.isFile() ? [path] : [];
    }),
  );
  return files.flat().sort();
};

const importSpecifiers = (source: string, fileName: string) => {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const specifiers: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require")) &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specifiers;
};

const resolveRepositoryImport = (sourcePath: string, specifier: string) => {
  if (specifier.startsWith(".")) {
    return posix.normalize(posix.join(posix.dirname(sourcePath), specifier));
  }
  return posix.normalize(specifier);
};

export const findCoreProjectImportViolations = async (rootDir: string) => {
  const violations: string[] = [];
  for (const coreRoot of CORE_ROOTS) {
    for (const absolutePath of await listFiles(join(rootDir, coreRoot))) {
      if (!/\.[cm]?[jt]sx?$/.test(absolutePath)) continue;
      const sourcePath = toPosix(relative(rootDir, absolutePath));
      const source = await readFile(absolutePath, "utf8");
      for (const specifier of importSpecifiers(source, sourcePath)) {
        const target = resolveRepositoryImport(sourcePath, specifier);
        if (
          /(^|\/)src\/projects\/[^/]+\//.test(target) ||
          /(^|\/)scripts\/project-tools\/[^/]+\//.test(target)
        ) {
          violations.push(`${sourcePath} -> ${target}`);
        }
      }
    }
  }
  return violations.sort();
};

const referencedNpmScripts = (command: string) => {
  const references: string[] = [];
  for (const match of command.matchAll(/\bnpm\s+run\s+([^\s&|]+)/g)) {
    if (match[1] !== undefined) references.push(match[1]);
  }
  if (/\bnpm\s+test\b/.test(command)) references.push("test");
  return references;
};

export const collectDefaultCheckScripts = (
  scripts: Readonly<Record<string, string>>,
) => {
  const visited = new Set<string>();
  const pending = ["check"];
  while (pending.length > 0) {
    const name = pending.pop();
    if (name === undefined || visited.has(name)) continue;
    visited.add(name);
    const command = scripts[name];
    if (command === undefined) continue;
    pending.push(...referencedNpmScripts(command));
  }
  return [...visited].sort();
};

export const findDefaultCheckArtifactViolations = (
  scripts: Readonly<Record<string, string>>,
) => {
  const violations: string[] = [];
  for (const name of collectDefaultCheckScripts(scripts)) {
    const command = scripts[name];
    if (command === undefined) continue;
    if (/--project\s+(?![<$])[a-z0-9][a-z0-9-]*/.test(command)) {
      violations.push(`${name}: concrete --project argument`);
    }
    if (
      /(?:^|:)(?:media|evidence|approval)(?::|$)/.test(name) ||
      /(?:^|\s)out\//.test(command)
    ) {
      violations.push(`${name}: media/evidence dependency`);
    }
  }
  return violations.sort();
};

const listDirectories = async (directory: string) => {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
};

export const findCentralProjectOwnershipViolations = async (
  rootDir: string,
) => {
  const projectIds = new Set(
    await listDirectories(join(rootDir, "src/projects")),
  );
  const candidates = [
    ...(await listFiles(join(rootDir, "scripts/project-tools"))),
    ...(
      await Promise.all(
        [...projectIds].map((projectId) =>
          listFiles(join(rootDir, "tests", projectId)),
        ),
      )
    ).flat(),
  ];
  return candidates
    .map((path) => toPosix(relative(rootDir, resolve(path))))
    .sort();
};
