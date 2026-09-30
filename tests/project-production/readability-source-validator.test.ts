import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  resolveSceneReadabilityPolicy,
  resolveSceneViewport,
} from "@axmorf/studio/contracts";

import { validateRendererReadabilitySourceGraph } from "../../scripts/project-production/application/readability-source-validator";

const viewport = resolveSceneViewport(
  resolveSceneReadabilityPolicy({ width: 1080, height: 1920 }),
);

const validate = async (source: string) => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-readability-"));
  try {
    await writeFile(join(rootDir, "Renderer.tsx"), source);
    return await validateRendererReadabilitySourceGraph({
      rootDir,
      rendererPath: "Renderer.tsx",
      sourcePaths: ["Renderer.tsx"],
      sceneViewport: viewport,
    });
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
};

test("the shipped Scene guide example passes the real Scene boundary checker", async () => {
  const guide = await readFile(
    "packages/create-axmorf-studio/template/.agents/skills/remotion-best-practices/references/scene-implementation.md",
    "utf8",
  );
  const examples = [...guide.matchAll(/```tsx\n([\s\S]*?)```/gu)];
  assert.ok(
    examples.length > 0,
    "The Scene guide needs an executable boundary example",
  );
  for (const example of examples) await validate(example[1]!);
});

test("full-frame config rejection explains the supported Scene inputs", async () => {
  await assert.rejects(
    validate(`import {useVideoConfig} from 'remotion';
const Renderer = () => <div />;
export default Renderer;`),
    /must not own useVideoConfig.*SceneRendererProps.*fps.*viewportWidth.*viewportHeight/u,
  );
});

test("font diagnostics identify the exact element and show a valid correction", async () => {
  await assert.rejects(
    validate(`const Renderer = () => (
  <svg>
    <text>Label</text>
  </svg>
);
export default Renderer;`),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(
        error.message,
        /inherited, relative, or not statically provable/u,
      );
      assert.match(error.message, /Renderer\.tsx:3:5/u);
      assert.match(error.message, /\[readability-font-size\]/u);
      assert.match(error.message, /<text>/u);
      assert.match(error.message, /fontSize=\{36\}/u);
      return true;
    },
  );
});

test("SVG text accepts explicit pixel font size in its style", async () => {
  await validate(`const Renderer = () => <svg><text style={{fontSize: 36}}>Label</text></svg>;
export default Renderer;`);
});

test("SVG text style overrides the presentation attribute and cannot hide shrinking text", async () => {
  await assert.rejects(
    validate(`const Renderer = () => <svg><text fontSize={80} style={{fontSize: 12}}>Label</text></svg>;
export default Renderer;`),
    /Visible text size 12px is below the frozen 36px minimum.*Renderer\.tsx:1:/u,
  );
});

test("dynamic transforms report their exact expression and supported motion alternative", async () => {
  await assert.rejects(
    validate(
      "const Renderer = () => <div style={{transform: `translateY(${offset}px)`}} />;\nexport default Renderer;",
    ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(
        error.message,
        /Renderer transform must be statically provable/u,
      );
      assert.match(error.message, /Renderer\.tsx:1:48/u);
      assert.match(error.message, /\[readability-transform\]/u);
      assert.match(error.message, /left\/top/u);
      return true;
    },
  );
});

test("readable fixed sizes and frame driven position remain valid", async () => {
  await validate(`const Renderer = () => <div style={{position: 'absolute', top: offset, fontSize: 36}}>Label</div>;
export default Renderer;`);
});

test("shrinking transforms preserve their rejection and expose a source location", async () => {
  await assert.rejects(
    validate(`const Renderer = () => <div style={{transform: 'scale(0.5)'}} />;
export default Renderer;`),
    /Renderer scale must be statically proven not to shrink readable content.*Renderer\.tsx:1:48.*\[readability-scale\]/u,
  );
});

test("an unknown child expression identifies its actual container instead of a nested SVG text", async () => {
  await assert.rejects(
    validate(`const Renderer = () => (
  <svg>{items.map((item) => <text fontSize={36}>{item.label}</text>)}</svg>
);
export default Renderer;`),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Renderer\.tsx:2:3/u);
      assert.match(error.message, /Set an explicit pixel size on <svg>/u);
      assert.match(error.message, /unknown JSX child expressions/u);
      return true;
    },
  );
});

