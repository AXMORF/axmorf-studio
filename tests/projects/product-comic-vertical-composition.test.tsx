import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {isValidElement} from "react";
import test from "node:test";
import ts from "typescript";

import {CompositionAssembly} from "../../src/remotion/runtime/composition-assembly";
import {NarrativeCore} from "../../src/remotion/runtime/narrative-core";
import {SoundDesignTrack} from "../../src/remotion/runtime/sound-design";
import {StoryVisualTrack} from "../../src/remotion/runtime/story-visual";
import {
  createProductComicVerticalNarrativeCoreProps,
  productComicVerticalCompositionMetadata,
} from "../../src/projects/product-comic-vertical/Composition";

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
    }>(element),
  );
  assert.equal(element.type, CompositionAssembly);
  assert.ok(isValidElement(element.props.storyVisualTrack));
  assert.equal(element.props.storyVisualTrack.type, StoryVisualTrack);
  assert.ok(isValidElement(element.props.narrativeCore));
  assert.equal(element.props.narrativeCore.type, NarrativeCore);
  assert.ok(isValidElement(element.props.soundDesignTrack));
  assert.equal(element.props.soundDesignTrack.type, SoundDesignTrack);
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
  assert.match(source, /scene-runtime-data/u);
  assert.match(source, /sealedNarration\.completeAudio\.localPath/u);
  assert.match(source, /export default ProductComicVerticalComposition/u);
  assert.doesNotMatch(
    source,
    /GlobalVisualLayers|GlobalSoundTrack|FinalAssembly|chunk.*\.wav|node:fs|readFile|fetch\(|https?:|BaseCanvas|capabilities|story-check/u,
  );
});
