import assert from "node:assert/strict";
import test from "node:test";

import {
  SceneOriginalityBaselineSchema,
  SceneSourceGraphSchema,
  buildSceneOriginalityBaseline,
  buildSceneSourceGraph,
  findSceneOriginalityConflicts,
} from "../../packages/studio/src/contracts/scene-originality";

const source = ({ label = "one", comment = "" } = {}) => `\uFEFF${comment}
const Renderer = () => <div data-label={${JSON.stringify(label)}} />;
export default Renderer;
`;

test("Scene source graph ignores BOM, comments, file order, and formatting", () => {
  const compact = buildSceneSourceGraph([
    {
      path: "Renderer.tsx",
      source:
        'const Renderer=()=> <div data-label={"one"}/>;export default Renderer;',
    },
    { path: "helpers/palette.ts", source: "export const ink='#111';" },
  ]);
  const formatted = buildSceneSourceGraph([
    {
      path: "helpers/palette.ts",
      source: "// palette comment\nexport const ink = '#111';\n",
    },
    {
      path: "Renderer.tsx",
      source: source({ comment: "// renderer comment" }),
    },
  ]);
  assert.equal(
    compact.sourceGraphFingerprint,
    formatted.sourceGraphFingerprint,
  );
  assert.deepEqual(
    formatted.files.map(({ path }) => path),
    ["helpers/palette.ts", "Renderer.tsx"].sort((left, right) =>
      left.localeCompare(right),
    ),
  );
});

test("Scene source graph treats JSX comment containers as trivia", () => {
  const withoutComment = buildSceneSourceGraph([
    {
      path: "Renderer.tsx",
      source: "const Renderer = () => <div></div>; export default Renderer;",
    },
  ]);
  const withComment = buildSceneSourceGraph([
    {
      path: "Renderer.tsx",
      source:
        "const Renderer = () => <div>{/* authoring note */}</div>; export default Renderer;",
    },
  ]);
  assert.equal(
    withoutComment.sourceGraphFingerprint,
    withComment.sourceGraphFingerprint,
  );
});

test("Scene source graph preserves semantic tokens across every TS and TSX file", () => {
  const baseline = buildSceneSourceGraph([
    { path: "Renderer.tsx", source: source() },
    {
      path: "helpers/content.ts",
      source:
        "export const pattern = /a b/u; export const copy = `hello ${name} world`;",
    },
    { path: "helpers/model.mts", source: "export const version = 1;" },
  ]);
  const helperChanged = buildSceneSourceGraph([
    { path: "Renderer.tsx", source: source() },
    {
      path: "helpers/content.ts",
      source:
        "export const pattern = /ab/u; export const copy = `hello ${name} world`;",
    },
    { path: "helpers/model.mts", source: "export const version = 1;" },
  ]);
  const rendererChanged = buildSceneSourceGraph([
    { path: "Renderer.tsx", source: source({ label: "two" }) },
    {
      path: "helpers/content.ts",
      source:
        "export const pattern = /a b/u; export const copy = `hello ${name} world`;",
    },
    { path: "helpers/model.mts", source: "export const version = 1;" },
  ]);
  assert.notEqual(
    baseline.sourceGraphFingerprint,
    helperChanged.sourceGraphFingerprint,
  );
  assert.notEqual(
    baseline.sourceGraphFingerprint,
    rendererChanged.sourceGraphFingerprint,
  );
});

test("Scene source graph rejects duplicate paths and stale fingerprints", () => {
  assert.throws(
    () =>
      buildSceneSourceGraph([
        { path: "Renderer.tsx", source: source() },
        { path: "Renderer.tsx", source: source() },
      ]),
    /sorted and unique/u,
  );
  const graph = buildSceneSourceGraph([
    { path: "Renderer.tsx", source: source() },
  ]);
  assert.throws(() =>
    SceneSourceGraphSchema.parse({
      ...graph,
      sourceGraphFingerprint: `sha256:${"0".repeat(64)}`,
    }),
  );
});

test("Story-bound baseline sorts ownership and permits only the same owner reuse", () => {
  const sharedGraph = buildSceneSourceGraph([
    { path: "Renderer.tsx", source: source() },
  ]).sourceGraphFingerprint;
  const baseline = buildSceneOriginalityBaseline({
    subjectStoryId: "current-story",
    entries: [
      {
        owner: { storyId: "other-story", meaningId: "opening" },
        sourceGraphFingerprint: sharedGraph,
      },
      {
        owner: { storyId: "current-story", meaningId: "same-meaning" },
        sourceGraphFingerprint: sharedGraph,
      },
    ],
  });
  assert.deepEqual(
    baseline.entries.map(({ owner }) => `${owner.storyId}/${owner.meaningId}`),
    ["current-story/same-meaning", "other-story/opening"],
  );
  assert.deepEqual(
    findSceneOriginalityConflicts({
      baseline,
      candidate: {
        owner: { storyId: "current-story", meaningId: "same-meaning" },
        sourceGraphFingerprint: sharedGraph,
      },
    }).map(({ owner }) => `${owner.storyId}/${owner.meaningId}`),
    ["other-story/opening"],
  );
  assert.deepEqual(
    findSceneOriginalityConflicts({
      baseline,
      candidate: {
        owner: { storyId: "current-story", meaningId: "new-meaning" },
        sourceGraphFingerprint: sharedGraph,
      },
    }).map(({ owner }) => `${owner.storyId}/${owner.meaningId}`),
    ["current-story/same-meaning", "other-story/opening"],
  );
  assert.throws(() =>
    findSceneOriginalityConflicts({
      baseline,
      candidate: {
        owner: { storyId: "unbound-story", meaningId: "opening" },
        sourceGraphFingerprint: sharedGraph,
      },
    }),
  );
  assert.throws(() =>
    SceneOriginalityBaselineSchema.parse({
      ...baseline,
      baselineFingerprint: `sha256:${"f".repeat(64)}`,
    }),
  );
});
