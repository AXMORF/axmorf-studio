import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  createDeliveryBuildId,
  ProductionRevisionIdSchema,
  RenderSpecSchema,
  Sha256DigestSchema,
  TaskRevisionSchema,
  buildDeliveryPublish,
  buildDeliveryPublishing,
  type Sha256Digest,
} from "@axmorf/studio/contracts";
import { runPublicProjectCheck } from "../../packages/studio/src/cli/project-check";
import { inspectCurrentDelivery } from "../../scripts/project-production/adapters/current-delivery-inspection";
import { createTemporaryDirectory } from "./support";

const revisionId = ProductionRevisionIdSchema.parse(
  `revision-${"1".repeat(64)}`,
);
const fingerprint = Sha256DigestSchema.parse(`sha256:${"2".repeat(64)}`);
const identity = {
  storyId: "story-example",
  revisionId,
  artifactSetFingerprint: fingerprint,
  compositionId: "StoryExample",
  fps: 30,
  frameCount: 120,
  width: 1080,
  height: 1920,
  policyVersion: "revision-artifact-sync-delivery-v1",
};
const args = ["--project", "story-example", "--level", "final"];
const current = {
  inputs: {
    render: RenderSpecSchema.parse({
      schemaVersion: 1,
      compositionId: identity.compositionId,
      fps: identity.fps,
      width: identity.width,
      height: identity.height,
      locale: "zh-CN",
      leadInFrames: 0,
      tailFrames: 0,
      output: {
        container: "mp4",
        videoCodec: "h264",
        audioCodec: "aac",
        audioChannels: 2,
      },
    }),
    timing: { durationInFrames: identity.frameCount },
  },
  revision: { revisionId },
  plan: {
    artifactSetFingerprint: fingerprint,
    tasks: [
      {
        taskRevision: TaskRevisionSchema.parse(`task-${"4".repeat(64)}`),
        action: "reuse" as const,
        artifactState: "valid" as const,
      },
    ],
  },
};
const fixture = async (rootDir: string) => {
  const directory = join(rootDir, "deliveries/story-example");
  await mkdir(directory, { recursive: true });
  const files = {
    "video.mp4": "video",
    "cover-4x3.png": "wide",
    "cover-3x4.png": "tall",
  };
  for (const [name, bytes] of Object.entries(files))
    await writeFile(join(directory, name), bytes);
  const file = (name: keyof typeof files) => ({
    repositoryPath: `deliveries/story-example/${name}`,
    checksum:
      `sha256:${createHash("sha256").update(files[name]).digest("hex")}` as Sha256Digest,
    sizeBytes: Buffer.byteLength(files[name]),
  });
  const publishing = buildDeliveryPublishing({
    storyId: "story-example",
    title: "Current delivery",
    description: "Current delivery test.",
    topics: ["one", "two", "three", "four", "five", "six"],
    collection: "Proof",
    outputFileName: "video.mp4",
    coverFileNames: { cover4x3: "cover-4x3.png", cover3x4: "cover-3x4.png" },
    fps: 30,
    frameCount: 120,
    plannedDurationSeconds: 4,
    chapters: [
      {
        meaningId: "opening",
        name: "Opening",
        startFrame: 0,
        timecode: "00:00:00",
      },
    ],
  });
  const publish = buildDeliveryPublish({
    storyId: "story-example",
    revisionId,
    artifactSetFingerprint: fingerprint,
    compositionId: "StoryExample",
    fps: 30,
    frameCount: 120,
    width: 1080,
    height: 1920,
    deliveryBuildId: createDeliveryBuildId(identity),
    publishing,
    artifacts: {
      video: {
        ...file("video.mp4"),
        media: {
          codec: "h264",
          audioCodec: "aac",
          audioChannels: 2,
          width: 1080,
          height: 1920,
          fps: 30,
          frameCount: 120,
          decodedToEof: true,
        },
      },
      cover4x3: {
        ...file("cover-4x3.png"),
        media: {
          imageFormat: "png",
          width: 1600,
          height: 1200,
          decodedToEof: true,
        },
      },
      cover3x4: {
        ...file("cover-3x4.png"),
        media: {
          imageFormat: "png",
          width: 1200,
          height: 1600,
          decodedToEof: true,
        },
      },
    },
  });
  await writeFile(join(directory, "publish.json"), JSON.stringify(publish));
  return publish;
};
const inspectDelivery: typeof inspectCurrentDelivery = (input) =>
  inspectCurrentDelivery({
    ...input,
    dependencies: {
      inspectVideo: async ({ expected }) => ({
        codec: "h264",
        audioCodec: "aac",
        audioChannels: expected.audioChannels,
        width: expected.width,
        height: expected.height,
        fps: expected.fps,
        frameCount: expected.frameCount,
        decodedToEof: true,
      }),
      inspectCover: async ({ expected }) => ({
        imageFormat: "png",
        width: expected.width,
        height: expected.height,
        decodedToEof: true,
      }),
    },
  });

