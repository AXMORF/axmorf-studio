import ts from "typescript";
import type { SceneRendererProps } from "@axmorf/studio/remotion";
import { runSceneMotionRenderProbe } from "../adapters/scene-motion-render-probe";

export type SceneHandoffConsumption = Readonly<{
  status: "handoff-consumption-observed" | "temporal-review-required";
  verification: "verified-dom-boundary" | "unsupported";
  reviewStatus: "needs-temporal-review";
  observations: readonly unknown[];
  scope: string;
  reason?: string;
}>;

/** A declared common drawing is checked separately from optional motion tracking. */
export const checkSceneHandoffConsumption = ({
  rootDir,
  sources,
  props,
}: {
  readonly rootDir: string;
  readonly sources: readonly { logicalPath: string; source: string }[];
  readonly props: SceneRendererProps;
}): SceneHandoffConsumption | undefined => {
  const seams = [props.continuity?.incoming, props.continuity?.outgoing];
  if (
    !seams.some(
      (seam) => seam?.kind === "continuous" && seam.visual !== undefined,
    )
  )
    return undefined;
  const compiled = Object.fromEntries(
    sources.map(({ logicalPath, source }) => [
      logicalPath,
      ts.transpileModule(source, {
        fileName: logicalPath,
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
        },
      }).outputText,
    ]),
  );
  try {
    return JSON.parse(
      runSceneMotionRenderProbe(rootDir, {
        mode: "continuity",
        rootDir,
        sources: compiled,
        props,
      }),
    ) as SceneHandoffConsumption;
  } catch (error) {
    const failure = error as Error & { stderr?: string; signal?: string };
    const message = failure.stderr?.trim() || failure.signal || failure.message;
    if (message.startsWith("Scene handoff visual contradiction:"))
      throw new Error(message);
    return {
      status: "temporal-review-required",
      verification: "unsupported",
      reviewStatus: "needs-temporal-review",
      observations: [],
      reason: message,
      scope:
        "No boundary drawing proof. Browser lifecycle, Canvas/3D paint, CSS and composited visibility need actual boundary playback; technical acceptance is not visual approval.",
    };
  }
};
