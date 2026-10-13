import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  capabilityDescriptorDeclarations,
  WORKSPACE_CAPABILITY_FACADE_SOURCE,
} from "../../packages/studio/src/remotion/catalog/capability-descriptors";
import {
  queryResourceCatalog,
  buildResourceCatalog,
} from "../../scripts/catalog/domain";
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

for (const descriptor of capabilityDescriptorDeclarations) {
  for (const recipe of descriptor.authoring?.recipes ?? []) {
    test(`${descriptor.id}/${recipe.id} recipe compiles with the installed public API`, () => {
      compileTypeScriptImportGraph({
        rootDir,
        rootPath: join(rootDir, "src/capability-recipe-example.tsx"),
        label: recipe.id,
        virtualSource: recipe.example,
      });
    });
  }
}
test("capabilities can be discovered by API name, recipe intent and Chinese intent", () => {
  const catalog = buildResourceCatalog(capabilityDescriptorDeclarations);
  for (const [text, expected] of [
    ["resolveProducerFollow2D", "capability.motion"],
    ["纸张", "capability.visual-components"],
    ["3D", "capability.camera"],
  ]) {
    assert.ok(
      queryResourceCatalog(catalog, {
        kind: "capability",
        tag: null,
        text,
      }).some(({ descriptor }) => descriptor.id === expected),
    );
  }
});
