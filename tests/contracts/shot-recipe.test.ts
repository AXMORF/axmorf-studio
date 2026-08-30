import assert from "node:assert/strict";
import test from "node:test";

import {
  ShotRecipeSelectionSchema,
  buildShotRecipeSelection,
} from "@axmorf/studio/contracts";

const sha = (character: string) => `sha256:${character.repeat(64)}`;

test("empty ShotRecipeSelection is explicit stable and has no fake none card", () => {
  const first = buildShotRecipeSelection({
    taskInputFingerprint: sha("a"),
    selections: [],
  });
  const second = buildShotRecipeSelection({
    taskInputFingerprint: sha("a"),
    selections: [],
  });
  assert.deepEqual(first, second);
  assert.throws(() =>
    ShotRecipeSelectionSchema.parse({
      ...first,
      selections: [{ mode: "none", cardId: "none" }],
    }),
  );
});

test("inspiration-only preserves provenance without exact or pass claims", () => {
  const selection = buildShotRecipeSelection({
    taskInputFingerprint: sha("a"),
    selections: [
      {
        mode: "inspiration-only",
        sourceId: "video-shotcraft",
        snapshotFingerprint: sha("b"),
        cardId: "draw-svg-trace",
        styleKey: "draw-svg-trace",
        cardFingerprint: sha("c"),
        styleFingerprint: sha("d"),
        selectionReason:
          "Use the visible tracing principle without an exact claim.",
      },
    ],
  });
  assert.equal(selection.selections[0].mode, "inspiration-only");
  assert.throws(() =>
    ShotRecipeSelectionSchema.parse({
      ...selection,
      selections: [{ ...selection.selections[0], fidelityStatus: "pass" }],
    }),
  );
});

test("exact selections bind all immutable demo preview closure and localization identities", () => {
  const exact = {
    mode: "exact-demo-localized" as const,
    sourceId: "video-shotcraft" as const,
    snapshotFingerprint: sha("b"),
    cardId: "draw-svg-trace",
    styleKey: "draw-svg-trace",
    cardFingerprint: sha("c"),
    styleFingerprint: sha("d"),
    cardDocumentChecksum: sha("e"),
    demoSourceChecksum: sha("f"),
    previewChecksum: sha("1"),
    closureFingerprint: sha("2"),
    localizationFingerprint: sha("3"),
    adaptationMode: "adapted" as const,
    selectionReason: "Trace the synthetic proof shape.",
    requiredTraits: ["visible moving pen", "closed outline handoff"],
  };
  const selection = buildShotRecipeSelection({
    taskInputFingerprint: sha("a"),
    selections: [exact],
  });
  assert.equal(selection.selections[0].mode, "exact-demo-localized");
  const missingPreview: Record<string, unknown> = { ...exact };
  delete missingPreview.previewChecksum;
  assert.throws(() =>
    buildShotRecipeSelection({
      taskInputFingerprint: sha("a"),
      selections: [missingPreview],
    }),
  );
});
