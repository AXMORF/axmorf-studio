import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const FORBIDDEN_PUBLISH_PATH =
  /(?:^|\/)(?:desktop|settings|tests|proofs|private|src\/projects|public\/projects|node_modules|deliveries|out|\.producer-[^/]+)(?:\/|$)/iu;

test("the runtime publish surface cannot include repository or user-owned state", async () => {
  const packageDir = join(process.cwd(), "packages/studio");
  const manifest = JSON.parse(
    await readFile(join(packageDir, "package.json"), "utf8"),
  ) as { files?: readonly string[] };

  for (const path of manifest.files ?? []) {
    assert.doesNotMatch(path.replaceAll("\\", "/"), FORBIDDEN_PUBLISH_PATH);
  }
});

test("the runtime build reads only package-owned source entries", async () => {
  const source = await readFile(
    join(process.cwd(), "packages/studio/scripts/build.mjs"),
    "utf8",
  );

  assert.match(source, /packages:\s*"external"/u);
  assert.match(
    source,
    /chmod\(resolve\(outputRoot, "cli\/main\.js"\), 0o755\)/u,
  );
  assert.doesNotMatch(
    source,
    /(?:\.\.\/){2,}(?:src|scripts|settings)|desktop|node_modules/u,
  );
});
