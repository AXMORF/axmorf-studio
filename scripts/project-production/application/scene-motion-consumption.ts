import ts from "typescript";
import { runSceneMotionRenderProbe } from "../adapters/scene-motion-render-probe";
import type { SceneRendererProps } from "@axmorf/studio/remotion";

export type SceneMotionConsumption = Readonly<{
  status: "motion-consumption-observed" | "temporal-review-required";
  verification: "verified-dom-dependency" | "unsupported" | "intent-only";
  reviewStatus: "needs-temporal-review";
  observations: readonly unknown[];
  scope: string;
  reason?: string;
}>;
const temporalReviewRequired = (
  reason: string,
  verification: "unsupported" | "intent-only",
): SceneMotionConsumption => ({
  status: "temporal-review-required",
  verification,
  reviewStatus: "needs-temporal-review",
  observations: [],
  reason,
  scope:
    "No DOM dependency proof. Inspect actual browser-rendered action, hold and handoff previews against the plan; technical acceptance is not visual or aesthetic approval.",
});

export const checkSceneMotionConsumption = ({
  rootDir,
  sources,
  props,
}: {
  readonly rootDir: string;
  readonly sources: readonly { logicalPath: string; source: string }[];
  readonly props: SceneRendererProps;
}): SceneMotionConsumption => {
  if (!props.shots.motionPlan)
    throw new Error("Motion consumption requires a plan.");
  if (props.shots.motionPlan.schemaVersion === 2)
    return temporalReviewRequired(
      "Intent plan intentionally leaves geometry and implementation to authored code.",
      "intent-only",
    );
  if (sources.some(({ source }) => /<(?:canvas|Canvas)\b/u.test(source)))
    return temporalReviewRequired(
      "Canvas/WebGL painting is not observable in SSR DOM; inspect browser-rendered pixels.",
      "unsupported",
    );
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
      runSceneMotionRenderProbe(rootDir, { rootDir, sources: compiled, props }),
    ) as SceneMotionConsumption;
  } catch (error) {
    const failure = error as Error & { stderr?: string; signal?: string };
    const message = failure.stderr?.trim() || failure.signal || failure.message;
    // A bounded probe is not a whitelist of creative techniques. Proven contradictions
    // remain errors; missing bindings, hooks and browser lifecycle require real preview review.
    if (
      /unused or partly ignored|not repeatable|contradicts declared change\/hold/u.test(
        message,
      )
    )
      throw new Error(`Scene motion dependency contradiction: ${message}`);
    return temporalReviewRequired(message, "unsupported");
  }
};