test("an unknown or relative SVG style cannot fall back to a readable presentation attribute", async () => {
  for (const style of [
    "dynamicStyle",
    "{fontSize: '0.5em'}",
    "{fontSize: size}",
  ]) {
    await assert.rejects(
      validate(`const Renderer = () => <svg><text fontSize={80} style={${style}}>Label</text></svg>;
export default Renderer;`),
      /statically provable/u,
    );
  }
});

test("inline literal arrays mapped directly to JSX do not require a font on their structural container", async () => {
  await validate(`const Renderer = () => <svg>{[1, 20, 40].map(value => (<g><text fontSize={36}>{value}</text></g>))}</svg>;
export default Renderer;`);
});

test("JSX mapped from literal arrays still validates the actual text element", async () => {
  await assert.rejects(
    validate(`const Renderer = () => <svg>{[1, 20, 40].map(value => <g><text fontSize={12}>{value}</text></g>)}</svg>;
export default Renderer;`),
    /Visible text size 12px is below the frozen 36px minimum/u,
  );
});

test("map expressions that return text remain subject to the container font requirement", async () => {
  await assert.rejects(
    validate(`const Renderer = () => <svg>{[1, 20, 40].map(value => value)}</svg>;
export default Renderer;`),
    /Set an explicit pixel size on <svg>/u,
  );
});

test("map fragment bodies cannot hide direct text from the container font requirement", async () => {
  await assert.rejects(
    validate(`const Renderer = () => <div>{[1].map(value => <>Tiny {value}</>)}</div>;
export default Renderer;`),
    /Set an explicit pixel size on <div>/u,
  );
});

test("block map returns expose graphics without inventing text on their container", async () => {
  await validate(`const Renderer = () => <svg><g>{[0, 1, 2].map(i => {
    const x = i * 40;
    return <g><rect x={x} width={20} height={20} /></g>;
  })}</g></svg>;
export default Renderer;`);
});

test("safe local literal arrays and conditional block returns expose every JSX child", async () => {
  await validate(`const Renderer = () => {
    const values = [0, 1, 2] as const;
    return <svg>{values.map(i => {
      if (i === 0) return null;
      const x = i * 40;
      return i > 1 ? <rect x={x} /> : <><circle /><path /></>;
    })}</svg>;
  };
export default Renderer;`);
});

test("conditionals and boolean short circuits do not invent container text", async () => {
  await validate(`const Renderer = () => <div>
    {flag ? <span style={{fontSize: 36}}>One</span> : null}
    {count > 0 && <span style={{fontSize: 36}}>Two</span>}
  </div>;
export default Renderer;`);
});

test("block returns and fragments cannot hide text or real small labels", async () => {
  for (const expression of [
    "[0, 1].map(i => { if (i) return 'Tiny'; return <rect />; })",
    "[0, 1].map(i => { return i ? <>Tiny</> : <rect />; })",
    "flag ? <rect /> : 'Tiny'",
    "count && <rect />",
    "<>Tiny</>",
  ]) {
    await assert.rejects(
      validate(
        `const Renderer = () => <svg>{${expression}}</svg>; export default Renderer;`,
      ),
      /Set an explicit pixel size on <svg>/u,
    );
  }
  await assert.rejects(
    validate(
      `const Renderer = () => <svg>{[0, 1].map(i => { return <text fontSize={12}>{i}</text>; })}</svg>; export default Renderer;`,
    ),
    /Visible text size 12px is below/u,
  );
});

test("mutable, escaped, shadowed, or overridden array receivers remain conservative", async () => {
  for (const setup of [
    "let values = [0, 1];",
    "const values = [0, 1]; values.map = customMap;",
    "const values = [0, 1]; mutate(values);",
    "const values = [0, 1]; const alias = values; alias.map = customMap;",
    "const values = [0, 1]; const alias = {values}; alias.values.map = customMap;",
  ]) {
    await assert.rejects(
      validate(
        `const Renderer = () => { ${setup} return <svg>{values.map(i => { return <rect />; })}</svg>; }; export default Renderer;`,
      ),
      /Set an explicit pixel size on <svg>/u,
    );
  }
  await assert.rejects(
    validate(
      `const values = [0, 1]; const Renderer = (values) => <svg>{values.map(i => <rect />)}</svg>; export default Renderer;`,
    ),
    /Set an explicit pixel size on <svg>/u,
  );
});

