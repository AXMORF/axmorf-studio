import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { Children, isValidElement, type ReactNode } from "react";
import test from "node:test";
import ts from "typescript";
import { Composition, Folder } from "remotion";

import packageJson from "../../package.json";
import { projectRegistry } from "../../src/projects/project-registry.generated";

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

test("Root keeps the system Composition and maps Story entries lazily", async () => {
  const require = createRequire(import.meta.url);
  require.extensions[".css"] = () => undefined;
  const { RemotionRoot } = await import("../../src/Root");
  const root = RemotionRoot({});
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

  const story = elementChildren(storiesFolderElement).find(
    (entry) =>
      isValidElement<ElementProps>(entry) &&
      entry.type === Composition &&
      entry.props.id === "GpsRelativity",
  );
  const storyElement = asElement(story);
  const gpsRegistryEntry = projectRegistry.find(
    (entry) => entry.id === "GpsRelativity",
  );
  assert.ok(gpsRegistryEntry);
  assert.equal(storyElement.props.component, undefined);
  assert.equal(storyElement.props.lazyComponent, gpsRegistryEntry.load);
  assert.equal(storyElement.props.durationInFrames, 1731);
  assert.equal(storyElement.props.fps, 30);
  assert.equal(storyElement.props.width, 1920);
  assert.equal(storyElement.props.height, 1080);
  assert.deepEqual(storyElement.props.defaultProps, {
    projectId: "gps-relativity",
  });
});

test("build and listing generate before bundle while formal check detects drift first", () => {
  const scripts = packageJson.scripts as Record<string, string>;
  assert.equal(
    scripts["registry:generate"],
    "node --import tsx scripts/registry/cli.ts generate",
  );
  assert.equal(
    scripts["registry:check"],
    "node --import tsx scripts/registry/cli.ts check",
  );
  assert.equal(scripts.predev, "npm run registry:generate");
  assert.equal(scripts.prebuild, "npm run registry:generate");
  assert.equal(scripts.precompositions, "npm run registry:generate");
  assert.match(scripts.check, /registry:check.*build.*compositions/);
  for (const pattern of [
    "tests/runtime/*.test.tsx",
    "tests/projects/*.test.tsx",
    "tests/registry/*.test.ts",
    "tests/registry/*.test.tsx",
  ]) {
    assert.match(scripts.test, new RegExp(pattern.replaceAll("*", "\\*")));
  }
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
