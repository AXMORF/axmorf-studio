import { z } from "zod";

const ThemeColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/u)
  .transform((color) => color.toLowerCase());

// Composition owns this group opacity, so even an opaque child cannot replace the base.
export const VISUAL_THEME_DECORATION_MAX_OPACITY = 0.08;

const luminance = (hex: string) =>
  [0, 2, 4]
    .map(
      (offset) => Number.parseInt(hex.slice(1 + offset, 3 + offset), 16) / 255,
    )
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    )
    .reduce(
      (sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index],
      0,
    );

/** Opaque sRGB contrast; motion visibility and layout need separate render review. */
export const computeVisualThemeContrast = (first: string, second: string) => {
  const a = luminance(ThemeColorSchema.parse(first));
  const b = luminance(ThemeColorSchema.parse(second));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

/** Conservative sRGB bounds include every decoration color and 8-bit rounding. */
export const computeDecoratedThemeContrast = (
  background: string,
  foreground: string,
) => {
  const base = ThemeColorSchema.parse(background);
  const text = luminance(ThemeColorSchema.parse(foreground));
  const endpoint = (overlay: 0 | 255) =>
    "#" +
    [0, 2, 4]
      .map((offset) => {
        const channel = Number.parseInt(base.slice(1 + offset, 3 + offset), 16);
        const mixed =
          channel * (1 - VISUAL_THEME_DECORATION_MAX_OPACITY) +
          overlay * VISUAL_THEME_DECORATION_MAX_OPACITY;
        return (overlay === 0 ? Math.floor(mixed) : Math.ceil(mixed))
          .toString(16)
          .padStart(2, "0");
      })
      .join("");
  const darkest = luminance(endpoint(0));
  const lightest = luminance(endpoint(255));
  const closest = Math.max(darkest, Math.min(lightest, text));
  return (Math.max(text, closest) + 0.05) / (Math.min(text, closest) + 0.05);
};

export const VisualThemeSchema = z
  .object({
    background: ThemeColorSchema,
    primaryText: ThemeColorSchema,
    secondaryText: ThemeColorSchema,
    accent: ThemeColorSchema,
  })
  .strict()
  .superRefine((theme, context) => {
    if (
      Object.values(theme).some(
        (color) => !ThemeColorSchema.safeParse(color).success,
      )
    )
      return;
    for (const role of ["primaryText", "secondaryText", "accent"] as const) {
      if (computeDecoratedThemeContrast(theme.background, theme[role]) < 4.5) {
        context.addIssue({
          code: "custom",
          path: [role],
          message: `Visual theme ${role} contrast must be at least 4.5:1 across the background and its bounded decoration range.`,
        });
      }
    }
  })
  .readonly();

export type VisualTheme = z.infer<typeof VisualThemeSchema>;

export const VISUAL_THEME_PRESETS = Object.freeze({
  dark: VisualThemeSchema.parse({
    background: "#0d1b2a",
    primaryText: "#fffdf9",
    secondaryText: "#bdc7d3",
    accent: "#dfb887",
  }),
  light: VisualThemeSchema.parse({
    background: "#fffdf9",
    primaryText: "#242424",
    secondaryText: "#59534d",
    accent: "#825b38",
  }),
});

/** Preset names exist only in authoring input; stored theme colors are the authority. */
export const VisualThemeSelectionSchema = z.union([
  z.enum(["dark", "light"]).transform((name) => VISUAL_THEME_PRESETS[name]),
  VisualThemeSchema,
]);
