import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import ts from "typescript";

const ACTIVE_ROOTS = [
  ".agents",
  "src",
  "scripts",
  "settings",
  "tests",
  "proofs",
] as const;
const ACTIVE_ROOT_FILES = ["AGENTS.md", "README.md", "package.json"] as const;
const ACTIVE_DOCS_ROOT = "docs";
const HISTORICAL_DOC_DIRECTORIES = new Set([
  "docs/archive",
  "docs/evidence",
  "docs/promotions",
]);
const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".json",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
]);

const RETIRED_MILESTONE_NUMBERS = [1, 3, 6, 8, 9] as const;
const milestonePattern = new RegExp(
  `(?:^|[^a-z0-9])(?:${RETIRED_MILESTONE_NUMBERS.map((number) => `m${number}`).join("|")})(?=$|[^0-9])`,
  "iu",
);

const maskSvgPathData = (source: string) => {
  const masked = source.split("");
  const sourceFile = ts.createSourceFile(
    "semantic-naming-source.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (node.tagName.getText(sourceFile) === "path") {
        for (const attribute of node.attributes.properties) {
          if (
            ts.isJsxAttribute(attribute) &&
            attribute.name.getText(sourceFile) === "d" &&
            attribute.initializer !== undefined &&
            ts.isStringLiteral(attribute.initializer)
          ) {
            const valueStart = attribute.initializer.getStart(sourceFile) + 1;
            const valueEnd = attribute.initializer.getEnd() - 1;
            for (let index = valueStart; index < valueEnd; index += 1) {
              if (source[index] !== "\r" && source[index] !== "\n") {
                masked[index] = " ";
              }
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return masked.join("");
};

const toRepositoryPath = (rootDir: string, path: string) =>
  relative(rootDir, path).split(sep).join("/");

const discoverTextFiles = async (
  rootDir: string,
  directory: string,
): Promise<readonly string[]> => {
  const repositoryDirectory = toRepositoryPath(rootDir, directory);
  if (HISTORICAL_DOC_DIRECTORIES.has(repositoryDirectory)) return [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (entry.isSymbolicLink()) {
      throw new Error(`Semantic naming scan rejects symlink: ${entry.name}.`);
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await discoverTextFiles(rootDir, path)));
    } else if (entry.isFile() && TEXT_EXTENSIONS.has(extname(entry.name))) {
      files.push(path);
    }
  }
  return files;
};

export const findMilestoneNamingViolations = async (rootDir: string) => {
  const files = [
    ...ACTIVE_ROOT_FILES.map((path) => join(rootDir, path)),
    ...(await discoverTextFiles(rootDir, join(rootDir, ACTIVE_DOCS_ROOT))),
    ...(
      await Promise.all(
        ACTIVE_ROOTS.map((path) =>
          discoverTextFiles(rootDir, join(rootDir, path)),
        ),
      )
    ).flat(),
  ];
  const violations: string[] = [];
  for (const path of files) {
    const repositoryPath = toRepositoryPath(rootDir, path);
    if (milestonePattern.test(repositoryPath)) {
      violations.push(`${repositoryPath}: milestone name in active path`);
      continue;
    }
    const lines = maskSvgPathData(await readFile(path, "utf8")).split(/\r?\n/u);
    for (const [index, line] of lines.entries()) {
      if (milestonePattern.test(line)) {
        violations.push(
          `${repositoryPath}:${index + 1}: milestone name in active content`,
        );
      }
    }
  }
  return violations.sort();
};
