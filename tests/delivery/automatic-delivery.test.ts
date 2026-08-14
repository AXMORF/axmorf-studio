import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";

import { buildDelivery } from "../../scripts/delivery/application/build";
import { checkDelivery } from "../../scripts/delivery/application/check";
import { promoteDeliveryStaging } from "../../scripts/delivery/adapters/filesystem";
import {
  assertCurrentDeliveryInputBindings,
  type loadCurrentDeliveryInputs,
} from "../../scripts/delivery/application/inputs";
import {
  buildAssetAttributions,
  computeVideoSourceReferencesFingerprint,
  computeStoryFingerprint,
} from "../../src/contracts";
import { buildResourceCatalog } from "../../scripts/catalog/domain";

const sha = (bytes: Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;

const createFixture = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-automatic-delivery-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const wide = new TextEncoder().encode("immutable-cover-wide");
  const tall = new TextEncoder().encode("immutable-cover-tall");
  const widePath =
    "src/projects/story-example/delivery/cover/results/fixture/cover-4x3.png";
  const tallPath =
    "src/projects/story-example/delivery/cover/results/fixture/cover-3x4.png";
  await mkdir(dirname(join(rootDir, widePath)), { recursive: true });
  await Promise.all([
    writeFile(join(rootDir, widePath), wide),
    writeFile(join(rootDir, tallPath), tall),
  ]);
  const story = {
    storyId: "story-example",
    title: "A deterministic story",
  };
  const brief = {
    schemaVersion: 1,
    storyId: "story-example",
    title: "A deterministic story",
    sourceMaterial: "Current source material.",
    sourceReferences: [
      { title: "Current reference", url: "https://example.com/reference" },
    ],
    audience: "Current audience",
    targetDurationSeconds: 4,
    deliveryConstraints: [],
  } as const;
  const semanticTiming = {
    storyId: "story-example",
    fps: 30,
    durationInFrames: 120,
    fingerprint: `sha256:${"5".repeat(64)}`,
    storyBeats: [{ meaningId: "opening", startFrame: 0, endFrame: 120 }],
  };
  const inputs = {
    story,
    brief,
    semanticTiming,
    intent: {
      intentFingerprint: `sha256:${"1".repeat(64)}`,
      description: "A current publishing description.",
      topics: ["one", "two", "three", "four", "five", "six"],
      collection: {
        id: "deterministic-stories",
        name: "Deterministic stories",
        catalogFingerprint: `sha256:${"8".repeat(64)}`,
      },
      chapters: [{ meaningId: "opening", name: "开场" }],
    },
    renderPlan: {
      runId: "run-story-example-20260809t000000z-aaaaaaaaaaaa",
      storyId: "story-example",
      requirementsFingerprint: `sha256:${"6".repeat(64)}`,
      storyFingerprint: computeStoryFingerprint(story as never),
      semanticTimingFingerprint: semanticTiming.fingerprint,
      compositionId: "StoryExample",
      fps: 30,
      timelinePolicyVersion: "fixed-bookends-v1",
      sourceReferencesFingerprint: computeVideoSourceReferencesFingerprint(
        brief.sourceReferences,
      ),
      bodyFrameCount: 120,
      frameCount: 420,
      renderPlanFingerprint: `sha256:${"2".repeat(64)}`,
    },
    renderReady: {
      runId: "run-story-example-20260809t000000z-aaaaaaaaaaaa",
      storyId: "story-example",
      requirementsFingerprint: `sha256:${"6".repeat(64)}`,
      renderPlanFingerprint: `sha256:${"2".repeat(64)}`,
      renderReadyFingerprint: `sha256:${"3".repeat(64)}`,
    },
    cover: {
      result: {
        storyId: "story-example",
        resultFingerprint: `sha256:${"4".repeat(64)}`,
        covers: [
          {
            variantId: "cover-4x3",
            repositoryPath: widePath,
            checksum: sha(wide),
            sizeBytes: wide.byteLength,
          },
          {
            variantId: "cover-3x4",
            repositoryPath: tallPath,
            checksum: sha(tall),
            sizeBytes: tall.byteLength,
          },
        ],
      },
    },
    assetAttributions: buildAssetAttributions({
      storyId: "story-example",
      resourceCatalog: buildResourceCatalog([]),
      renderPlanFingerprint: `sha256:${"2".repeat(64)}`,
      selectedResources: [],
    }),
  };
  const loadInputs = (async () =>
    inputs) as unknown as typeof loadCurrentDeliveryInputs;
  return { rootDir, inputs, loadInputs } as const;
};

