import assert from "node:assert/strict";
import test from "node:test";

import { buildProducerConfig } from "../../src/contracts";
import { styleDescriptorDeclarations } from "../../src/remotion/catalog/style-descriptors";
import { buildRspProjectCreateContext, validateRspProjectCreate } from "../../desktop/application/project-create-contract";
import { createWorkspaceProductionLocations } from "../../scripts/project-production/application/production-locations";
import { validProjectCreateInput, validProjectCreateProducerConfig } from "../fixtures/project-create";

const locations = createWorkspaceProductionLocations({
  workspaceRoot: "/workspace",
  applicationSupportRoot: "/support",
  runtimeResources: "/runtime",
  cacheRoot: "/cache",
});

const config = buildProducerConfig(validProjectCreateProducerConfig);
const loadDescriptors = async () => styleDescriptorDeclarations;

test("Project create-context exposes exact dynamic options without provider secrets", async () => {
  const context = await buildRspProjectCreateContext({
    locations,
    config,
    providerReadiness: "unavailable",
    loadDescriptors,
  });
  assert.ok(
    context.styleProfiles.some(({ id }) => id === "hand-drawn-explainer"),
  );
  assert.deepEqual(
    context.publishingCollections.map(({ id }) => id),
    ["ai-workflow"],
  );
  assert.equal(context.provider.requiredForProjectCreate, false);
  assert.equal(context.provider.readiness, "unavailable");
  assert.doesNotMatch(JSON.stringify(context), /token|baseUrl|my-voice/iu);
});

test("Project validate reports style and collection paths before mutation", async () => {
  const valid = await validateRspProjectCreate({
    locations,
    config,
    input: validProjectCreateInput,
    loadDescriptors,
  });
  assert.equal(valid.status, "project-create-valid");
  assert.deepEqual(valid.issues, []);

  const invalid = await validateRspProjectCreate({
    locations,
    config,
    input: {
      ...validProjectCreateInput,
      visualStyle: {
        ...validProjectCreateInput.visualStyle,
        styleProfileId: "warm-handdrawn-storybook",
      },
      publishing: {
        ...validProjectCreateInput.publishing,
        collectionId: "default",
      },
    },
    loadDescriptors,
  });
  assert.equal(invalid.status, "project-create-invalid");
  assert.deepEqual(
    invalid.issues.map(({ path, code }) => ({ path, code })),
    [
      {
        path: "$.visualStyle.styleProfileId",
        code: "rsp-project-create-style-unavailable",
      },
      {
        path: "$.publishing.collectionId",
        code: "rsp-project-create-collection-unavailable",
      },
    ],
  );
});

test("Project validate rejects TTS chunks that exceed the caption display budget", async () => {
  const result = await validateRspProjectCreate({
    locations,
    config,
    input: {
      ...validProjectCreateInput,
      story: {
        ...validProjectCreateInput.story,
        beats: [
          {
            ...validProjectCreateInput.story.beats[0],
            ttsChunks: [
              {
                chunkId: "opening-01",
                ttsText: "专".repeat(37),
              },
            ],
          },
        ],
      },
    },
    loadDescriptors,
  });

  assert.equal(result.status, "project-create-invalid");
  assert.deepEqual(
    result.issues.map(({ path, code }) => ({ path, code })),
    [
      {
        path: "$.story.beats[0].ttsChunks[0].ttsText",
        code: "rsp-caption-display-budget-exceeded",
      },
    ],
  );
  assert.match(result.issues[0]?.message ?? "", /74 half-units.*72/u);
  assert.match(result.issues[0]?.ownerAction ?? "", /Split.*ttsChunks/u);
});

test("Project validate reports ProducerConfig as a structured blocker", async () => {
  const result = await validateRspProjectCreate({
    locations,
    config: null,
    input: validProjectCreateInput,
    loadDescriptors,
  });
  assert.equal(result.status, "project-create-invalid");
  assert.equal(result.issues[0]?.code, "rsp-project-create-config-required");
});

test("Project validate never echoes an invalid authored storyId", async () => {
  const result = await validateRspProjectCreate({
    locations,
    config,
    input: { ...validProjectCreateInput, storyId: "/private/must-not-leak" },
    loadDescriptors,
  });
  assert.equal(result.status, "project-create-invalid");
  assert.equal(result.storyId, null);
  assert.doesNotMatch(JSON.stringify(result), /private|must-not-leak/u);
});
