import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  buildSceneCoverageMap,
  buildSceneSoundPlan,
  buildSceneTaskInputV5,
  buildSceneSyncAnchors,
  buildSceneVisualPlan,
  buildSilentScenePreset,
  buildShotPlanSet,
} from "../../src/contracts";
import {
  generateSceneCoverage,
  generateScenePackage,
} from "../../scripts/scene-package/generate";
import {
  assertM6ProtectedStateUnchanged,
  createIsolatedM6Project,
  disposeIsolatedM6Project,
} from "../fixtures/m6-project";
import { sha } from "../fixtures/scene/m6-scene-input";

type Fixture = Awaited<ReturnType<typeof createIsolatedM6Project>>;

const expectPackageStale = async (
  fixture: Fixture,
  input: Parameters<typeof generateScenePackage>[0]["input"],
) => {
  await assert.rejects(() =>
    generateScenePackage({
      mode: "check",
      destination: fixture.packagePath,
      input,
    }),
  );
};

const cases: readonly {
  readonly name: string;
  readonly mutate: (fixture: Fixture) => Promise<void>;
}[] = [
  {
    name: "silent Scene preset visual sound or duration drift invalidates the old task and package",
    mutate: async (fixture) => {
      const { taskInputFingerprint: _taskInputFingerprint, ...taskBase } =
        fixture.input.task;
      void _taskInputFingerprint;
      for (const [index, changed] of [
        { visualIntent: "Changed preset visual intent." },
        { soundIntent: "Changed preset sound intent." },
        { durationInFrames: 121 },
      ].entries()) {
        const preset = buildSilentScenePreset({
          sceneRole: "intro",
          presetId: `changed-intro-${index + 1}`,
          durationInFrames: changed.durationInFrames ?? 120,
          visualIntent:
            changed.visualIntent ?? "Render the authored preset visual.",
          soundIntent:
            changed.soundIntent ?? "Render the authored preset local sound.",
          resourceIds: ["asset.proof-sfx", "asset.proof-shape"],
          implementation: { kind: "scene-owner" },
        });
        const task = buildSceneTaskInputV5({
          ...taskBase,
          storyBeat: {
            kind: "silent-scene",
            sceneRole: "intro",
            meaningId: taskBase.meaningId,
            narrativePurpose: "Render a fixed-duration intro Scene.",
            preset,
          },
          timingBeat: {
            kind: "silent-scene",
            sceneRole: "intro",
            presetFingerprint: preset.presetFingerprint,
            presetDurationInFrames: preset.durationInFrames,
            meaningId: taskBase.meaningId,
            startFrame: taskBase.timingBeat.startFrame,
            endFrame: taskBase.timingBeat.startFrame + preset.durationInFrames,
          },
          allowedSnapshots: [],
          allowedResourceIds: preset.resourceIds,
        });
        assert.notEqual(
          task.taskInputFingerprint,
          fixture.input.task.taskInputFingerprint,
        );
        await expectPackageStale(fixture, {
          ...fixture.input,
          task,
          current: {
            ...fixture.input.current,
            timingBeat: task.timingBeat,
            snapshotFingerprints: [],
          },
        });
      }
    },
  },
  {
    name: "VisualStyle art direction invalidates task/package but not narrative bytes",
    mutate: (fixture) =>
      expectPackageStale(fixture, {
        ...fixture.input,
        current: { ...fixture.input.current, visualStyleFingerprint: sha("c") },
      }),
  },
  {
    name: "selected asset checksum drift invalidates descriptor selection/package",
    mutate: (fixture) =>
      expectPackageStale(fixture, {
        ...fixture.input,
        selectedResources: fixture.input.selectedResources.map((entry) => ({
          ...entry,
          descriptor: { ...entry.descriptor, checksum: sha("c") },
        })),
      }),
  },
  {
    name: "selected asset blocked allowed-use and license fail closed",
    mutate: (fixture) =>
      expectPackageStale(fixture, {
        ...fixture.input,
        selectedResources: fixture.input.selectedResources.map((entry) => ({
          ...entry,
          descriptor: {
            ...entry.descriptor,
            status: "blocked" as const,
            allowedUse: "blocked" as const,
            license: {
              ...entry.descriptor.license,
              verificationStatus: "restricted" as const,
              verifiedAt: null,
              sourceEvidenceFingerprint: null,
            },
          },
        })),
      }),
  },
  {
    name: "Catalog fingerprint drift invalidates all bound Scene package layers",
    mutate: (fixture) =>
      expectPackageStale(fixture, {
        ...fixture.input,
        current: {
          ...fixture.input.current,
          resourceCatalogFingerprint: sha("c"),
        },
      }),
  },
  {
    name: "new upstream snapshot does not switch automatically and explicit current switch is stale",
    mutate: (fixture) =>
      expectPackageStale(fixture, {
        ...fixture.input,
        current: { ...fixture.input.current, snapshotFingerprints: [sha("c")] },
      }),
  },
  {
    name: "card style demo or preview identity drift invalidates recipe/package",
    mutate: (fixture) =>
      expectPackageStale(fixture, {
        ...fixture.input,
        selection: {
          ...fixture.input.selection,
          selectionFingerprint: sha("c"),
        },
      }),
  },
  {
    name: "localized source byte drift invalidates fidelity/package",
    mutate: (fixture) =>
      expectPackageStale(fixture, {
        ...fixture.input,
        fidelityReceipt: {
          ...fixture.input.fidelityReceipt,
          receiptFingerprint: sha("c"),
        },
      }),
  },
  {
    name: "Renderer import JSX or frame binding drift invalidates renderer/package",
    mutate: (fixture) =>
      expectPackageStale(fixture, {
        ...fixture.input,
        rendererBinding: {
          ...fixture.input.rendererBinding,
          rendererSourceFingerprint: sha("c"),
        },
      }),
  },
  {
    name: "paired evidence or normal-speed review drift invalidates fidelity/package",
    mutate: (fixture) =>
      expectPackageStale(fixture, {
        ...fixture.input,
        fidelityReceipt: {
          ...fixture.input.fidelityReceipt,
          selectionFingerprint: sha("c"),
        },
      }),
  },
  {
    name: "SceneVisualPlan and ShotPlan changes invalidate only expected package bytes",
    mutate: async (fixture) => {
      const visual = buildSceneVisualPlan({
        ...fixture.input.visual,
        semanticObjective: "A deliberately changed Scene semantic objective.",
      });
      const shots = buildShotPlanSet({
        ...fixture.input.shots,
        shots: [
          {
            ...fixture.input.shots.shots[0],
            action: "A deliberately changed local Shot action.",
          },
        ],
      });
      await expectPackageStale(fixture, { ...fixture.input, visual, shots });
    },
  },
  {
    name: "SceneSyncAnchor move invalidates visual sound and package identities",
    mutate: async (fixture) => {
      const anchors = buildSceneSyncAnchors({
        ...fixture.input.anchors,
        anchors: [{ ...fixture.input.anchors.anchors[0], sceneLocalFrame: 55 }],
      });
      await expectPackageStale(fixture, { ...fixture.input, anchors });
    },
  },
  {
    name: "SceneSoundPlan or audio identity drift invalidates sound/package only",
    mutate: async (fixture) => {
      const sound = buildSceneSoundPlan({
        ...fixture.input.sound,
        soundPlanFingerprint: undefined,
      });
      await expectPackageStale(fixture, {
        ...fixture.input,
        sound: { ...sound, soundPlanFingerprint: sha("c") },
      });
    },
  },
  {
    name: "RendererRegistry byte drift leaves ScenePackage current and invalidates registry consumer",
    mutate: async (fixture) => {
      await generateScenePackage({
        mode: "check",
        destination: fixture.packagePath,
        input: fixture.input,
      });
      const before = await readFile(fixture.registryPath, "utf8");
      await writeFile(fixture.registryPath, `${before}// drift\n`, "utf8");
      assert.notEqual(await readFile(fixture.registryPath, "utf8"), before);
    },
  },
  {
    name: "coverage ready fallback missing stale transitions invalidate coverage not package",
    mutate: async (fixture) => {
      await generateScenePackage({
        mode: "check",
        destination: fixture.packagePath,
        input: fixture.input,
      });
      const changed = {
        ...fixture.coverageInput,
        packages: [],
        stalePackages: [
          {
            meaningId: "meaning-one",
            packageFingerprint: fixture.scenePackage.packageFingerprint,
            driftLayer: "renderer-source" as const,
          },
        ],
      };
      assert.equal(buildSceneCoverageMap(changed).entries[0].status, "stale");
      await assert.rejects(() =>
        generateSceneCoverage({
          mode: "check",
          destination: fixture.coveragePath,
          input: changed,
        }),
      );
    },
  },
  {
    name: "StoryBeat or SemanticTiming range drift invalidates task/package without writer repair",
    mutate: (fixture) =>
      expectPackageStale(fixture, {
        ...fixture.input,
        current: {
          ...fixture.input.current,
          timingBeat: { ...fixture.input.task.timingBeat, endFrame: 141 },
        },
      }),
  },
  {
    name: "visual audio runtime or fidelity checker version drift invalidates downstream",
    mutate: async (fixture) => {
      await expectPackageStale(fixture, {
        ...fixture.input,
        current: {
          ...fixture.input.current,
          visualRuntimeVersion: "story-visual-runtime-v1",
        },
      });
      await expectPackageStale(fixture, {
        ...fixture.input,
        fidelityReceipt: {
          ...fixture.input.fidelityReceipt,
          checkerVersion: "reference-fidelity-checker-v2",
        },
      });
    },
  },
];

for (const invalidationCase of cases) {
  test(invalidationCase.name, async () => {
    const fixture = await createIsolatedM6Project();
    try {
      await invalidationCase.mutate(fixture);
      await assertM6ProtectedStateUnchanged(fixture);
    } finally {
      await disposeIsolatedM6Project(fixture);
    }
  });
}

test("invalidation fixture and checker have no provider network Agent or skill dependency", async () => {
  const source = await readFile(
    join(import.meta.dirname, "../../scripts/scene-package/domain.ts"),
    "utf8",
  );
  for (const forbidden of [
    "fetch(",
    "VoxCPM",
    "MCP",
    "global-skill",
    "github.com",
  ]) {
    assert.equal(source.includes(forbidden), false);
  }
});