test("the real numeric SVG rotation and CSS translation preserve readable text", async () => {
  await validate(`const Renderer = ({viewportWidth, viewportHeight, sceneFrame}) => {
    const cx = viewportWidth / 2;
    const cy = viewportHeight * 0.4;
    const offset = sceneFrame * 0.25;
    return <svg><g transform={\`rotate(-90 \${cx} \${cy + 42})\`}>
      <text fontSize={36} style={{transform: \`translateY(\${offset}px) rotate(\${sceneFrame * 2}deg)\`}}>Label</text>
    </g></svg>;
  };
export default Renderer;`);
});

test("numeric interpolation cannot inject additional shrinking transform functions", async () => {
  for (const [setup, parameter] of [
    ["const offset = '0px) scale(0.1) translateY(0';", ""],
    ["const offset = externalValue;", ""],
    ["const offset = 20;", "offset"],
  ]) {
    await assert.rejects(
      validate(
        `${setup} const Renderer = (${parameter}) => <div style={{fontSize: 36, transform: \`translateY(\${offset}px)\`}}>Label</div>; export default Renderer;`,
      ),
      /readability-transform/u,
    );
  }
  await assert.rejects(
    validate(
      `const scale = 2; const Renderer = (scale) => <div style={{fontSize: 36, scale}}>Label</div>; export default Renderer;`,
    ),
    /readability-transform/u,
  );
  await assert.rejects(
    validate(
      `const Renderer = () => <div style={{fontSize: 36, transform: 'translateY(@px)'}}>Label</div>; export default Renderer;`,
    ),
    /readability-transform/u,
  );
});

test("CSS and SVG transforms use their own complete grammar", async () => {
  for (const transform of [
    "style={{transform: 'rotate(-90 200 240)'}}",
    "transform='rotate(90deg)'",
    "style={{transform: 'translate(20, 30)'}}",
    "style={{transform: 'rotate(30deg) garbage'}}",
    "style={{transform: 'matrix(0.1, 0, 0, 0.1, 0, 0)'}}",
    "style={{transform: 'rotateX(80deg)'}}",
    "transform='scale(2) matrix(.1 0 0 .1 0 0)'",
    "style={{scale: '1 0.1'}}",
  ]) {
    await assert.rejects(
      validate(
        `const Renderer = () => <svg><text fontSize={36} ${transform}>Label</text></svg>; export default Renderer;`,
      ),
      /readability-(?:transform|scale)/u,
    );
  }
  await validate(
    `const Renderer = () => <svg><text fontSize={36} transform='translate(20, 30) rotate(-90 200 240) scale(1 2)' style={{transform: 'translate(-20px, 20%) rotate(0.25turn) scale(1, 2)', scale: '1 2'}}>Label</text></svg>; export default Renderer;`,
  );
});

test("only proven graphics-only native SVG subtrees are exempt from text scaling checks", async () => {
  await validate(`const Renderer = ({sceneFrame}) => <svg><g transform={\`scale(\${sceneFrame / 100})\`}>
    {[0, 1, 2].map(i => { const x = i * 40; return <rect x={x} />; })}
  </g></svg>; export default Renderer;`);
  for (const children of [
    "<text fontSize={36}>Label</text>",
    "<Graphic />",
    "{unknownChildren}",
    "<foreignObject><div style={{fontSize: 36}}>Label</div></foreignObject>",
    "<use href='#label' />",
  ]) {
    await assert.rejects(
      validate(
        `const Renderer = ({sceneFrame}) => <svg><g transform={\`scale(\${sceneFrame / 100})\`}>${children}</g></svg>; export default Renderer;`,
      ),
      /readability-(?:transform|scale)/u,
    );
  }
});

test("graphics inside text-affecting definitions and opaque attributes are not exempt", async () => {
  for (const source of [
    "<svg><clipPath><rect transform={dynamicTransform}/></clipPath></svg>",
    "<svg><g {...props} transform={dynamicTransform}><rect /></g></svg>",
    "<svg><g dangerouslySetInnerHTML={html} transform={dynamicTransform}/></svg>",
    "<svg><g ref={modifyElement} transform={dynamicTransform}><rect /></g></svg>",
  ]) {
    await assert.rejects(
      validate(`const Renderer = () => ${source}; export default Renderer;`),
      /readability-transform/u,
    );
  }
});

