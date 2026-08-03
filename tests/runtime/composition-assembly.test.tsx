import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  Children,
  createElement,
  Fragment,
  isValidElement,
  type ReactNode,
} from "react";
import test from "node:test";
import ts from "typescript";

import {
  CompositionAssembly,
  type CompositionAssemblyProps,
} from "../../src/remotion/runtime/composition-assembly";

test("CompositionAssembly exposes one required and three exact optional semantic slots", () => {
  const props: CompositionAssemblyProps = {
    narrativeCore: createElement("span", null, "narrative"),
  };
  assert.deepEqual(Object.keys(props), ["narrativeCore"]);
  const assembly = CompositionAssembly(props);
  assert.ok(isValidElement<{ children?: ReactNode }>(assembly));
  assert.equal(assembly.type, Fragment);
  const narrativeChildren = Children.toArray(assembly.props.children);
  assert.equal(narrativeChildren.length, 1);
  assert.ok(isValidElement<{ children?: ReactNode }>(narrativeChildren[0]));
  assert.equal(narrativeChildren[0].props.children, "narrative");

  const storyVisualTrack = createElement("span", null, "visual");
  const globalVisualLayers = createElement("span", null, "global");
  const soundDesignTrack = createElement("span", null, "sound");
  const full = CompositionAssembly({
    narrativeCore: props.narrativeCore,
    storyVisualTrack,
    globalVisualLayers,
    soundDesignTrack,
  });
  assert.ok(isValidElement<{ children?: ReactNode }>(full));
  assert.deepEqual(
    Children.toArray(full.props.children).map(
      (child) =>
        isValidElement<{ children?: ReactNode }>(child) && child.props.children,
    ),
    ["visual", "global", "narrative", "sound"],
  );
});

test("assembly source has four approved semantic slots and no generic track array", async () => {
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
    /readonly narrativeCore: ReactNode;\s*readonly storyVisualTrack\?: ReactNode;\s*readonly globalVisualLayers\?: ReactNode;\s*readonly soundDesignTrack\?: ReactNode;/,
  );
  assert.doesNotMatch(
    source,
    /globalSound|genericTracks|track\[\]|placeholder|BaseCanvas/,
  );
});
