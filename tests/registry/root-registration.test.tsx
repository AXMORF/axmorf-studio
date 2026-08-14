import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { Children, isValidElement, type ReactNode } from "react";
import test from "node:test";
import ts from "typescript";
import { Composition, Folder } from "remotion";

import packageJson from "../../package.json";
import { StoryCompositionPropsSchema } from "../../src/contracts";
import type { ProjectRegistryEntry } from "../../src/projects/project-registry.generated";

type ElementProps = {
  readonly name?: string;
  readonly id?: string;
  readonly component?: unknown;
  readonly lazyComponent?: unknown;
  readonly durationInFrames?: number;
  readonly fps?: number;
  readonly width?: number;
  readonly height?: number;
  readonly defaultProps?: unknown;
  readonly schema?: unknown;
  readonly children?: ReactNode;
};

const elementChildren = (node: unknown) => {
  assert.ok(isValidElement<ElementProps>(node));
  return Children.toArray(node.props.children);
};

const asElement = (node: unknown) => {
  assert.ok(isValidElement<ElementProps>(node));
  return node;
};

test("Root keeps system previews when the ProjectRegistry is empty", async () => {
  const require = createRequire(import.meta.url);
  require.extensions[".css"] = () => undefined;
  const { createRemotionRoot } = await import("../../src/Root");
  const root = createRemotionRoot([]);
  const folders = elementChildren(root);
  const systemFolder = folders.find(
    (folder) =>
      isValidElement<ElementProps>(folder) &&
      folder.type === Folder &&
      folder.props.name === "System",
  );
  const storiesFolder = folders.find(
    (folder) =>
      isValidElement<ElementProps>(folder) &&
      folder.type === Folder &&
      folder.props.name === "Stories",
  );
  const systemFolderElement = asElement(systemFolder);
  const storiesFolderElement = asElement(storiesFolder);

  const systemComposition = elementChildren(systemFolderElement).find(
    (entry) =>
      isValidElement<ElementProps>(entry) &&
      entry.type === Composition &&
      entry.props.id === "CapabilityGallery",
  );
  const systemCompositionElement = asElement(systemComposition);
  assert.notEqual(systemCompositionElement.props.component, undefined);
  assert.equal(systemCompositionElement.props.lazyComponent, undefined);
  const fixedIntroPreview = elementChildren(systemFolderElement).find(
    (entry) =>
      isValidElement<ElementProps>(entry) &&
      entry.type === Composition &&
      entry.props.id === "FixedIntroPreview",
  );
  const fixedIntroPreviewElement = asElement(fixedIntroPreview);
  assert.notEqual(fixedIntroPreviewElement.props.component, undefined);
  assert.equal(fixedIntroPreviewElement.props.durationInFrames, 60);
  assert.equal(fixedIntroPreviewElement.props.fps, 30);
  assert.equal(fixedIntroPreviewElement.props.width, 1080);
  assert.equal(fixedIntroPreviewElement.props.height, 1920);
  const fixedIntroLandscapePreview = elementChildren(systemFolderElement).find(
    (entry) =>
      isValidElement<ElementProps>(entry) &&
      entry.type === Composition &&
      entry.props.id === "FixedIntroPreview16x9",
  );
  const fixedIntroLandscapePreviewElement = asElement(
    fixedIntroLandscapePreview,
  );
  assert.equal(fixedIntroLandscapePreviewElement.props.durationInFrames, 60);
  assert.equal(fixedIntroLandscapePreviewElement.props.width, 1920);
  assert.equal(fixedIntroLandscapePreviewElement.props.height, 1080);
  const fixedOutroPreview = elementChildren(systemFolderElement).find(
    (entry) =>
      isValidElement<ElementProps>(entry) &&
      entry.type === Composition &&
      entry.props.id === "FixedOutroPreview",
  );
  const fixedOutroPreviewElement = asElement(fixedOutroPreview);
  assert.notEqual(fixedOutroPreviewElement.props.component, undefined);
  assert.equal(fixedOutroPreviewElement.props.durationInFrames, 240);
  assert.equal(fixedOutroPreviewElement.props.width, 1080);
  assert.equal(fixedOutroPreviewElement.props.height, 1920);
  assert.notEqual(fixedOutroPreviewElement.props.schema, undefined);
  assert.deepEqual(fixedOutroPreviewElement.props.defaultProps, {
    references: [
      {
        title: "Remotion Documentation",
        url: "https://www.remotion.dev/docs/",
      },
      {
        title: "Remotion Story Producer",
        url: "https://github.com/zzzxc/remotion-story-producer",
      },
      {
        title: "video-shotcraft",
        url: "https://github.com/Vincentwei1021/video-shotcraft",
      },
    ],
  });
  const fixedOutroLandscapePreview = elementChildren(systemFolderElement).find(
    (entry) =>
      isValidElement<ElementProps>(entry) &&
      entry.type === Composition &&
      entry.props.id === "FixedOutroPreview16x9",
  );
  const fixedOutroLandscapePreviewElement = asElement(
    fixedOutroLandscapePreview,
  );
  assert.equal(fixedOutroLandscapePreviewElement.props.durationInFrames, 240);
  assert.equal(fixedOutroLandscapePreviewElement.props.width, 1920);
  assert.equal(fixedOutroLandscapePreviewElement.props.height, 1080);
  assert.deepEqual(elementChildren(storiesFolderElement), []);
});