test("transform style objects cannot use a shadowed, mutated, or opaque safe-looking binding", async () => {
  for (const [setup, parameter, style] of [
    [
      "const styles = {fontSize: 36, transform: 'scale(1)'};",
      "styles",
      "styles",
    ],
    [
      "const styles = {fontSize: 36, transform: 'scale(1)'}; styles.transform = 'scale(0.1)';",
      "",
      "styles",
    ],
    [
      "const styles = {fontSize: 36, transform: 'scale(1)'}; mutate(styles);",
      "",
      "styles",
    ],
    [
      "const styles = {fontSize: 36}; const escaped = {styles}; mutate(escaped);",
      "",
      "styles",
    ],
    ["", "", "{fontSize: 36, ...unknownStyle}"],
    ["", "", "{fontSize: 36, get transform() { return 'scale(0.1)'; }}"],
  ]) {
    await assert.rejects(
      validate(
        `${setup} const Renderer = (${parameter}) => <div style={${style}}>Label</div>; export default Renderer;`,
      ),
      /readability-transform/u,
    );
  }
  await validate(
    `const styles = {fontSize: 36, transform: 'rotate(30deg)'}; const Renderer = () => <div style={styles}>Label</div>; export default Renderer;`,
  );
});

test("immutable literal style spreads resolve without weakening unknown spread checks", async () => {
  await validate(`const position = {left: 20}; const rotated = {transform: 'rotate(20deg)'};
const Renderer = () => <div style={{...position, ...rotated, fontSize: 36}}>Label</div>; export default Renderer;`);
  await assert.rejects(
    validate(
      `const base = {transform: 'scale(0.1)'}; const Renderer = () => <div style={{fontSize: 36, ...base}}>Label</div>; export default Renderer;`,
    ),
    /readability-scale/u,
  );
});

test("standard Remotion numeric imports and exact SceneRendererProps inputs support motion", async () => {
  await validate(`import type {SceneRendererProps} from '@axmorf/studio/remotion';
import {interpolate, spring as animateSpring} from 'remotion';
const Renderer = ({sceneFrame, fps, viewportWidth: width}: SceneRendererProps) => {
  const offset = interpolate(sceneFrame, [0, 30], [30, 0]);
  const angle = animateSpring({frame: sceneFrame, fps});
  return <div style={{fontSize: 36, transform: \`translateY(\${offset}px) rotate(\${angle}deg) translateX(\${width}px)\`}}>Label</div>;
}; export default Renderer;`);
  await validate(`import type {SceneRendererProps as Inputs} from '@axmorf/studio/remotion';
const Renderer = (props: Inputs) => <div style={{fontSize: 36, transform: \`translateX(\${props.sceneFrame}px)\`}}>Label</div>; export default Renderer;`);
});

test("local numeric-looking functions and untrusted type annotations cannot prove interpolation", async () => {
  for (const source of [
    "const interpolate = () => '0px) scale(0.1) translateX(0'; const Renderer = () => <div style={{fontSize: 36, transform: `translateX(${interpolate()}px)`}}>Label</div>;",
    "import {interpolate} from 'remotion'; const Renderer = (interpolate) => <div style={{fontSize: 36, transform: `translateX(${interpolate()}px)`}}>Label</div>;",
    "type SceneRendererProps = {sceneFrame: number}; const Renderer = ({sceneFrame}: SceneRendererProps) => <div style={{fontSize: 36, transform: `translateX(${sceneFrame}px)`}}>Label</div>;",
    "const Renderer = (offset: number) => <div style={{fontSize: 36, transform: `translateX(${offset}px)`}}>Label</div>;",
    "import type {SceneRendererProps} from '@axmorf/studio/remotion'; const Renderer = ({sceneFrame}: SceneRendererProps) => { ({sceneFrame} = externalValue); return <div style={{fontSize: 36, transform: `translateX(${sceneFrame}px)`}}>Label</div>; };",
    "import type {SceneRendererProps} from '@axmorf/studio/remotion'; const Renderer = ({sceneFrame}: SceneRendererProps) => { sceneFrame = externalValue; return <div style={{fontSize: 36, transform: `translateX(${sceneFrame}px)`}}>Label</div>; };",
    "import type {SceneRendererProps} from '@axmorf/studio/remotion'; const Renderer = (props: SceneRendererProps) => { mutate(props); return <div style={{fontSize: 36, transform: `translateX(${props.sceneFrame}px)`}}>Label</div>; };",
  ]) {
    await assert.rejects(
      validate(`${source} export default Renderer;`),
      /readability-transform/u,
    );
  }
});

