import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";

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

const isMarkupWhitespace = (value: string | undefined) =>
  value !== undefined && /\s/u.test(value);

const skipBracedAttribute = (source: string, start: number) => {
  let depth = 0;
  let quote: '"' | "'" | "`" | undefined;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const value = source[index];
    if (quote !== undefined) {
      if (escaped) escaped = false;
      else if (value === "\\") escaped = true;
      else if (value === quote) quote = undefined;
      continue;
    }
    if (value === '"' || value === "'" || value === "`") quote = value;
    else if (value === "{") depth += 1;
    else if (value === "}" && --depth === 0) return index + 1;
  }
  return source.length;
};

const maskSvgPathData = (source: string) => {
  const masked = source.split("");
  const pathStartPattern = /<path(?=[\s/>])/giu;
  for (const match of source.matchAll(pathStartPattern)) {
    let cursor = (match.index ?? 0) + match[0].length;
    while (cursor < source.length) {
      while (isMarkupWhitespace(source[cursor])) cursor += 1;
      if (source[cursor] === ">") break;
      if (source[cursor] === "/" && source[cursor + 1] === ">") break;
      if (source[cursor] === "{") {
        cursor = skipBracedAttribute(source, cursor);
        continue;
      }
      if (source[cursor] === "/") {
        cursor += 1;
        continue;
      }
      const nameStart = cursor;
      while (
        cursor < source.length &&
        !isMarkupWhitespace(source[cursor]) &&
        !["=", "/", ">"].includes(source[cursor])
      ) {
        cursor += 1;
      }
      const attributeName = source.slice(nameStart, cursor).toLowerCase();
      while (isMarkupWhitespace(source[cursor])) cursor += 1;
      if (source[cursor] !== "=") continue;
      cursor += 1;
      while (isMarkupWhitespace(source[cursor])) cursor += 1;
      const quote = source[cursor];
      if (quote === '"' || quote === "'") {
        const valueStart = cursor + 1;
        cursor = source.indexOf(quote, valueStart);
        if (cursor === -1) break;
        if (attributeName === "d") {
          for (let index = valueStart; index < cursor; index += 1) {
            if (source[index] !== "\r" && source[index] !== "\n") {
              masked[index] = " ";
            }
          }
        }
        cursor += 1;
      } else if (quote === "{") {
        cursor = skipBracedAttribute(source, cursor);
      } else {
        while (
          cursor < source.length &&
          !isMarkupWhitespace(source[cursor]) &&
          source[cursor] !== ">"
        ) {
          cursor += 1;
        }
      }
    }
  }
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
