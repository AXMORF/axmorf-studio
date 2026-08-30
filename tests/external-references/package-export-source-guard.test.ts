import assert from "node:assert/strict";
import test from "node:test";

import { assertGuardedSource } from "../../scripts/external-references/source-guard";

const allowedBarePackages = new Map([
  ["@axmorf/studio", "workspace"],
  ["react", "19.2.3"],
  ["remotion", "4.0.489"],
]);

const allowedBareSpecifiers = new Set([
  "@axmorf/studio/contracts",
  "@axmorf/studio/remotion",
  "react",
  "remotion",
]);

test("package-mode source guard allows only public runtime exports", () => {
  assert.doesNotThrow(() =>
    assertGuardedSource({
      source:
        'import type {SceneRendererProps} from "@axmorf/studio/remotion";',
      sourcePath: "src/projects/story/scenes/opening/Renderer.tsx",
      allowedBarePackages,
      allowedBareSpecifiers,
      relativeRoot: "src",
    }),
  );

  assert.throws(
    () =>
      assertGuardedSource({
        source:
          'import type {SceneRendererProps} from "@axmorf/studio/src/remotion/runtime/story-visual/types";',
        sourcePath: "src/projects/story/scenes/opening/Renderer.tsx",
        allowedBarePackages,
        allowedBareSpecifiers,
        relativeRoot: "src",
      }),
    /Bare package export is not approved/u,
  );
});

test("source guard keeps package-level compatibility when exact exports are not requested", () => {
  assert.doesNotThrow(() =>
    assertGuardedSource({
      source: 'import {legacy} from "approved-package/deep";',
      sourcePath: "src/legacy.ts",
      allowedBarePackages: new Map([["approved-package", "1.0.0"]]),
      relativeRoot: "src",
    }),
  );
});
