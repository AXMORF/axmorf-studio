import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { GitCommitSchema } from "@axmorf/studio/contracts";

const execFileAsync = promisify(execFile);

export const runGit = async (
  rootDir: string,
  args: readonly string[],
): Promise<string> => {
  const { stdout } = await execFileAsync("git", [...args], {
    cwd: rootDir,
    encoding: "utf8",
  });
  return stdout;
};

export const assertCleanExactCheckout = async (
  rootDir: string,
  rawExpectedRevision: unknown,
): Promise<void> => {
  const expectedRevision = GitCommitSchema.parse(rawExpectedRevision);
  const head = (await runGit(rootDir, ["rev-parse", "HEAD"])).trim();
  if (head !== expectedRevision) {
    throw new Error(
      `External reference checkout HEAD mismatch: expected ${expectedRevision}, received ${head}.`,
    );
  }
  const status = await runGit(rootDir, [
    "status",
    "--porcelain",
    "--untracked-files=all",
  ]);
  if (status.trim() !== "") {
    throw new Error("External reference checkout must be clean.");
  }
};
