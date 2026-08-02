import assert from "node:assert/strict";
import test from "node:test";

import {
  VISUAL_STYLE_FINGERPRINT_VERSION,
  VisualStyleSpecSchema,
  computeVisualStyleFingerprint,
} from "../../src/contracts/visual-style";

const digest = (character: string) => `sha256:${character.repeat(64)}`;

const validVisualStyle = {
  schemaVersion: 1,
  storyId: "synthetic-story",
  styleProfileId: "cinematic-3d",
  resourceCatalogFingerprint: digest("a"),
  artDirection: {
    medium: "cinematic scientific visualization",
    palette: "deep blue and warm highlights",
    lighting: "high contrast orbital light",
    texture: "clean technical surfaces",
    compositionGrammar: "depth stage",
    motionLanguage: "slow spatial reveal",
    typography: "minimal technical editorial",
  },
  continuityRules: ["Keep object direction stable"],
  forbiddenTreatments: ["No unmotivated neon HUD"],
} as const;

test("VisualStyleSpec is strict non-empty unique and bounded", () => {
  const parsed = VisualStyleSpecSchema.parse(validVisualStyle);
  assert.equal(parsed.styleProfileId, "cinematic-3d");
  assert.equal(VISUAL_STYLE_FINGERPRINT_VERSION, "visual-style-fingerprint-v1");

  assert.throws(() => VisualStyleSpecSchema.parse({...validVisualStyle, extra: true}));
  assert.throws(() =>
    VisualStyleSpecSchema.parse({
      ...validVisualStyle,
      artDirection: {...validVisualStyle.artDirection, palette: "  "},
    }),
  );
  assert.throws(() =>
    VisualStyleSpecSchema.parse({
      ...validVisualStyle,
      continuityRules: ["same", "same"],
    }),
  );
  assert.throws(() =>
    VisualStyleSpecSchema.parse({
      ...validVisualStyle,
      forbiddenTreatments: Array.from({length: 33}, (_, index) => `rule-${index}`),
    }),
  );
  assert.throws(() => VisualStyleSpecSchema.parse({...validVisualStyle, styleProfileId: "Styles/Profile"}));
  assert.throws(() =>
    VisualStyleSpecSchema.parse({...validVisualStyle, resourceCatalogFingerprint: digest("A")}),
  );
});

test("VisualStyle fingerprint is canonical and covers the resolved style authority", () => {
  const resolvedStyleDescriptorFingerprint = digest("b");
  const first = computeVisualStyleFingerprint({
    visualStyle: validVisualStyle,
    resolvedStyleDescriptorFingerprint,
  });
  const reordered = computeVisualStyleFingerprint({
    resolvedStyleDescriptorFingerprint,
    visualStyle: {
      forbiddenTreatments: validVisualStyle.forbiddenTreatments,
      continuityRules: validVisualStyle.continuityRules,
      artDirection: {
        typography: validVisualStyle.artDirection.typography,
        motionLanguage: validVisualStyle.artDirection.motionLanguage,
        compositionGrammar: validVisualStyle.artDirection.compositionGrammar,
        texture: validVisualStyle.artDirection.texture,
        lighting: validVisualStyle.artDirection.lighting,
        palette: validVisualStyle.artDirection.palette,
        medium: validVisualStyle.artDirection.medium,
      },
      resourceCatalogFingerprint: validVisualStyle.resourceCatalogFingerprint,
      styleProfileId: validVisualStyle.styleProfileId,
      storyId: validVisualStyle.storyId,
      schemaVersion: 1,
    },
  });
  assert.equal(first, reordered);

  const mutations = [
    {visualStyle: {...validVisualStyle, resourceCatalogFingerprint: digest("c")}, resolvedStyleDescriptorFingerprint},
    {visualStyle: validVisualStyle, resolvedStyleDescriptorFingerprint: digest("c")},
    {visualStyle: {...validVisualStyle, artDirection: {...validVisualStyle.artDirection, medium: "flat editorial"}}, resolvedStyleDescriptorFingerprint},
    {visualStyle: {...validVisualStyle, continuityRules: ["Keep scale stable"]}, resolvedStyleDescriptorFingerprint},
    {visualStyle: {...validVisualStyle, forbiddenTreatments: ["No glass UI"]}, resolvedStyleDescriptorFingerprint},
  ] as const;
  for (const mutation of mutations) {
    assert.notEqual(first, computeVisualStyleFingerprint(mutation));
  }
});
