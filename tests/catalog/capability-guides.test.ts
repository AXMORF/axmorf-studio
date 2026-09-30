import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  capabilityDescriptorDeclarations,
  WORKSPACE_CAPABILITY_FACADE_SOURCE,
} from "../../packages/studio/src/remotion/catalog/capability-descriptors";
import { validateCapabilityDescriptorExports } from "../../scripts/catalog/project-files";
import { compileTypeScriptImportGraph } from "../../scripts/project-production/application/typescript-compile";

const rootDir = join(import.meta.dirname, "../..");

test("capability guides expose real public exports and creator facade remains identical", async () => {
  const template = await readFile(
    join(
      rootDir,
      "packages/create-axmorf-studio/template/src/runtime/capabilities.ts",
    ),
    "utf8",
  );
  assert.equal(template, WORKSPACE_CAPABILITY_FACADE_SOURCE);
  await validateCapabilityDescriptorExports(
    rootDir,
    capabilityDescriptorDeclarations,
  );
  for (const descriptor of capabilityDescriptorDeclarations) {
    assert.ok(descriptor.authoring);
    assert.ok(descriptor.authoring.exports.includes(descriptor.exportName));
    assert.ok(descriptor.authoring.parameters.length > 0);
  }
});

for (const descriptor of capabilityDescriptorDeclarations) {
  test(`${descriptor.id} authoring example typechecks against the actual installed API`, () => {
    assert.ok(descriptor.authoring);
    compileTypeScriptImportGraph({
      rootDir,
      rootPath: join(rootDir, "src/capability-guide-example.tsx"),
      label: descriptor.id,
      virtualSource: descriptor.authoring.example,
    });
  });
}
