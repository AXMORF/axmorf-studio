import {
  createContext,
  useContext,
  type CSSProperties,
  type FC,
  type ReactNode,
  type SVGProps,
} from "react";

export type SceneReadabilityPolicy = Readonly<{
  policyId: "production-readability-v2";
  policyFingerprint: string;
  typographyPolicy: Readonly<{ minFontSizePx: number }>;
  sceneContentSafeAreaPx: Readonly<{
    top: number;
    right: number;
    bottom: number;
    left: number;
  }>;
}>;

const ReadabilityPolicyContext = createContext<SceneReadabilityPolicy | null>(
  null,
);

export const SceneReadabilityProvider = ReadabilityPolicyContext.Provider;

const assertReadableFontSize = (
  policy: SceneReadabilityPolicy,
  fontSizePx: number,
) => {
  if (
    !Number.isInteger(fontSizePx) ||
    fontSizePx < policy.typographyPolicy.minFontSizePx
  ) {
    throw new Error(
      `Scene text size ${fontSizePx}px is below the frozen ${policy.typographyPolicy.minFontSizePx}px minimum.`,
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
  const policy = useContext(ReadabilityPolicyContext);
  if (policy === null) {
    throw new Error("SceneText must render inside SceneSafeArea.");
  }
  assertReadableFontSize(policy, fontSizePx);
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
  const policy = useContext(ReadabilityPolicyContext);
  if (policy === null) {
    throw new Error("SceneSvgText must render inside SceneSafeArea.");
  }
  assertReadableFontSize(policy, fontSizePx);
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
