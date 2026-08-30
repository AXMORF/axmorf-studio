import assert from "node:assert/strict";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readCurrentProductionRevision } from "../../scripts/project-production/application/current-revision";
import {
  createLiveProjectProductionScope,
  createProjectRevisionProductionScope,
} from "../../scripts/project-production/application/production-scope";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

test("current Revision query is catalog-check-only and creates no execution roots", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-current-revision-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const calls: unknown[] = [];
  const inputs = {
    projectId: "story-example",
    fingerprints: {
      story: sha("1"),
      narration: sha("2"),
      render: sha("3"),
      visualStyle: sha("4"),
      publishingIntent: sha("5"),
      sound: sha("6"),
      requirements: sha("7"),
      globalVisualBrief: sha("8"),
      resourcePool: sha("9"),
      assetManifest: sha("a"),
      narrationGeneration: sha("b"),
    },
    sceneInputs: [
      {
        revisionInput: {
          meaningId: "opening",
          beatFingerprint: sha("c"),
          timingFingerprint: sha("d"),
          readabilityFingerprint: sha("e"),
          briefFingerprint: sha("f"),
          requirementsFingerprint: sha("1"),
          resourcePoolFingerprint: sha("2"),
          selectedResourcesFingerprint: sha("3"),
          templateInstanceFingerprint: null,
        },
      },
    ],
    assetManifest: { assets: [] },
    runtimePolicyFingerprint: sha("4"),
    workspaceConfigurationFingerprint: null,
  };

  const revision = await readCurrentProductionRevision(
    { rootDir, projectId: "story-example" },
    {
      loadInputs: (async (input: unknown) => {
        calls.push(input);
        return inputs;
      }) as never,
    },
  );

  assert.match(revision.revisionId, /^revision-[0-9a-f]{64}$/u);
  assert.deepEqual(calls, [{ rootDir, projectId: "story-example" }]);
  for (const root of [
    ".producer-attempts",
    ".producer-artifacts",
    ".producer-work",
    ".narration-work",
  ]) {
    await assert.rejects(access(join(rootDir, root)), { code: "ENOENT" });
  }
});

test("identical authored inputs have the same live and candidate Revision identity", async () => {
  const rootDir = "/fixture";
  const projectId = "story-example";
  const liveScope = createLiveProjectProductionScope({
    rootDir,
    storyId: projectId,
  });
  const candidateScope = createProjectRevisionProductionScope({
    rootDir,
    storyId: projectId,
    candidateId: `revision-candidate-${"a".repeat(64)}`,
  });
  const inputs = {
    projectId,
    fingerprints: {
      story: sha("1"),
      narration: sha("2"),
      render: sha("3"),
      visualStyle: sha("4"),
      publishingIntent: sha("5"),
      sound: sha("6"),
      requirements: sha("7"),
      globalVisualBrief: sha("8"),
      resourcePool: sha("9"),
      assetManifest: sha("a"),
      narrationGeneration: sha("b"),
    },
    sceneInputs: [
      {
        revisionInput: {
          meaningId: "opening",
          beatFingerprint: sha("c"),
          timingFingerprint: sha("d"),
          readabilityFingerprint: sha("e"),
          briefFingerprint: sha("f"),
          requirementsFingerprint: sha("1"),
          resourcePoolFingerprint: sha("2"),
          selectedResourcesFingerprint: sha("3"),
          templateInstanceFingerprint: null,
        },
      },
    ],
    assetManifest: { assets: [] },
    runtimePolicyFingerprint: sha("4"),
    workspaceConfigurationFingerprint: null,
  };
  const observedScopes: unknown[] = [];
  const loadInputs = (async (input: { readonly scope?: unknown }) => {
    observedScopes.push(input.scope);
    return inputs;
  }) as never;

  const [live, candidate] = await Promise.all([
    readCurrentProductionRevision(
      { rootDir, projectId, scope: liveScope },
      { loadInputs },
    ),
    readCurrentProductionRevision(
      { rootDir, projectId, scope: candidateScope },
      { loadInputs },
    ),
  ]);

  assert.equal(candidate.revisionId, live.revisionId);
  assert.deepEqual(candidate, live);
  assert.deepEqual(observedScopes, [liveScope, candidateScope]);
});