test("current input bindings reject same-size Story and SemanticTiming drift", async (context) => {
  const fixture = await createFixture(context);
  const current = {
    runId: fixture.inputs.renderPlan.runId,
    renderPlanFingerprint: fixture.inputs.renderPlan.renderPlanFingerprint,
    renderReadyFingerprint: fixture.inputs.renderReady.renderReadyFingerprint,
  };
  const request = {
    projectId: "story-example",
    brief: fixture.inputs.brief,
    story: fixture.inputs.story,
    semanticTiming: fixture.inputs.semanticTiming,
    renderPlan: fixture.inputs.renderPlan,
    renderReady: fixture.inputs.renderReady,
    current,
  };

  assert.doesNotThrow(() =>
    assertCurrentDeliveryInputBindings(request as never),
  );
  assert.throws(() =>
    assertCurrentDeliveryInputBindings({
      ...request,
      semanticTiming: {
        ...fixture.inputs.semanticTiming,
        fingerprint: `sha256:${"9".repeat(64)}`,
      },
    } as never),
  );
  assert.throws(() =>
    assertCurrentDeliveryInputBindings({
      ...request,
      story: { ...fixture.inputs.story, title: "Drifted title" },
    } as never),
  );
  assert.throws(() =>
    assertCurrentDeliveryInputBindings({
      ...request,
      brief: {
        ...fixture.inputs.brief,
        sourceReferences: [],
      },
    } as never),
  );
});

test("build records intent before spawn and receipt only after spawn acknowledgement", async (context) => {
  const fixture = await createFixture(context);
  let launches = 0;
  const launchRender = async ({
    args,
  }: {
    readonly args: readonly string[];
  }) => {
    launches += 1;
    const deliveryDir = join(fixture.rootDir, "deliveries/story-example");
    assert.equal(
      JSON.parse(
        await readFile(join(deliveryDir, "render-launch-intent.json"), "utf8"),
      ).status,
      "launch-intent-recorded",
    );
    await assert.rejects(
      readFile(join(deliveryDir, "render-launch-receipt.json")),
    );
    assert.equal(
      args[3],
      join("deliveries", "story-example", "story-example.mp4"),
    );
  };
  const first = await buildDelivery({
    rootDir: fixture.rootDir,
    projectId: "story-example",
    loadInputs: fixture.loadInputs,
    dependencies: {
      launchRender: launchRender as never,
      clock: () => new Date("2026-08-09T00:00:00.000Z"),
    },
  });
  assert.equal(first.status, "delivery-render-started");
  assert.equal(first.noOp, false);
  assert.equal(launches, 1);
  const deliveryDir = join(fixture.rootDir, "deliveries/story-example");
  assert.deepEqual((await readdir(deliveryDir)).sort(), [
    "HANDOFF.md",
    "asset-attributions.json",
    "cover-3x4.png",
    "cover-4x3.png",
    "delivery-launch-manifest.json",
    "immutable-checksums.sha256",
    "publishing.json",
    "render-launch-intent.json",
    "render-launch-receipt.json",
  ]);
  assert.doesNotMatch(
    await readFile(join(deliveryDir, "publishing.json"), "utf8"),
    /actualDuration|checksum.*mp4|decode/iu,
  );
  assert.deepEqual(
    JSON.parse(await readFile(join(deliveryDir, "publishing.json"), "utf8"))
      .coverFileNames,
    {
      cover4x3: "cover-4x3.png",
      cover3x4: "cover-3x4.png",
    },
  );
  const publishing = JSON.parse(
    await readFile(join(deliveryDir, "publishing.json"), "utf8"),
  ) as {
    readonly frameCount: number;
    readonly plannedDurationSeconds: number;
    readonly chapters: readonly Readonly<{
      startFrame: number;
      timecode: string;
    }>[];
  };
  assert.equal(publishing.frameCount, 420);
  assert.equal(publishing.plannedDurationSeconds, 14);
  assert.deepEqual(publishing.chapters, [
    {
      meaningId: "opening",
      name: "开场",
      startFrame: 60,
      timecode: "00:00:02",
    },
  ]);
  assert.doesNotMatch(
    await readFile(join(deliveryDir, "HANDOFF.md"), "utf8"),
    /approved|verified release|render-succeeded|complete/iu,
  );

  const second = await buildDelivery({
    rootDir: fixture.rootDir,
    projectId: "story-example",
    loadInputs: fixture.loadInputs,
    dependencies: { launchRender: launchRender as never },
  });
  assert.equal(second.noOp, true);
  assert.equal(launches, 1);

  await writeFile(join(deliveryDir, "story-example.mp4"), "not inspected");
  await chmod(join(deliveryDir, "story-example.mp4"), 0o000);
  const checked = await checkDelivery({
    rootDir: fixture.rootDir,
    projectId: "story-example",
    loadInputs: fixture.loadInputs,
  });
  assert.equal(checked.status, "delivery-render-started");
});

