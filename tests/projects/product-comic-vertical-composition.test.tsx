import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {Children, Fragment, isValidElement, type ReactNode} from "react";
import test from "node:test";
import ts from "typescript";

import {CompositionAssembly} from "../../src/remotion/runtime/composition-assembly";
import {GlobalSoundTrack} from "../../src/remotion/runtime/global-sound";
import {NarrativeCore} from "../../src/remotion/runtime/narrative-core";
import {SoundDesignTrack} from "../../src/remotion/runtime/sound-design";
import {StoryVisualTrack} from "../../src/remotion/runtime/story-visual";
import {
  createProductComicVerticalNarrativeCoreProps,
  productComicVerticalCompositionMetadata,
} from "../../src/projects/product-comic-vertical/Composition";
import {GlobalVisualLayers} from "../../src/projects/product-comic-vertical/global-visual/GlobalVisualLayers";

test("product comic vertical assembles Scenes around one NarrativeCore", async () => {
  const module = await import(
    "../../src/projects/product-comic-vertical/Composition"
  );
  assert.equal(typeof module.default, "function");
  const element = module.default(
    productComicVerticalCompositionMetadata.defaultProps,
  );
  assert.ok(
    isValidElement<{
      narrativeCore: unknown;
      storyVisualTrack: unknown;
      soundDesignTrack: unknown;
      globalVisualLayers: unknown;
    }>(element),
  );
  assert.equal(element.type, CompositionAssembly);
  assert.ok(isValidElement(element.props.storyVisualTrack));
  assert.equal(element.props.storyVisualTrack.type, StoryVisualTrack);
  assert.ok(isValidElement(element.props.narrativeCore));
  assert.equal(element.props.narrativeCore.type, NarrativeCore);
  assert.ok(isValidElement(element.props.globalVisualLayers));
  assert.equal(element.props.globalVisualLayers.type, GlobalVisualLayers);
  const soundDesignTrack = element.props.soundDesignTrack;
  assert.ok(isValidElement<{children: ReactNode}>(soundDesignTrack));
  assert.equal(soundDesignTrack.type, Fragment);
  const soundChildren = Children.toArray(soundDesignTrack.props.children);
  assert.equal(soundChildren.length, 2);
  assert.ok(isValidElement(soundChildren[0]));
  assert.equal(soundChildren[0].type, SoundDesignTrack);
  assert.ok(isValidElement(soundChildren[1]));
  assert.equal(soundChildren[1].type, GlobalSoundTrack);
  assert.deepEqual(productComicVerticalCompositionMetadata, {
    id: "ProductComicVertical",
    fps: 30,
    width: 1080,
    height: 1920,
    durationInFrames: 5116,
    defaultProps: {projectId: "product-comic-vertical"},
  });
  assert.throws(() =>
    createProductComicVerticalNarrativeCoreProps({projectId: "other-story"}),
  );
});

test("Composition keeps sealed narration static and delegates visual and local sound projections", async () => {
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
  assert.match(source, /CompositionAssembly/u);
  assert.match(source, /StoryVisualTrack/u);
  assert.match(source, /SoundDesignTrack/u);
  assert.match(source, /GlobalVisualLayers/u);
  assert.match(source, /GlobalSoundTrack/u);
  assert.match(source, /final-assembly-data/u);
  assert.match(source, /scene-runtime-data/u);
  assert.match(source, /sealedNarration\.completeAudio\.localPath/u);
  assert.match(source, /export default ProductComicVerticalComposition/u);
  assert.doesNotMatch(
    source,
    /chunk.*\.wav|node:fs|readFile|fetch\(|https?:|BaseCanvas|capabilities|story-check/u,
  );
});
