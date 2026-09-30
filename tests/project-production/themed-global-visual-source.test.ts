import assert from "node:assert/strict";
import test from "node:test";

import { VISUAL_THEME_PRESETS } from "@axmorf/studio/contracts";
import { assertGlobalVisualSource } from "../../scripts/project-production/application/global-visual-validator";

const source = ({ imports = "", setup = "", children = "" } = {}) => `
import {useCurrentFrame} from "remotion";
${imports}
export const GlobalVisualBaseLayer = () => null;
export const GlobalVisualDecorationLayers = () => {
  const frame = useCurrentFrame();
  ${setup}
  return <div style={{pointerEvents: "none", opacity: frame >= 0 ? 1 : 0}}>${children}</div>;
};
`;

const check = (value: string, themed = true) =>
  assertGlobalVisualSource({
    source: value,
    sourcePath: "GlobalVisualLayers.tsx",
    entryPath: "GlobalVisualLayers.tsx",
    ...(themed ? { theme: VISUAL_THEME_PRESETS.dark } : {}),
  });

test("themed GlobalVisual rejects CSS injection and non-visual browser elements", () => {
  for (const tag of [
    "style",
    "script",
    "link",
    "iframe",
    "object",
    "embed",
    "foreignObject",
  ]) {
    assert.throws(
      () => check(source({ children: `<${tag} />` })),
      /themed Composition ownership/u,
      tag,
    );
  }
  assert.throws(
    () =>
      check(
        source({
          children:
            '<div dangerouslySetInnerHTML={{__html: "<style>div{opacity:1!important}</style>"}} />',
        }),
      ),
    /themed Composition ownership/u,
  );
  for (const factory of [
    {
      imports: 'import {createElement as element} from "react";',
      name: "element",
    },
    {
      imports: 'import * as React from "react";',
      name: 'React["createElement"]',
    },
  ]) {
    assert.throws(
      () =>
        check(
          source({
            imports: factory.imports,
            setup: `const Injected = () => ${factory.name}("style", null, "div{opacity:1!important}");`,
            children: "<Injected />",
          }),
        ),
      /themed Composition ownership/u,
    );
  }
});

test("themed GlobalVisual rejects refs and events including spread and computed property forms", () => {
  for (const options of [
    { children: "<div ref={() => {}} />" },
    { children: "<div onClick={() => {}} />" },
    { children: "<svg onload={() => {}} />" },
    { setup: "const attrs = {ref: () => {}};", children: "<div {...attrs} />" },
    {
      setup: 'const attrs = {["onClick"]: () => {}};',
      children: "<div {...attrs} />",
    },
    {
      setup: "const callback = () => {}; const attrs = {ref: callback};",
      children: "<div {...attrs} />",
    },
    {
      setup: "const attrs = makeAttributes();",
      children: "<div {...attrs} />",
    },
    {
      setup: 'const attrs = {["dangerouslySetInnerHTML"]: {__html: "unsafe"}};',
      children: "<div {...attrs} />",
    },
    { setup: "const attrs = {}; void attrs.ref;" },
    { setup: "const attrs = {}; void attrs.onClick;" },
  ]) {
    assert.throws(
      () => check(source(options)),
      /themed Composition ownership/u,
    );
  }
});

test("themed GlobalVisual rejects imperative globals, timer APIs, React hooks and import aliases", () => {
  for (const name of [
    "window",
    "document",
    "globalThis",
    "self",
    "parent",
    "top",
    "frames",
    "eval",
    "Function",
    "setTimeout",
    "setInterval",
    "clearTimeout",
    "clearInterval",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "requestIdleCallback",
    "cancelIdleCallback",
    "queueMicrotask",
  ]) {
    assert.throws(
      () => check(source({ setup: `void ${name};` })),
      /themed Composition ownership/u,
      name,
    );
  }
  for (const name of [
    "useEffect",
    "useLayoutEffect",
    "useInsertionEffect",
    "useRef",
    "createRef",
    "createPortal",
  ]) {
    assert.throws(
      () =>
        check(
          source({
            imports: `import {${name} as hiddenBinding} from "react";`,
            setup: "void hiddenBinding;",
          }),
        ),
      /themed Composition ownership/u,
      name,
    );
    assert.throws(
      () =>
        check(
          source({
            imports: 'import * as React from "react";',
            setup: `void React["${name}"];`,
          }),
        ),
      /themed Composition ownership/u,
      name,
    );
  }
  assert.throws(
    () =>
      check(
        source({
          imports: 'import * as React from "react";',
          setup:
            'const {["useLayoutEffect"]: sideEffect} = React; void sideEffect;',
        }),
      ),
    /themed Composition ownership/u,
  );
  assert.throws(
    () =>
      check(
        source({
          imports:
            'import {"useEffect" as observe} from "react"; void observe;',
        }),
      ),
    /themed Composition ownership/u,
  );
});

test("themed GlobalVisual preserves frame-driven JSX/SVG graphics and local style spreads", () => {
  check(
    source({
      setup:
        'const top = frame; const local = {top, left: 10}; const stroke = {stroke: "#ffffff", strokeWidth: 2}; const radius = 12 + local.top;',
      children:
        '<svg width="100%" height="100%"><defs><linearGradient id="color"><stop offset="0%" stopColor="#fff" /></linearGradient></defs><circle r={radius} fill="url(#color)" style={{...stroke, opacity: 0.5}} />{frame > 0 ? <rect width={20} height={20} /> : null}</svg>',
    }),
  );
});

test("legacy GlobalVisual keeps its existing source policy", () => {
  const legacy = source({
    imports: 'import {useEffect as observe} from "react";',
    setup: "void observe;",
  }).replace(
    "GlobalVisualBaseLayer = () => null;",
    'GlobalVisualBaseLayer = () => <div style={{pointerEvents: "none"}} />;',
  );
  check(legacy, false);
});