const setup = async (
  context: Parameters<typeof createTemporaryDirectory>[0],
) => {
  const rootDir = await createTemporaryDirectory(
    context,
    "public-final-check-",
  );
  await fixture(rootDir);
  const output: string[] = [];
  const cliContext = {
    rootDir,
    env: {},
    stdout: (line: string) => {
      output.push(line);
    },
  };
  const dependencies = {
    buildPlan: async () => current,
    inspectDelivery,
    runProofCheck: async () => {
      assert.fail("current production cannot invoke legacy proof checks");
    },
  };
  return { rootDir, output, cliContext, dependencies };
};

test("public final validation accepts current delivery without legacy proof files and remains a read-only no-op", async (context) => {
  const { rootDir, output, cliContext, dependencies } = await setup(context);
  const directory = join(rootDir, "deliveries/story-example");
  const files = await readdir(directory);
  const before = await Promise.all(
    files.map(async (name) => [
      name,
      (await stat(join(directory, name))).mtimeMs,
      await readFile(join(directory, name), "utf8"),
    ]),
  );
  await runPublicProjectCheck(args, cliContext, dependencies);
  await runPublicProjectCheck(args, cliContext, dependencies);
  assert.equal(output[0], output[1]);
  const report = JSON.parse(output[0]!);
  assert.equal(report.aggregateStatus, "pass");
  assert.equal(report.scope, "current-production");
  assert.equal(report.revisionId, revisionId);
  assert.deepEqual(await readdir(rootDir), ["deliveries"]);
  assert.deepEqual(
    await Promise.all(
      files.map(async (name) => [
        name,
        (await stat(join(directory, name))).mtimeMs,
        await readFile(join(directory, name), "utf8"),
      ]),
    ),
    before,
  );
});

test("public final reports checksum corruption with structured delivery cause", async (context) => {
  const { rootDir, output, cliContext, dependencies } = await setup(context);
  await writeFile(
    join(rootDir, "deliveries/story-example/video.mp4"),
    "tampered",
  );
  await assert.rejects(
    runPublicProjectCheck(args, cliContext, dependencies),
    /checksum or size binding is stale/u,
  );
  assert.ok(
    JSON.parse(output[0]!).checks.some(
      (check: { code: string }) => check.code === "current-delivery-invalid",
    ),
  );
});

for (const field of ["revisionId", "artifactSetFingerprint"] as const) {
  test(`public final rejects stale ${field}`, async (context) => {
    const { rootDir, output, cliContext, dependencies } = await setup(context);
    const path = join(rootDir, "deliveries/story-example/publish.json");
    const publish = JSON.parse(await readFile(path, "utf8"));
    publish[field] =
      `${field === "revisionId" ? "revision-" : "sha256:"}${"9".repeat(64)}`;
    publish.deliveryBuildId = createDeliveryBuildId({
      ...identity,
      revisionId: publish.revisionId,
      artifactSetFingerprint: publish.artifactSetFingerprint,
    });
    await writeFile(path, JSON.stringify(publish));
    await assert.rejects(
      runPublicProjectCheck(args, cliContext, dependencies),
      /stale/u,
    );
    const code =
      field === "revisionId"
        ? "delivery-revision-stale"
        : "delivery-artifact-set-stale";
    assert.ok(
      JSON.parse(output[0]!).checks.some(
        (check: { code: string }) => check.code === code,
      ),
    );
  });
}