test("changed inputs replace the single Project delivery in place", async (context) => {
  const fixture = await createFixture(context);
  const first = await buildDelivery({
    rootDir: fixture.rootDir,
    projectId: "story-example",
    loadInputs: fixture.loadInputs,
    dependencies: { launchRender: (async () => undefined) as never },
  });
  const deliveryDir = join(fixture.rootDir, "deliveries/story-example");
  await writeFile(join(deliveryDir, "story-example.mp4"), "old render");

  const replacementInputs = {
    ...fixture.inputs,
    cover: {
      result: {
        ...fixture.inputs.cover.result,
        resultFingerprint: `sha256:${"7".repeat(64)}`,
      },
    },
  };
  const replacementLoadInputs = (async () =>
    replacementInputs) as unknown as typeof loadCurrentDeliveryInputs;
  let launches = 0;
  const replacement = await buildDelivery({
    rootDir: fixture.rootDir,
    projectId: "story-example",
    loadInputs: replacementLoadInputs,
    dependencies: {
      launchRender: (async ({ args }: { readonly args: readonly string[] }) => {
        launches += 1;
        assert.equal(args[3], "deliveries/story-example/story-example.mp4");
      }) as never,
    },
  });

  assert.notEqual(replacement.deliveryId, first.deliveryId);
  assert.equal(replacement.noOp, false);
  assert.equal(launches, 1);
  assert.equal(
    JSON.parse(
      await readFile(
        join(deliveryDir, "delivery-launch-manifest.json"),
        "utf8",
      ),
    ).deliveryId,
    replacement.deliveryId,
  );
  await assert.rejects(readFile(join(deliveryDir, "story-example.mp4")));
  assert.deepEqual(
    (await readdir(join(fixture.rootDir, "deliveries"))).sort(),
    [".staging", "story-example"],
  );
});

test("failed staged replacement restores the previous Project delivery", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-delivery-rollback-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const deliveryDir = join(rootDir, "deliveries/story-example");
  const stagingRoot = join(rootDir, "deliveries/.staging");
  await mkdir(deliveryDir, { recursive: true });
  await mkdir(stagingRoot, { recursive: true });
  await writeFile(join(deliveryDir, "marker.txt"), "previous delivery");

  await assert.rejects(
    promoteDeliveryStaging({
      staging: join(stagingRoot, "delivery-missing"),
      destination: deliveryDir,
    }),
  );

  assert.equal(
    await readFile(join(deliveryDir, "marker.txt"), "utf8"),
    "previous delivery",
  );
  assert.deepEqual(await readdir(stagingRoot), []);
});

