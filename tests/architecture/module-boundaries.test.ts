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

test("settings progress server consumes application queries, not storage adapters", async () => {
  const source = await readFile(
    join(process.cwd(), "settings/server/production-progress.ts"),
    "utf8",
  );
  assert.doesNotMatch(source, /\/adapters\//u);
  assert.match(source, /application\/progress-query/u);
});

test("proof and capability taxonomies keep production runtime boundaries explicit", async () => {
  const absentDirectories = [
    "src/remotion/proofs",
    "src/remotion/capabilities/primitives",
    "src/remotion/capabilities/scenes",
  ];
  for (const path of absentDirectories) {
    await assert.rejects(access(join(process.cwd(), path)), { code: "ENOENT" });
  }
  await Promise.all([
    access(join(process.cwd(), "proofs/scene-runtime/source")),
    access(join(process.cwd(), "proofs/scene-runtime/fixtures")),
    access(join(process.cwd(), "proofs/scene-runtime/evidence")),
    access(join(process.cwd(), "src/remotion/capabilities/visual-components")),
    access(join(process.cwd(), "src/remotion/capabilities/scene-templates")),
  ]);
  const rootSource = await readFile(
    join(process.cwd(), "src/Root.tsx"),
    "utf8",
  );
  assert.doesNotMatch(rootSource, /proofs\//u);
});