test("Root maps synthetic Project entries without concrete Story assumptions", async () => {
  const require = createRequire(import.meta.url);
  require.extensions[".css"] = () => undefined;
  const { createRemotionRoot } = await import("../../src/Root");
  const load = async () => ({ default: () => null });
  const entries: readonly ProjectRegistryEntry[] = [
    {
      id: "SyntheticStory",
      fps: 24,
      width: 1080,
      height: 1080,
      durationInFrames: 96,
      defaultProps: StoryCompositionPropsSchema.parse({
        projectId: "synthetic-story",
      }),
      generatedEntryChecksum: `sha256:${"a".repeat(64)}`,
      projectRegistryEntryFingerprint: `sha256:${"b".repeat(64)}`,
      narrativeBaselineFingerprint: `sha256:${"c".repeat(64)}`,
      load,
    },
  ];
  const root = createRemotionRoot(entries);
  const storiesFolder = elementChildren(root).find(
    (folder) =>
      isValidElement<ElementProps>(folder) &&
      folder.type === Folder &&
      folder.props.name === "Stories",
  );
  const story = elementChildren(asElement(storiesFolder))[0];
  const storyElement = asElement(story);

  assert.equal(storyElement.props.component, undefined);
  assert.equal(storyElement.props.lazyComponent, load);
  assert.equal(storyElement.props.id, "SyntheticStory");
  assert.equal(storyElement.props.durationInFrames, 96);
  assert.equal(storyElement.props.fps, 24);
  assert.equal(storyElement.props.width, 1080);
  assert.equal(storyElement.props.height, 1080);
  assert.deepEqual(storyElement.props.defaultProps, {
    projectId: "synthetic-story",
  });
});

test("fresh-clone entrypoints bootstrap local projections before use", () => {
  const scripts = packageJson.scripts as Record<string, string>;
  assert.equal(scripts.bootstrap, "node --import tsx scripts/bootstrap/cli.ts");
  assert.equal(scripts.prepare, "npm run bootstrap");
  assert.equal(
    scripts["registry:generate"],
    "node --import tsx scripts/registry/cli.ts generate",
  );
  assert.equal(
    scripts["registry:check"],
    "node --import tsx scripts/registry/cli.ts check",
  );
  for (const hook of [
    "predev",
    "pretest",
    "pretest:media",
    "pretest:all",
    "pretypecheck",
    "prelint",
    "prebuild",
    "precatalog:query",
    "precompositions",
  ]) {
    assert.equal(scripts[hook], "npm run bootstrap");
  }
  assert.equal(scripts.check, "npm run check:static && npm run check:host");
  assert.match(
    `${scripts["check:static"]} ${scripts["check:host"]}`,
    /registry:check.*build.*compositions/,
  );
  assert.equal(
    scripts.test,
    "node --import tsx scripts/tests/project-tests.ts",
  );
});

test("Root statically consumes only registry metadata and passes through lazy loaders", async () => {
  const path = new URL("../../src/Root.tsx", import.meta.url);
  const source = await readFile(path, "utf8");
  const ast = ts.createSourceFile(
    path.pathname,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const imports = ast.statements
    .filter(ts.isImportDeclaration)
    .map((statement) => statement.moduleSpecifier)
    .filter(ts.isStringLiteral)
    .map((specifier) => specifier.text);
  assert.ok(imports.includes("./projects/project-registry.generated"));
  assert.equal(
    imports.some((specifier) => specifier.endsWith("/Composition")),
    false,
  );
  assert.match(source, /lazyComponent=\{entry\.load\}/);
  assert.doesNotMatch(
    source,
    /brief\.json|story\.json|render\.json|semantic-timing|node:fs|readdir|import\.meta\.glob/,
  );
});
