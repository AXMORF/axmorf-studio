import assert from "node:assert/strict";
import test from "node:test";
import {
  VISUAL_THEME_PRESETS,
  VisualThemeSchema,
  VisualThemeSelectionSchema,
  computeVisualThemeContrast,
  computeDecoratedThemeContrast,
  ProjectCreateInputSchema,
  ProjectRevisionInputSchema,
} from "@axmorf/studio/contracts";
import { validProjectCreateInput } from "../fixtures/project-create";

test("theme presets resolve to the same canonical colors as explicit input", () => {
  for (const name of ["dark", "light"] as const) {
    const theme = VisualThemeSelectionSchema.parse(name);
    assert.deepEqual(theme, VISUAL_THEME_PRESETS[name]);
    assert.deepEqual(VisualThemeSelectionSchema.parse(theme), theme);
    for (const role of ["primaryText", "secondaryText", "accent"] as const) {
      assert.ok(
        computeVisualThemeContrast(theme.background, theme[role]) >= 4.5,
      );
      assert.ok(
        computeDecoratedThemeContrast(theme.background, theme[role]) >= 4.5,
      );
    }
  }
  assert.equal(computeVisualThemeContrast("#000000", "#ffffff"), 21);
});

test("custom theme must remain readable through the actual bounded decoration composite", () => {
  assert.ok(computeVisualThemeContrast("#ffffff", "#767676") >= 4.5);
  assert.ok(computeDecoratedThemeContrast("#ffffff", "#767676") < 4.5);
  assert.equal(
    VisualThemeSchema.safeParse({
      ...VISUAL_THEME_PRESETS.light,
      background: "#ffffff",
      secondaryText: "#767676",
    }).success,
    false,
  );
  assert.equal(computeDecoratedThemeContrast("#808080", "#808080"), 1);
});

test("theme validation rejects unreadable, translucent and executable colors", () => {
  for (const role of ["primaryText", "secondaryText", "accent"] as const) {
    assert.throws(
      () =>
        VisualThemeSchema.parse({
          ...VISUAL_THEME_PRESETS.dark,
          [role]: VISUAL_THEME_PRESETS.dark.background,
        }),
      /contrast/u,
    );
  }
  for (const background of [
    "transparent",
    "#fff",
    "#ffffff80",
    "var(--bg)",
    "url(x)",
  ]) {
    assert.equal(
      VisualThemeSchema.safeParse({ ...VISUAL_THEME_PRESETS.dark, background })
        .success,
      false,
    );
  }
  assert.throws(() =>
    VisualThemeSchema.parse({
      ...VISUAL_THEME_PRESETS.dark,
      logoShape: "custom",
    }),
  );
});

test("create and revision reject incompatible palettes at the authoring boundary", () => {
  const visualStyle = {
    ...validProjectCreateInput.visualStyle,
    theme: {
      ...VISUAL_THEME_PRESETS.dark,
      accent: VISUAL_THEME_PRESETS.dark.background,
    },
  };
  assert.equal(
    ProjectCreateInputSchema.safeParse({
      ...validProjectCreateInput,
      visualStyle,
    }).success,
    false,
  );
  assert.equal(
    ProjectRevisionInputSchema.safeParse({
      schemaVersion: 1,
      contractVersion: "project-revision-input-v1",
      storyId: "story-example",
      baseRevisionId: `revision-${"a".repeat(64)}`,
      baseDeliveryBuildId: `delivery-${"b".repeat(64)}`,
      patch: { visualStyle },
    }).success,
    false,
  );
  assert.equal(
    ProjectRevisionInputSchema.safeParse({
      schemaVersion: 1,
      contractVersion: "project-revision-input-v1",
      storyId: "story-example",
      baseRevisionId: `revision-${"a".repeat(64)}`,
      baseDeliveryBuildId: `delivery-${"b".repeat(64)}`,
      patch: { visualStyle: { ...visualStyle, theme: "light" } },
    }).success,
    true,
  );
});
