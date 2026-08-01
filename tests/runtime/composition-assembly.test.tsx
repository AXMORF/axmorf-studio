import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createElement, Fragment, isValidElement } from "react";
import test from "node:test";
import ts from "typescript";

import {
  CompositionAssembly,
  type CompositionAssemblyProps,
} from "../../src/remotion/runtime/composition-assembly";

test("CompositionAssembly exposes only the required narrativeCore slot", () => {
  const props: CompositionAssemblyProps = {
    narrativeCore: createElement("span", null, "narrative"),
  };
  assert.deepEqual(Object.keys(props), ["narrativeCore"]);
  const assembly = CompositionAssembly(props);
  assert.ok(isValidElement<{ children: unknown }>(assembly));
  assert.equal(assembly.type, Fragment);
  assert.equal(assembly.props.children, props.narrativeCore);
});

test("assembly source has one required prop and no enhancement placeholder", async () => {
  const path = new URL(
    "../../src/remotion/runtime/composition-assembly/CompositionAssembly.tsx",
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
  assert.equal(ast.kind, ts.SyntaxKind.SourceFile);
  assert.match(
    source,
    /type CompositionAssemblyProps = \{\s*readonly narrativeCore: ReactNode;\s*\}/,
  );
  assert.doesNotMatch(
    source,
    /StoryVisualTrack|SoundDesignTrack|GlobalVisualLayers|track\[\]|placeholder|BaseCanvas|Scene/,
  );
});
