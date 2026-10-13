export type InterfaceTheme = {
  readonly canvas: string;
  readonly surface: string;
  readonly chrome: string;
  readonly border: string;
  readonly text: string;
  readonly mutedText: string;
  readonly accent: string;
  readonly success: string;
  readonly danger: string;
  readonly syntax: {
    readonly keyword: string;
    readonly string: string;
    readonly comment: string;
    readonly number: string;
  };
};

export const interfaceThemes = {
  dark: {
    canvas: "#0d1117",
    surface: "#161b22",
    chrome: "#1f2630",
    border: "#30363d",
    text: "#e6edf3",
    mutedText: "#8d96a0",
    accent: "#58a6ff",
    success: "#3fb950",
    danger: "#f85149",
    syntax: {
      keyword: "#ff7b72",
      string: "#a5d6ff",
      comment: "#8b949e",
      number: "#79c0ff",
    },
  },
  light: {
    canvas: "#ffffff",
    surface: "#f6f8fa",
    chrome: "#eaeef2",
    border: "#d0d7de",
    text: "#1f2328",
    mutedText: "#59636e",
    accent: "#0969da",
    success: "#1a7f37",
    danger: "#cf222e",
    syntax: {
      keyword: "#cf222e",
      string: "#0a3069",
      comment: "#6e7781",
      number: "#0550ae",
    },
  },
} as const satisfies Record<string, InterfaceTheme>;

export const interfaceFonts = {
  ui: '"Inter", "PingFang SC", "Helvetica Neue", Arial, sans-serif',
  mono: '"SF Mono", "JetBrains Mono", Menlo, Consolas, "PingFang SC", monospace',
} as const;

/**
 * Interface text is passed as props, so the Scene source check cannot prove its size.
 * Every interface component therefore raises any requested size to the frozen minimum.
 */
export const resolveInterfaceFontSize = (
  minFontSizePx: number,
  requested?: number,
): number => {
  if (!Number.isFinite(minFontSizePx) || minFontSizePx <= 0) {
    throw new Error("Interface components require a positive minFontSizePx.");
  }
  if (requested !== undefined && !Number.isFinite(requested)) {
    throw new Error("Interface font size must be finite.");
  }
  return Math.max(minFontSizePx, requested ?? minFontSizePx);
};

export const interfaceShadow =
  "0 2px 4px rgba(0,0,0,0.18), 0 12px 24px rgba(0,0,0,0.22), 0 40px 80px rgba(0,0,0,0.28)";
