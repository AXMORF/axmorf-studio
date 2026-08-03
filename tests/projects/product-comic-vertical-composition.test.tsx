import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isValidElement } from "react";
import test from "node:test";
import ts from "typescript";

import { NarrativeCore } from "../../src/remotion/runtime/narrative-core";
import {
  createProductComicVerticalNarrativeCoreProps,
  productComicVerticalCompositionMetadata,
} from "../../src/projects/product-comic-vertical/Composition";

test("product comic vertical is a transparent NarrativeCore-only Composition", async () => {
  const module = await import(
    "../../src/projects/product-comic-vertical/Composition"
  );
  assert.equal(typeof module.default, "function");
  const element = module.default(
    productComicVerticalCompositionMetadata.defaultProps,
  );
  assert.ok(isValidElement(element));
  assert.equal(element.type, NarrativeCore);
  assert.deepEqual(productComicVerticalCompositionMetadata, {
    id: "ProductComicVertical",
    fps: 30,
    width: 1080,
    height: 1920,
    durationInFrames: 5116,
    defaultProps: { projectId: "product-comic-vertical" },
  });
  assert.throws(() =>
    createProductComicVerticalNarrativeCoreProps({ projectId: "other-story" }),
  );
});

test("baseline source has one static complete audio and no Scene prerequisites", async () => {
  const path = new URL(
    "../../src/projects/product-comic-vertical/Composition.tsx",
    import.meta.url,
  );
  const source = await readFile(path, "utf8");
  const ast = ts.createSourceFile(
    path.pathname,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const jsonImports = ast.statements
    .filter(ts.isImportDeclaration)
    .map((statement) => statement.moduleSpecifier)
    .filter(ts.isStringLiteral)
    .map((specifier) => specifier.text)
    .filter((specifier) => specifier.endsWith(".json"));
  assert.deepEqual(jsonImports.sort(), [
    "./brief.json",
    "./generated/sealed-narration.generated.json",
    "./generated/semantic-timing.generated.json",
    "./narration.json",
    "./render.json",
    "./story.json",
  ]);
  assert.match(source, /export default ProductComicVerticalComposition/);
  assert.match(source, /sealedNarration\.completeAudio\.localPath/);
  assert.doesNotMatch(
    source,
    /RendererRegistry|ScenePackage|GlobalVisual|Shotcraft|node:fs|readFile|fetch\(|https?:/,
  );
});
