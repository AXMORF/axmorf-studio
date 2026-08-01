import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isValidElement } from "react";
import test from "node:test";
import ts from "typescript";

import { CompositionAssembly } from "../../src/remotion/runtime/composition-assembly";
import { NarrativeCore } from "../../src/remotion/runtime/narrative-core";
import {
  createGpsRelativityNarrativeCoreProps,
  gpsRelativityCompositionMetadata,
} from "../../src/projects/gps-relativity/Composition";

test("gps-relativity has a default-export Composition", async () => {
  const module = await import(
    "../../src/projects/gps-relativity/Composition"
  );
  assert.equal(typeof module.default, "function");
  const element = module.default(gpsRelativityCompositionMetadata.defaultProps);
  assert.ok(isValidElement<{ narrativeCore: unknown }>(element));
  assert.equal(element.type, CompositionAssembly);
  assert.ok(isValidElement(element.props.narrativeCore));
  assert.equal(element.props.narrativeCore.type, NarrativeCore);
});

test("project-local metadata is exactly the current absolute authority", () => {
  assert.deepEqual(gpsRelativityCompositionMetadata, {
    id: "GpsRelativity",
    fps: 30,
    width: 1920,
    height: 1080,
    durationInFrames: 1731,
    defaultProps: { projectId: "gps-relativity" },
  });
});

test("a mismatched projectId fails instead of loading another Story", () => {
  assert.throws(() =>
    createGpsRelativityNarrativeCoreProps({ projectId: "other-story" }),
  );
});

test("Composition uses only static project data and the complete sealed audio", async () => {
  const path = new URL(
    "../../src/projects/gps-relativity/Composition.tsx",
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
  assert.match(source, /export default GpsRelativityComposition/);
  assert.match(source, /sealedNarration\.completeAudio\.localPath/);
  assert.match(source, /staticFile\(/);
  assert.doesNotMatch(
    source,
    /chunk.*\.wav|node:fs|readFile|fetch\(|https?:|registry|BaseCanvas|capabilities|Scene|story-check/,
  );
});
