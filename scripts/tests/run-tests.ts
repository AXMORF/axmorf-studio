import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join, posix, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

const toPosixRelative = (rootDir: string, path: string) =>
  relative(rootDir, path).split(sep).join(posix.sep);

const discoverTestsBelow = async (
  rootDir: string,
  directory: string,
): Promise<readonly string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
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

export const discoverRepositoryTests = (rootDir: string) =>
  discoverTestsBelow(rootDir, join(rootDir, "tests"));

export const runRepositoryTests = async (rootDir: string) => {
  const testFiles = await discoverRepositoryTests(rootDir);
  if (testFiles.length === 0) {
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

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.length !== 2) {
    throw new Error("Repository tests do not accept arguments.");
  }
  runRepositoryTests(process.cwd()).catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Repository tests failed."}\n`,
    );
    process.exitCode = 1;
  });
}
