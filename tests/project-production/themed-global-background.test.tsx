import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import {
  Children,
  createElement,
  isValidElement,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AbsoluteFill } from "remotion";
import ts from "typescript";

import { VISUAL_THEME_PRESETS } from "@axmorf/studio/contracts";
import * as runtime from "@axmorf/studio/remotion";
import { renderProjectAuthoringBuildScaffold } from "../../scripts/project-production/application/project-scaffold";

type StyledElement = ReactElement<{
  children?: ReactNode;
  style?: CSSProperties;
}>;

const styledElement = (value: unknown): StyledElement => {
  assert.ok(
    isValidElement<{ children?: ReactNode; style?: CSSProperties }>(value),
  );
  return value;
};

// Execute the emitted Composition function with real assembly/background
// components and inert media/Scene components, without a browser or provider.
const mountGeneratedComposition = (
  theme?: typeof VISUAL_THEME_PRESETS.dark,
) => {
  const source = renderProjectAuthoringBuildScaffold({
    storyId: "theme-order-proof",
    runtimeInputFingerprint: `sha256:${"a".repeat(64)}`,
  });
  const ast = ts.createSourceFile(
    "Composition.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const exportAssignment = ast.statements.find(ts.isExportAssignment);
  assert.ok(exportAssignment && ts.isIdentifier(exportAssignment.expression));
  const exportName = exportAssignment.expression.text;
  const definition = ast.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find(
      (declaration) =>
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === exportName,
    );
  assert.ok(definition?.initializer);
  const code = ts.transpileModule(
    `const MountedComposition = ${definition.initializer.getText(ast)}; MountedComposition;`,
    {
      compilerOptions: {
        jsx: ts.JsxEmit.React,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const marker = (name: string) => () =>
    createElement("div", { "data-layer": name });
  const MountedComposition = runInNewContext(code, {
    React: { createElement },
    AbsoluteFill,
    CompositionAssembly: runtime.CompositionAssembly,
    ThemedGlobalVisualBackground: runtime.ThemedGlobalVisualBackground,
    visualStyle: theme === undefined ? {} : { theme },
    globalVisualLayerPolicy: {
      decorationFrameRange: { startFrame: 30, endFrame: 90 },
    },
    ProductionGlobalVisualBaseLayer: marker("legacy-base"),
    ProductionGlobalVisualDecorationLayers: marker("decoration"),
    Sequence: ({ children }: { children?: ReactNode }) =>
      createElement("div", { "data-layer": "decoration-window" }, children),
    StoryVisualTrack: marker("scene"),
    productionStoryVisualProjection: {},
    productionRendererRegistry: {},
    productionRendererPropsByMeaning: {},
    NarrativeCore: marker("narrative"),
    createProductionNarrativeCoreProps: () => ({}),
    SoundDesignTrack: marker("sound"),
    productionSoundDesignProjection: {},
  }) as (props: unknown) => ReactElement<runtime.CompositionAssemblyProps>;
  return MountedComposition({ projectId: "theme-order-proof" });
};

test("emitted themed Composition mounts decoration only behind Scenes inside the fixed background", () => {
  for (const theme of Object.values(VISUAL_THEME_PRESETS)) {
    const mounted = mountGeneratedComposition(theme);
    assert.equal(mounted.type, runtime.CompositionAssembly);
    assert.equal(mounted.props.globalVisualLayers, null);
    const background = styledElement(
      mounted.props.globalVisualBackgroundLayers,
    );
    assert.equal(background.type, runtime.ThemedGlobalVisualBackground);
    const markup = renderToStaticMarkup(mounted);
    assert.equal(markup.match(/data-layer="decoration"/gu)?.length, 1);
    assert.ok(
      markup.indexOf('data-layer="decoration"') <
        markup.indexOf('data-layer="scene"'),
    );
    assert.doesNotMatch(markup, /data-layer="legacy-base"/u);
  }
});

test("emitted legacy Composition keeps its base and foreground decoration order", () => {
  const mounted = mountGeneratedComposition();
  assert.ok(mounted.props.globalVisualLayers);
  const markup = renderToStaticMarkup(mounted);
  assert.ok(
    markup.indexOf('data-layer="legacy-base"') <
      markup.indexOf('data-layer="scene"'),
  );
  assert.ok(
    markup.indexOf('data-layer="scene"') <
      markup.indexOf('data-layer="decoration"'),
  );
  assert.equal(markup.match(/data-layer="decoration"/gu)?.length, 1);
});

test("themed background confines opaque high-z-index SVG decoration to one fixed 8 percent group", () => {
  const opaqueDecoration = createElement(
    "div",
    {
      style: {
        position: "fixed",
        inset: -1000,
        opacity: 1,
        zIndex: 2147483647,
        backgroundColor: "#ffffff",
      },
    },
    createElement(
      "svg",
      { width: "100%", height: "100%" },
      createElement("rect", { width: "100%", height: "100%", fill: "#000000" }),
    ),
  );
  for (const theme of Object.values(VISUAL_THEME_PRESETS)) {
    const root = styledElement(
      runtime.ThemedGlobalVisualBackground({
        theme,
        children: opaqueDecoration,
      }),
    );
    assert.equal(root.type, AbsoluteFill);
    assert.equal(root.props.style?.backgroundColor, theme.background);
    assert.equal(root.props.style?.isolation, "isolate");
    const group = styledElement(Children.only(root.props.children));
    assert.equal(group.type, AbsoluteFill);
    assert.deepEqual(group.props.style, {
      opacity: 0.08,
      isolation: "isolate",
      clipPath: "inset(0)",
      pointerEvents: "none",
    });
    assert.equal(Children.only(group.props.children), opaqueDecoration);
    assert.match(
      renderToStaticMarkup(root),
      /opacity:0\.08;isolation:isolate;clip-path:inset\(0\);pointer-events:none/u,
    );
  }
});
