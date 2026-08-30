import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join, posix, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { discoverProjectEntries } from "../registry/project-files";

export const PROJECT_TEST_RUNNER_ID = "project-test-runner-current-v1" as const;

export type RepositoryTestScope = "source" | "media" | "all";

const MEDIA_PROJECT_TEST_NAMES = new Set([
  "final-evidence.test.ts",
  "final-invalidation.test.ts",
  "fail-closed-matrix.test.ts",
  "core-project-check-cli.test.ts",
  "core-report-files.test.ts",
]);

const CORE_TEST_ROOTS = [
  "tests/architecture",
  "tests/contracts",
  "tests/catalog",
  "tests/docs",
  "tests/external-references",
  "tests/scene-package",
  "tests/renderer-registry",
  "tests/narration",
  "tests/runtime",
  "tests/registry",
  "tests/baseline",
  "tests/project-production",
  "tests/projects",
  "tests/project-check",
  "tests/project-validation",
  "tests/final-assembly",
  "tests/scene-runtime-proof",
  "tests/config",
] as const;

const toPosixRelative = (rootDir: string, path: string) =>
  relative(rootDir, path).split(sep).join(posix.sep);

const discoverTestsBelow = async (
  rootDir: string,
  directory: string,
): Promise<readonly string[]> => {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const discovered: string[] = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (entry.isSymbolicLink()) {
      throw new Error(`Test discovery rejects symbolic links: ${entry.name}.`);
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      discovered.push(...(await discoverTestsBelow(rootDir, path)));
    } else if (entry.isFile() && /\.test\.tsx?$/.test(entry.name)) {
      discovered.push(toPosixRelative(rootDir, path));
    }
  }
  return discovered;
};

const discoverProjectTests = async (
  rootDir: string,
  scope: RepositoryTestScope,
) => {
  const projectsRoot = join(rootDir, "src/projects");
  let entries;
  try {
    entries = await readdir(projectsRoot, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const discovered: string[] = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (entry.isSymbolicLink()) {
      throw new Error(`Project symbolic links are not allowed: ${entry.name}.`);
    }
    if (!entry.isDirectory()) continue;
    const projectTests = await discoverTestsBelow(
      rootDir,
      join(projectsRoot, entry.name, "tests"),
    );
    discovered.push(
      ...projectTests.filter((path) => {
        const fileName = path.split("/").at(-1) ?? "";
        const isMedia =
          MEDIA_PROJECT_TEST_NAMES.has(fileName) ||
          /\.media\.test\.tsx?$/.test(fileName);
        return scope === "all" || (scope === "media" ? isMedia : !isMedia);
      }),
    );
  }
  return discovered;
};

export const discoverRepositoryTests = async (
  rootDir: string,
  scope: RepositoryTestScope = "source",
) => {
  const coreTests: string[] = [];
  if (scope !== "media") {
    for (const testRoot of CORE_TEST_ROOTS) {
      coreTests.push(
        ...(await discoverTestsBelow(rootDir, join(rootDir, testRoot))),
      );
    }
  }
  return [...coreTests, ...(await discoverProjectTests(rootDir, scope))];
};

export const runRepositoryTests = async (
  rootDir: string,
  scope: RepositoryTestScope = "source",
) => {
  const testFiles = await discoverRepositoryTests(rootDir, scope);
  if (testFiles.length === 0) {
    if (
      scope === "media" &&
      (await discoverProjectEntries(rootDir)).length === 0
    ) {
      return;
    }
    throw new Error("Repository test discovery found no tests.");
  }
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--test", ...testFiles],
      { cwd: rootDir, stdio: "inherit" },
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else {
        reject(
          new Error(
            `Repository tests failed with ${signal === null ? `exit ${code}` : `signal ${signal}`}.`,
          ),
        );
      }
    });
  });
};

export const parseRepositoryTestScope = (
  args: readonly string[],
): RepositoryTestScope => {
  if (args.length === 0) return "source";
  if (
    args.length === 2 &&
    args[0] === "--scope" &&
    (args[1] === "source" || args[1] === "media" || args[1] === "all")
  ) {
    return args[1];
  }
  throw new Error("Expected no arguments or --scope source|media|all.");
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runRepositoryTests(
    process.cwd(),
    parseRepositoryTestScope(process.argv.slice(2)),
  ).catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Repository tests failed."}\n`,
    );
    process.exitCode = 1;
  });
}