test("spawn failure leaves an ambiguous intent and is never retried", async (context) => {
  const fixture = await createFixture(context);
  let launches = 0;
  const launchRender = async () => {
    launches += 1;
    throw new Error("injected spawn failure");
  };
  await assert.rejects(
    buildDelivery({
      rootDir: fixture.rootDir,
      projectId: "story-example",
      loadInputs: fixture.loadInputs,
      dependencies: { launchRender: launchRender as never },
    }),
    /spawn failure/iu,
  );
  await assert.rejects(
    buildDelivery({
      rootDir: fixture.rootDir,
      projectId: "story-example",
      loadInputs: fixture.loadInputs,
      dependencies: { launchRender: launchRender as never },
    }),
    /ambiguous|refusing to retry/iu,
  );
  assert.equal(launches, 1);
});

test("input drift after package promotion blocks spawn and becomes ambiguous", async (context) => {
  const fixture = await createFixture(context);
  let reads = 0;
  let launches = 0;
  const loadInputs = (async () => {
    reads += 1;
    if (reads === 1) return fixture.inputs;
    return {
      ...fixture.inputs,
      renderReady: {
        renderReadyFingerprint: `sha256:${"9".repeat(64)}`,
      },
    };
  }) as unknown as typeof loadCurrentDeliveryInputs;
  await assert.rejects(
    buildDelivery({
      rootDir: fixture.rootDir,
      projectId: "story-example",
      loadInputs,
      dependencies: {
        launchRender: (async () => {
          launches += 1;
        }) as never,
      },
    }),
    /drift|stale|identity/iu,
  );
  assert.equal(launches, 0);
  await assert.rejects(
    buildDelivery({
      rootDir: fixture.rootDir,
      projectId: "story-example",
      loadInputs: fixture.loadInputs,
    }),
    /ambiguous|refusing to retry/iu,
  );
});

test("fails closed on missing Cover, stale inputs, unknown files, and symlinks", async (context) => {
  const missing = await createFixture(context);
  await unlink(
    join(missing.rootDir, missing.inputs.cover.result.covers[0].repositoryPath),
  );
  await assert.rejects(
    buildDelivery({
      rootDir: missing.rootDir,
      projectId: "story-example",
      loadInputs: missing.loadInputs,
      dependencies: { launchRender: (async () => undefined) as never },
    }),
  );

  const stale = await createFixture(context);
  await assert.rejects(
    buildDelivery({
      rootDir: stale.rootDir,
      projectId: "story-example",
      loadInputs: (async () => {
        throw new Error("stale render-ready input");
      }) as typeof loadCurrentDeliveryInputs,
    }),
    /stale render-ready/iu,
  );

  const unsafe = await createFixture(context);
  await buildDelivery({
    rootDir: unsafe.rootDir,
    projectId: "story-example",
    loadInputs: unsafe.loadInputs,
    dependencies: { launchRender: (async () => undefined) as never },
  });
  const deliveryDir = join(unsafe.rootDir, "deliveries/story-example");
  await writeFile(join(deliveryDir, "unknown.txt"), "unexpected");
  await assert.rejects(
    checkDelivery({
      rootDir: unsafe.rootDir,
      projectId: "story-example",
      loadInputs: unsafe.loadInputs,
    }),
    /unknown files/iu,
  );
  await unlink(join(deliveryDir, "unknown.txt"));
  await unlink(join(deliveryDir, "HANDOFF.md"));
  await symlink("publishing.json", join(deliveryDir, "HANDOFF.md"));
  await assert.rejects(
    checkDelivery({
      rootDir: unsafe.rootDir,
      projectId: "story-example",
      loadInputs: unsafe.loadInputs,
    }),
    /symbolic links|non-files/iu,
  );
});
