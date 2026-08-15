import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { generateScenePackage } from "../../scripts/scene-package/generate";
import { createScenePackageInput } from "../fixtures/scene/package-input";

test("file-backed package generation fingerprints the complete Renderer source graph", async () => {
  const source = await readFile(
    fileURLToPath(
      new URL("../../scripts/scene-package/generate.ts", import.meta.url),
    ),
    "utf8",
  );
  assert.match(source, /collectRendererSourceGraph/u);
  assert.doesNotMatch(
    source,
    /readFile\(join\(sceneRoot, "Renderer\.tsx"\)\)/u,
  );
});

test("ScenePackage write is pass-only atomic byte-stable and check is read-only", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-package-"));
  const destination = join(rootDir, "scene-package.generated.json");
  try {
    const input = createScenePackageInput();
    await generateScenePackage({ mode: "write", destination, input });
    const before = await readFile(destination, "utf8");
    const beforeMtime = (await stat(destination)).mtimeMs;
    await generateScenePackage({ mode: "write", destination, input });
    assert.equal((await stat(destination)).mtimeMs, beforeMtime);
    await generateScenePackage({ mode: "check", destination, input });
    await writeFile(destination, `${before} `, "utf8");
    await assert.rejects(() =>
      generateScenePackage({ mode: "check", destination, input }),
    );
    assert.equal(await readFile(destination, "utf8"), `${before} `);
    await writeFile(destination, before, "utf8");
    await assert.rejects(() =>
      generateScenePackage({
        mode: "write",
        destination,
        input: {
          ...input,
          current: { ...input.current, semanticTimingFingerprint: "invalid" },
        },
      }),
    );
    assert.equal(await readFile(destination, "utf8"), before);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("failed write keeps the last pass receipt bytes and mtime", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-package-fail-"));
  const destination = join(rootDir, "scene-package.generated.json");
  try {
    const input = createScenePackageInput();
    await generateScenePackage({ mode: "write", destination, input });
    const before = await readFile(destination, "utf8");
    const beforeMtime = (await stat(destination)).mtimeMs;
    await assert.rejects(() =>
      generateScenePackage({
        mode: "write",
        destination,
        input: {
          ...input,
          current: { ...input.current, visualRuntimeVersion: "stale" },
        },
      }),
    );
    assert.equal(await readFile(destination, "utf8"), before);
    assert.equal((await stat(destination)).mtimeMs, beforeMtime);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
