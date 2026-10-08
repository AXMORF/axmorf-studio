import assert from "node:assert/strict";
import { cp, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { DeliveryPublishSchema } from "@axmorf/studio/contracts";
import { readExecutionAttemptProgress } from "../../scripts/project-production/adapters/attempt-store";
import {
  inspectProjectCover,
  inspectProjectVideo,
  renderProjectCover,
  renderProjectVideo,
} from "../../scripts/project-production/adapters/media";
import { readProductionDiagnosticBaseline } from "../../scripts/project-production/adapters/production-inspection";
import { buildCurrentProductionPlan } from "../../scripts/project-production/application/build-current-plan";
import { buildDeliveryUnlocked } from "../../scripts/project-production/application/build-delivery";
import { continueProjectProduction } from "../../scripts/project-production/application/continue-production";
import { convergeProjectProduction } from "../../scripts/project-production/application/converge-artifacts";
import { inspectProjectProduction } from "../../scripts/project-production/application/inspect-production";
import { prepareProjectProduction } from "../../scripts/project-production/application/prepare-production";
import { runMediaProcess } from "../../scripts/shared/media-process";
import { createReadyPreviewFixture } from "../project-preview/ready-fixture";

// Explicit host verification, excluded from static test discovery. All source,
// artifacts, attempts and delivery belong to a disposable synthetic fixture.
export const verifyAuthoredDeliveryHost = async () => {
  const repositoryRoot = join(import.meta.dirname, "../..");
  const fixture = await createReadyPreviewFixture({
    insideRepository: true,
    audioChannels: 1,
  });
  try {
    await cp(
      join(
        repositoryRoot,
        "packages/create-axmorf-studio/template/src/index.ts",
      ),
      join(fixture.rootDir, "src/index.ts"),
    );
    const sourceConfig = join(fixture.rootDir, "remotion.config.ts");
    assert.match(
      await readFile(sourceConfig, "utf8"),
      /packages\/studio\/src\/remotion\.ts/u,
    );
    const runProcess: typeof runMediaProcess = (command, args, options) =>
      runMediaProcess(
        command,
        args.includes("render") || args.includes("still")
          ? [...args, `--config=${sourceConfig}`]
          : args,
        options,
      );
    let videoRenders = 0;
    let coverRenders = 0;
    const media = {
      renderVideo: (request: Parameters<typeof renderProjectVideo>[0]) => {
        videoRenders += 1;
        return renderProjectVideo({
          ...request,
          rootDir: repositoryRoot,
          runProcess,
        });
      },
      renderCover: (request: Parameters<typeof renderProjectCover>[0]) => {
        coverRenders += 1;
        return renderProjectCover({
          ...request,
          rootDir: repositoryRoot,
          runProcess,
        });
      },
      inspectVideo: (request: Parameters<typeof inspectProjectVideo>[0]) =>
        inspectProjectVideo({ ...request, rootDir: repositoryRoot }),
      inspectCover: (request: Parameters<typeof inspectProjectCover>[0]) =>
        inspectProjectCover({ ...request, rootDir: repositoryRoot }),
    };
    const project = {
      rootDir: fixture.rootDir,
      projectId: fixture.storyId,
    };
    // The disposable source fixture uses the repository's installed media
    // tools. Route diagnostic media reads through the same real host ports.
    const buildPlan: typeof buildCurrentProductionPlan = async (request) =>
      buildCurrentProductionPlan({
        ...request,
        baseline: await readProductionDiagnosticBaseline({
          rootDir: fixture.rootDir,
          projectId: fixture.storyId,
          runtimeRootDir: repositoryRoot,
        }),
      });
    const env = {
      RSP_PRODUCER_CONFIG: join(
        fixture.rootDir,
        "operator/producer.config.json",
      ),
    };
    const inspected = await inspectProjectProduction({ ...project, env });
    assert.equal(inspected.sourceState, "production-inputs-ready");
    assert.equal(inspected.estimatedCost.providerRequests, 0);
    const prepared = await prepareProjectProduction(
      { ...project, env },
      { buildCurrentPlan: buildPlan },
    );
    assert.equal(prepared.status, "project-production-prepared");
    if (prepared.status !== "project-production-prepared") {
      throw new Error("Synthetic fixture is not production-ready.");
    }
    assert.deepEqual(prepared.dirtyAgentTasks, []);
    assert.equal(prepared.actualCost.providerRequests, 0);
    const result = await continueProjectProduction(
      {
        ...project,
        revisionId: prepared.revisionId,
        attemptId: prepared.attemptId,
      },
      {
        converge: (request) =>
          convergeProjectProduction({
            ...request,
            dependencies: {
              buildCurrentPlan: buildPlan,
              buildDelivery: (delivery) =>
                buildDeliveryUnlocked({
                  ...delivery,
                  dependencies: { ...delivery.dependencies, ...media },
                }),
            },
          }),
      },
    );
    assert.equal(result.status, "project-production-complete");
    const deliveryRoot = join(fixture.rootDir, "deliveries", fixture.storyId);
    assert.deepEqual((await readdir(deliveryRoot)).sort(), [
      "cover-3x4.png",
      "cover-4x3.png",
      "publish.json",
      "video.mp4",
    ]);
    const publishBytes = await readFile(join(deliveryRoot, "publish.json"));
    const publish = DeliveryPublishSchema.parse(
      JSON.parse(publishBytes.toString("utf8")),
    );
    const completed = await buildPlan(project);
    assert.ok(completed.plan.tasks.every(({ action }) => action === "reuse"));
    const cached = await buildDeliveryUnlocked({
      ...project,
      revisionId: prepared.revisionId,
      artifactSetFingerprint: completed.plan.artifactSetFingerprint,
      dependencies: media,
    });
    assert.equal(cached.status, "project-production-current");
    assert.equal(cached.noOp, true);
    assert.equal(videoRenders, 1);
    assert.equal(coverRenders, 2);
    assert.deepEqual(
      await readFile(join(deliveryRoot, "publish.json")),
      publishBytes,
    );
    const progress = await readExecutionAttemptProgress({
      rootDir: fixture.rootDir,
      storyId: fixture.storyId,
      attemptId: prepared.attemptId,
    });
    assert.ok(progress !== null);
    assert.equal(progress.state, "succeeded");
    assert.equal(progress.deliveryResult.status, "verified");
    return {
      status: result.status,
      cacheStatus: cached.status,
      currentSourceAliases: true,
      providerCalls: prepared.actualCost.providerRequests,
      dirtyAgentTasks: prepared.dirtyAgentTasks.length,
      allTasksReused: true,
      videoRenders,
      coverRenders,
      attemptState: progress.state,
      delivery: publish,
      assessment: "not-assessed",
    };
  } finally {
    await fixture.dispose();
  }
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  verifyAuthoredDeliveryHost()
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.stack : String(error)}\n`,
      );
      process.exitCode = 1;
    });
}
