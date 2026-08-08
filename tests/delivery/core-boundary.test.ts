import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { generateProjectRegistry } from "../../scripts/registry/generate";
import { createRemovableProjectRoot } from "../fixtures/removable-project";

test("deleting deliveries does not affect the zero-Project core projection", async (context) => {
  const rootDir = await createRemovableProjectRoot(context);
  const delivery = join(rootDir, "deliveries/example/delivery-proof");
  await mkdir(delivery, { recursive: true });
  await writeFile(join(delivery, "delivery-launch-manifest.json"), "ignored\n");
  const before = await generateProjectRegistry({ rootDir, mode: "write" });
  const beforeBytes = await readFile(before.destination, "utf8");
  await rm(join(rootDir, "deliveries"), { recursive: true });
  const after = await generateProjectRegistry({ rootDir, mode: "write" });
  assert.equal(await readFile(after.destination, "utf8"), beforeBytes);
  assert.equal(after.entryCount, 0);
});
