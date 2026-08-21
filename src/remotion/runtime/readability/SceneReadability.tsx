import {
  createContext,
  useContext,
  type CSSProperties,
  type FC,
  type ReactNode,
  type SVGProps,
} from "react";

const MinimumSceneFontSizeContext = createContext<number | null>(null);

export const SceneTypographyProvider = MinimumSceneFontSizeContext.Provider;

const assertReadableFontSize = (
  minimumFontSizePx: number,
  fontSizePx: number,
) => {
  if (!Number.isInteger(fontSizePx) || fontSizePx < minimumFontSizePx) {
    throw new Error(
      `Scene text size ${fontSizePx}px is below the frozen ${minimumFontSizePx}px minimum.`,
    );
  }
};

const assertUnscaledTextStyle = (style: CSSProperties | undefined) => {
  if (
    style !== undefined &&
    (style.fontSize !== undefined ||
      style.transform !== undefined ||
      style.scale !== undefined)
  ) {
    throw new Error(
      "Scene text fontSize and scale must use the controlled readability props.",
    );
  }
};

export type SceneTextProps = Readonly<{
  fontSizePx: number;
  children: ReactNode;
  style?: Omit<CSSProperties, "fontSize" | "transform" | "scale">;
}>;

export const SceneText: FC<SceneTextProps> = ({
  fontSizePx,
  children,
  style,
}) => {
  const minimumFontSizePx = useContext(MinimumSceneFontSizeContext);
  if (minimumFontSizePx === null) {
    throw new Error("SceneText must render inside SceneViewport.");
  }
  assertReadableFontSize(minimumFontSizePx, fontSizePx);
  assertUnscaledTextStyle(style);
  return <div style={{ ...style, fontSize: fontSizePx }}>{children}</div>;
};

export type SceneSvgTextProps = Readonly<
  Omit<SVGProps<SVGTextElement>, "fontSize" | "transform"> & {
    fontSizePx: number;
  }
>;

export const SceneSvgText: FC<SceneSvgTextProps> = ({
  fontSizePx,
  children,
  style,
  ...props
}) => {
  const minimumFontSizePx = useContext(MinimumSceneFontSizeContext);
  if (minimumFontSizePx === null) {
    throw new Error("SceneSvgText must render inside SceneViewport.");
  }
  assertReadableFontSize(minimumFontSizePx, fontSizePx);
  assertUnscaledTextStyle(style);
  if ((props as { readonly transform?: unknown }).transform !== undefined) {
    throw new Error("SceneSvgText must not use a scale transform.");
  }
  return (
    <text {...props} style={style} fontSize={fontSizePx}>
      {children}
    </text>
  );
};
