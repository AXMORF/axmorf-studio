import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const rootDir = process.cwd();

const collectFiles = async (root: string): Promise<string[]> => {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(path)));
    else if (entry.isFile() && /\.(?:ts|tsx|json|md)$/u.test(entry.name)) files.push(path);
  }
  return files;
};

test("active runtime and Skill contain no Preview, approval, or legacy delivery path", async () => {
  const files = (
    await Promise.all([
      collectFiles(join(rootDir, "scripts/production")),
      collectFiles(join(rootDir, "scripts/delivery")),
      collectFiles(join(rootDir, "src/contracts")),
      collectFiles(join(rootDir, ".agents/skills/remotion-story-producer-video")),
    ])
  ).flat();
  const forbidden =
    /ProductionPreview|FinalPreview(?:Evidence|Approval)|preview-ready|awaiting-user-preview|production:preview:check|production-requirements-freeze-v[1-4]|delivery-(?:specification|release-manifest)-v[12]|release-manifest\.json|actualDurationSeconds|buildScene(?:Assignment|ProductionResult)V[12]|Scene(?:Assignment|ProductionResult)V[12]/iu;
  const violations: string[] = [];
  for (const file of files) {
    if (forbidden.test(await readFile(file, "utf8"))) violations.push(file);
  }
  assert.deepEqual(violations, []);
});