test("public final rejects dirty artifacts and changes during inspection", async (context) => {
  const { output, cliContext, dependencies } = await setup(context);
  await assert.rejects(
    runPublicProjectCheck(args, cliContext, {
      ...dependencies,
      buildPlan: async () => ({
        ...current,
        plan: {
          ...current.plan,
          tasks: [
            {
              ...current.plan.tasks[0]!,
              action: "dispatch-agent",
              artifactState: "missing",
            },
          ],
        },
      }),
    }),
    /current-artifacts-unavailable/u,
  );
  assert.equal(JSON.parse(output[0]!).aggregateStatus, "fail");
  let count = 0;
  await assert.rejects(
    runPublicProjectCheck(args, cliContext, {
      ...dependencies,
      captureSnapshot: async () => ({
        source: String(count++),
        public: "",
        generated: "",
        catalog: "",
        narrationCache: "",
        artifacts: "",
        workspaces: "",
        attempts: "",
        delivery: "",
      }),
    }),
    /production-changed-during-check/u,
  );
});

test("public final rejects legacy report writes before touching the workspace and keeps source checks routed to development checker", async () => {
  let proofCalls = 0;
  const context = {
    rootDir: "/not-a-workspace",
    stdout: () => assert.fail("must not write a report"),
  };
  await assert.rejects(
    runPublicProjectCheck([...args, "--write-final-check"], context),
    /read-only.*npm run project:check/u,
  );
  await runPublicProjectCheck([...args, "--scope", "source"], context, {
    runProofCheck: async () => {
      proofCalls++;
    },
  });
  assert.equal(proofCalls, 1);
});

for (const [field, value] of [
  ["width", 720],
  ["height", 1280],
  ["fps", 60],
  ["frameCount", 240],
  ["compositionId", "DifferentComposition"],
  ["audioChannels", 1],
] as const) {
  test(`public final rejects self-consistent delivery with wrong current ${field}`, async (context) => {
    const { rootDir, output, cliContext, dependencies } = await setup(context);
    const path = join(rootDir, "deliveries/story-example/publish.json");
    const publish = JSON.parse(await readFile(path, "utf8"));
    if (field === "audioChannels")
      publish.artifacts.video.media.audioChannels = value;
    else {
      publish[field] = value;
      if (field !== "compositionId")
        publish.artifacts.video.media[field] = value;
      publish.publishing.fps = publish.fps;
      publish.publishing.frameCount = publish.frameCount;
      publish.publishing.plannedDurationSeconds =
        publish.frameCount / publish.fps;
      publish.deliveryBuildId = createDeliveryBuildId({
        ...identity,
        width: publish.width,
        height: publish.height,
        fps: publish.fps,
        frameCount: publish.frameCount,
        compositionId: publish.compositionId,
      });
    }
    await writeFile(path, JSON.stringify(publish));
    // The existing delivery reader verifies these internally consistent fixtures;
    // the public check must additionally bind them to current production inputs.
    assert.notEqual(
      await inspectDelivery({ rootDir, storyId: "story-example" }),
      null,
    );
    const code =
      field === "audioChannels"
        ? "delivery-audio-channels-stale"
        : "delivery-build-stale";
    await assert.rejects(
      runPublicProjectCheck(args, cliContext, dependencies),
      new RegExp(code, "u"),
    );
    assert.ok(
      JSON.parse(output[0]!).checks.some(
        (check: { code: string }) => check.code === code,
      ),
    );
  });
}
