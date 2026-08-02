import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { generateScenePackage } from "../../scripts/scene-package/generate";
import { createM6PackageInput } from "../fixtures/scene/m6-package-input";

test("ScenePackage write is pass-only atomic byte-stable and check is read-only", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-package-"));
  const destination = join(rootDir, "scene-package.generated.json");
  try {
    const input = createM6PackageInput();
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
