import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildArtifactAttestation,
  buildProducerTaskSpec,
  type Sha256Digest,
} from "../../src/contracts";
import {
  assertMeaningLocalSceneRenderers,
  assertNormalizedMeaningLocalSceneRenderers,
} from "../../scripts/project-production/application/converge-artifacts";
import {
  createRepositoryProductionLocations,
  createWorkspaceProductionLocations,
} from "../../scripts/project-production/application/production-locations";
import { fingerprintSceneRendererSource } from "../../scripts/project-production/domain/scene-originality";
import { snapshotWorkspaceSceneOriginalityBaseline } from "../../scripts/projects/application/scene-originality-baseline";

const sha = (character: string) =>
  `sha256:${character.repeat(64)}` as Sha256Digest;

const artifact = (meaningId: string, rendererChecksum: Sha256Digest) => {
  const task = buildProducerTaskSpec({
    taskKind: "scene-owner",
    storyId: "story-example",
    semanticId: meaningId,
    revisionId: `revision-${"1".repeat(64)}`,
    dependencyArtifacts: [],
    inputFingerprints: [{ id: "context", fingerprint: sha("1") }],
    declaredReadSet: [],
    declaredOutputSet: ["src/Renderer.tsx"],
    validatorPolicyVersion: "scene-owner-validator-v3",
  });
  const attestation = buildArtifactAttestation({
    storyId: task.storyId,
    taskKind: task.taskKind,
    semanticId: task.semanticId,
    taskRevision: task.taskRevision,
    validatorPolicyVersion: task.validatorPolicyVersion,
    dependencyArtifacts: [],
    outputManifest: [
      {
        logicalPath: "src/Renderer.tsx",
        checksum: rendererChecksum,
        sizeBytes: 1,
        kind: "file",
      },
    ],
  });
  return { task, attestation };
};

test("Renderer fingerprint ignores comments and formatting trivia", () => {
  const compact = "const Renderer=()=> <div/>; export default Renderer;";
  const formatted = `// copied comment
const Renderer = () => <div />;
export default Renderer;
`;
  assert.equal(
    fingerprintSceneRendererSource(compact),
    fingerprintSceneRendererSource(formatted),
  );
});

test("convergence rejects the same Renderer bytes across narrated Scenes", () => {
  assert.throws(
    () =>
      assertMeaningLocalSceneRenderers([
        artifact("meaning-one", sha("a")),
        artifact("meaning-two", sha("a")),
      ]),
    /must be meaning-local/u,
  );
  assert.doesNotThrow(() =>
    assertMeaningLocalSceneRenderers([
      artifact("meaning-one", sha("a")),
      artifact("meaning-two", sha("b")),
    ]),
  );
});

test("convergence rejects same-Revision Renderers that differ only by trivia", async () => {
  const artifacts = [
    artifact("meaning-one", sha("a")),
    artifact("meaning-two", sha("b")),
  ];
  await assert.rejects(
    assertNormalizedMeaningLocalSceneRenderers({
      locations: createRepositoryProductionLocations({
        repositoryRoot: process.cwd(),
      }),
      artifacts,
      readSource: async ({ task }) =>
        `// ${task.semanticId}\nconst Renderer = () => <div />; export default Renderer;`,
    }),
    /normalize to duplicates/u,
  );
});

test("Workspace originality baseline fingerprints other Projects but excludes the selected Project", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "rsp-scene-baseline-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const locations = createWorkspaceProductionLocations({
    workspaceRoot: join(root, "workspace"),
    applicationSupportRoot: join(root, "support"),
    runtimeResources: join(root, "runtime"),
    cacheRoot: join(root, "cache"),
  });
  const historicalSource = "const Historical = () => <div />; export default Historical;";
  const selectedSource = "const Selected = () => <main />; export default Selected;";
  for (const [projectId, source] of [
    ["historical-project", historicalSource],
    ["selected-project", selectedSource],
  ] as const) {
    const sceneRoot = join(
      locations.projectSourceRoot,
      projectId,
      "scenes/opening",
    );
    await mkdir(sceneRoot, { recursive: true });
    await writeFile(join(sceneRoot, "Renderer.tsx"), source);
  }

  const baseline = await snapshotWorkspaceSceneOriginalityBaseline({
    locations,
    projectId: "selected-project",
  });
  assert.deepEqual(baseline.rendererFingerprints, [
    fingerprintSceneRendererSource(historicalSource),
  ]);
});
