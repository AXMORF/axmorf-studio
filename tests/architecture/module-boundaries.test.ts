import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import test from "node:test";

const collectSourceFiles = async (directory: string): Promise<string[]> => {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectSourceFiles(path)));
    if (entry.isFile() && [".ts", ".tsx"].includes(extname(entry.name))) {
      files.push(path);
    }
  }
  return files;
};

test("settings client depends only on browser-safe contracts and feature modules", async () => {
  const clientRoot = join(process.cwd(), "settings/client");
  for (const path of await collectSourceFiles(clientRoot)) {
    const source = await readFile(path, "utf8");
    assert.doesNotMatch(
      source,
      /(?:from\s+|import\()["'][^"']*(?:scripts\/|settings\/server|\.\.\/server|node:)/u,
      relative(process.cwd(), path),
    );
  }
});

test("the Project production chain stays deleted", async () => {
  for (const path of [
    "scripts/project-production",
    "scripts/projects",
    "proofs",
    ".agents/skills/axmorf-video",
    "packages/create-axmorf-studio/template/.agents/skills/axmorf-video",
    "packages/studio/src/remotion/runtime/story-visual",
  ]) {
    await assert.rejects(access(join(process.cwd(), path)), { code: "ENOENT" });
  }
  const rootSource = await readFile(
    join(process.cwd(), "src/Root.tsx"),
    "utf8",
  );
  assert.doesNotMatch(rootSource, /projects|proofs\//u);
  assert.match(rootSource, /films: filmRegistry/u);
});
