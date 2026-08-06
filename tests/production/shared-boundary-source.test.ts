import assert from "node:assert/strict";
import test from "node:test";

import { validateSharedSceneBoundarySources } from "../../scripts/production/application/shared-boundary-source-validator";

const sceneSlot = `
import { SceneSafeArea as Boundary } from "../readability";
import { SCENE_COMPOSITION_BOUNDARY_VERSION as BoundaryVersion } from "../../../contracts";
export function renderSceneRendererMount(Component: any, mountProps: any, localFrame: number) {
  const { sceneBoundaryVersion: version, ...withoutBoundary } = mountProps;
  if (version === BoundaryVersion) {
    const { readabilityPolicy: policy, ...ownedProps } = withoutBoundary;
    if (policy === undefined) throw new Error("missing policy");
    return <Boundary policy={policy}><Component {...ownedProps} sceneFrame={localFrame} /></Boundary>;
  }
  return <Component {...withoutBoundary} sceneFrame={localFrame} />;
}
`;

const safeArea = `
import { ProductionReadabilityPolicySchema as PolicySchema } from "../../../contracts";
import { SceneReadabilityProvider as Provider } from "./SceneReadability";
export const SceneSafeArea = ({ policy: raw, children }: any) => {
  const current = PolicySchema.parse(raw);
  const inset = current.sceneContentSafeAreaPx;
  return <Provider value={current}><div data-scene-safe-area={current.policyFingerprint}
    style={{top: inset.top, right: inset.right, bottom: inset.bottom, left: inset.left}}>{children}</div></Provider>;
};
`;

const generatedRuntime = `
const props = {
  readabilityPolicy: task.readabilityPolicy,
  ...(task.schemaVersion === 3 ? { sceneBoundaryVersion: task.sceneCompositionBoundaryVersion } : {}),
};
`;

test("shared boundary validation is structural and formatting independent", () => {
  const compact = validateSharedSceneBoundarySources({
    sceneSlotSource: sceneSlot,
    sceneSafeAreaSource: safeArea,
    generatedRuntimeSource: generatedRuntime,
  });
  const reformatted = validateSharedSceneBoundarySources({
    sceneSlotSource: sceneSlot.replaceAll(/\s+/gu, " "),
    sceneSafeAreaSource: safeArea.replaceAll(/\s+/gu, " "),
    generatedRuntimeSource: generatedRuntime.replaceAll(/\s+/gu, " "),
  });
  assert.equal(
    compact.boundarySourceFingerprint,
    reformatted.boundarySourceFingerprint,
  );
});

test("shared boundary validation fails closed when ownership wiring is absent", () => {
  assert.throws(() =>
    validateSharedSceneBoundarySources({
      sceneSlotSource: sceneSlot.replace("<Boundary policy={policy}>", "<>"),
      sceneSafeAreaSource: safeArea,
      generatedRuntimeSource: generatedRuntime,
    }),
  );
  assert.throws(() =>
    validateSharedSceneBoundarySources({
      sceneSlotSource: sceneSlot,
      sceneSafeAreaSource: safeArea.replace(
        "sceneContentSafeAreaPx",
        "otherInset",
      ),
      generatedRuntimeSource: generatedRuntime,
    }),
  );
  assert.throws(() =>
    validateSharedSceneBoundarySources({
      sceneSlotSource: sceneSlot,
      sceneSafeAreaSource: safeArea,
      generatedRuntimeSource: "const props = {};",
    }),
  );
  assert.throws(() =>
    validateSharedSceneBoundarySources({
      sceneSlotSource: sceneSlot.replace(
        "if (version === BoundaryVersion) {",
        "if (version === BoundaryVersion) { return <Component {...withoutBoundary} sceneFrame={localFrame} />; }\n  if (true) {",
      ),
      sceneSafeAreaSource: safeArea,
      generatedRuntimeSource: generatedRuntime,
    }),
  );
});