test("a graphics-only SVG root may receive an opaque style without inventing text", async () => {
  await validate(`const paths = ['M0 0 H20', 'M20 20 V40'];
const Renderer = ({style}) => <svg style={{display: 'block', ...style}}>{paths.map(path => <path d={path}/>)}</svg>; export default Renderer;`);
  await assert.rejects(
    validate(
      `const Renderer = ({style}) => <svg style={{display: 'block', ...style}}><text fontSize={36}>Label</text></svg>; export default Renderer;`,
    ),
    /readability-transform/u,
  );
});

test("font values use lexical bindings and the final style override order", async () => {
  for (const source of [
    "const size = 36; const Renderer = (size) => <div style={{fontSize: size}}>Label</div>;",
    "const override = {fontSize: 12}; const Renderer = () => <div style={{fontSize: 36, ...override}}>Label</div>;",
    "const override = {fontSize: '0.3em'}; const Renderer = () => <svg><text fontSize={36} style={{...override}}>Label</text></svg>;",
  ]) {
    await assert.rejects(
      validate(`${source} export default Renderer;`),
      /readability-font-(?:size|minimum)/u,
    );
  }
  await validate(
    `const base = {fontSize: 12}; const Renderer = () => <div style={{...base, fontSize: 36}}>Label</div>; export default Renderer;`,
  );
});

test("literal arrays may read length for layout while length writes remain unknown", async () => {
  await validate(`const values = [0, 1, 2]; const Renderer = () => <svg>{values.map(i => {
    const x = i * 500 / values.length;
    return <rect x={x} />;
  })}</svg>; export default Renderer;`);
  await assert.rejects(
    validate(
      `const values = [0, 1, 2]; values.length = 1; const Renderer = () => <svg>{values.map(i => <rect />)}</svg>; export default Renderer;`,
    ),
    /readability-font-size/u,
  );
});

test("literal shorthand font and scale values retain lexical readability proofs", async () => {
  await validate(
    `const fontSize = 36; const scale = 2; const Renderer = () => <div style={{fontSize, scale}}>Label</div>; export default Renderer;`,
  );
});

test("self-closing and children attributes cannot hide actual small text", async () => {
  for (const source of [
    "<svg><text fontSize={12} children='Tiny' /></svg>",
    "<div style={{fontSize: 12}} children='Tiny' />",
    "<div children={label} />",
    "<svg><text fontSize={12} children='Tiny'></text></svg>",
  ]) {
    await assert.rejects(
      validate(`const Renderer = () => ${source}; export default Renderer;`),
      /readability-font-(?:size|minimum)/u,
    );
  }
  await validate(
    `const Renderer = () => <svg><text fontSize={36} children='Label'/></svg>; export default Renderer;`,
  );
  await validate(
    `const Renderer = () => <div children={<span style={{fontSize: 36}}>Label</span>} />; export default Renderer;`,
  );
});

test("JSX attribute spreads respect final style and SVG transform authority", async () => {
  for (const source of [
    "<div style={{fontSize: 36}} {...props}>Tiny</div>",
    "<svg><text fontSize={36} transform='scale(1)' {...props}>Tiny</text></svg>",
    "<svg><text fontSize={36} {...{fontSize: 12}}>Tiny</text></svg>",
    "<div style={{fontSize: 36}} {...{style: {fontSize: 12}}}>Tiny</div>",
  ]) {
    await assert.rejects(
      validate(
        `const Renderer = (props) => ${source}; export default Renderer;`,
      ),
      /readability-(?:transform|font-size|font-minimum)/u,
    );
  }
  await validate(
    `const Renderer = (props) => <div {...props} style={{fontSize: 36}}>Label</div>; export default Renderer;`,
  );
  await validate(
    `const Renderer = (props) => <div {...props} style={{}}><span style={{fontSize: 36}}>Label</span></div>; export default Renderer;`,
  );
});

test("every map reference must prevent callback receiver escape, including non-rendered calls", async () => {
  for (const mutation of [
    "values.map((v, i, array) => Object.defineProperty(array, 'map', {value: () => ['Tiny']}));",
    "values.map((...args) => Object.defineProperty(args[2], 'map', {value: () => ['Tiny']}));",
    "values.map(function() { Object.defineProperty(arguments[2], 'map', {value: () => ['Tiny']}); });",
    "values.map(callback);",
    "values.map(v => <span />, receiver);",
  ]) {
    await assert.rejects(
      validate(
        `const values = [0, 1, 2]; ${mutation} const Renderer = () => <div>{values.map(i => <span style={{fontSize:36}}>Good</span>)}</div>; export default Renderer;`,
      ),
      /readability-font-size/u,
    );
  }
});
