import assert from "node:assert/strict";
import test from "node:test";

import { resolveSceneAvailableResources } from "@axmorf/studio/contracts";
import { capabilityDescriptorDeclarations } from "../../packages/studio/src/remotion/catalog/capability-descriptors";
import { buildResourceCatalog } from "../../scripts/catalog/domain";
import { validateSceneCapabilityUsage } from "../../scripts/project-production/application/scene-capability-usage";

const catalog = buildResourceCatalog(capabilityDescriptorDeclarations);
const camera = resolveSceneAvailableResources(catalog, ["capability.camera"]);
const check = (source: string, selectedResources = camera) =>
  validateSceneCapabilityUsage({
    sources: [{ logicalPath: "src/Renderer.tsx", source }],
    selectedResources,
  });

test("Scene capability calls accept public named aliases, namespace JSX and createElement", () => {
  check(
    'import {ProducerCamera2D as Camera} from "@axmorf/studio/remotion"; const Renderer = () => <Camera />;',
  );
  check(
    'import * as Cap from "@axmorf/studio/remotion"; const Renderer = () => <Cap.ProducerLayeredStage />;',
  );
  check(
    'import {ProducerCamera2D} from "@axmorf/studio/remotion"; const Renderer = () => React.createElement(ProducerCamera2D);',
  );
});

test("Scene rejects declared capabilities with only unused or type imports", () => {
  assert.throws(
    () =>
      check(
        'import {ProducerCamera2D} from "@axmorf/studio/remotion"; const Renderer = () => <div />;',
      ),
    /unused import/u,
  );
  assert.throws(
    () =>
      check(
        'import type {ProducerCamera2D} from "@axmorf/studio/remotion"; const Renderer = () => <ProducerCamera2D />;',
      ),
    /without invoking/u,
  );
});

test("Scene rejects invoked capabilities without matching resource declarations", () => {
  assert.throws(
    () =>
      check(
        'import {LineChart} from "@axmorf/studio/remotion"; const Renderer = () => <LineChart />;',
      ),
    /unselected capability capability.chart/u,
  );
  assert.throws(
    () =>
      check(
        'import {ProducerCamera2D} from "../../runtime/capabilities"; const Renderer = () => <ProducerCamera2D />;',
        [],
      ),
    /unselected capability capability.camera/u,
  );
  check('const Renderer = () => <svg><path d="M0 0L10 10" /></svg>;', []);
});

test("Scene resolution supplies exact descriptors, fingerprints and API guides, rejecting unknown IDs", () => {
  assert.equal(
    camera[0].selected.descriptorFingerprint,
    catalog.entries.find(
      ({ descriptor }) => descriptor.id === "capability.camera",
    )?.descriptorFingerprint,
  );
  assert.equal(
    camera[0].selected.catalogFingerprint,
    catalog.catalogFingerprint,
  );
  assert.ok(
    camera[0].descriptor.kind === "capability" &&
      camera[0].descriptor.authoring?.exports.includes("ProducerFocusPull"),
  );
  assert.throws(
    () => resolveSceneAvailableResources(catalog, ["capability.missing"]),
    /unavailable/u,
  );
});
