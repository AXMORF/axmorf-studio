import {
  createContext,
  useContext,
  type CSSProperties,
  type FC,
  type ReactNode,
  type SVGProps,
} from "react";
import type { SceneViewport } from "../../../contracts/scene-readability";

const MinimumSceneFontSizeContext = createContext<SceneViewport | null>(null);

export const SceneTypographyProvider = MinimumSceneFontSizeContext.Provider;

/** Keep labels outside the camera/artwork transform and inside the frozen text rectangle. */
export const SceneTextSafeArea: FC<{ readonly children: ReactNode }> = ({
  children,
}) => {
  const viewport = useContext(MinimumSceneFontSizeContext);
  if (viewport === null)
    throw new Error("SceneTextSafeArea must render inside SceneViewport.");
  const area =
    viewport.schemaVersion === 2
      ? viewport.textSafeArea
      : { top: 0, right: 0, bottom: 0, left: 0 };
  return (
    <div
      data-scene-text-safe-area="true"
      style={{
        position: "absolute",
        top: area.top,
        left: area.left,
        width: viewport.width - area.left - area.right,
        height: viewport.height - area.top - area.bottom,
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
};

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
  assertReadableFontSize(minimumFontSizePx.minFontSizePx, fontSizePx);
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
  assertReadableFontSize(minimumFontSizePx.minFontSizePx, fontSizePx);
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
