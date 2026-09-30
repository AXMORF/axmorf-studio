import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import {
  DELIVERY_FILES,
  SemanticTimingSchema,
  StoryIdSchema,
  serializeCanonicalJson,
} from "@axmorf/studio/contracts";
import { inspectCurrentDelivery } from "../project-production/adapters/current-delivery-inspection";
import { readRegularJson } from "../project-production/adapters/project-input-snapshot";
import { resolveMediaToolCommand } from "../shared/media-tool-command";
import { runMediaProcess } from "../shared/media-process";
import type { ProcessRunner } from "../shared/process";
import { planSceneReview } from "./plan";

const ensureRealDirectory = async (path: string) => {
  try {
    await mkdir(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("Scene review output directory is unsafe.");
  }
};

const reviewHtml = (
  plan: ReturnType<typeof planSceneReview>,
) => `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Scene review</title>
<style>
body{font:16px system-ui,sans-serif;background:#151515;color:#f4f4f4;margin:2rem}
section{margin:0 0 3rem}h2{font-size:1.2rem}div.frames{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}
figure{margin:0}img{display:block;width:100%;height:auto;background:#222}figcaption{padding:.5rem 0;color:#bbb}
</style>
<h1>Scene review</h1>
<p>Opening, midpoint, and last frame for each Scene. Review the delivered video for motion and sound.</p>
${plan.scenes
  .map(
    (scene) =>
      `<section><h2>${scene.meaningId} (${scene.kind})</h2><div class="frames">${(
        ["opening", "change", "result"] as const
      )
        .map(
          (label) =>
            `<figure><img src="${scene.samples[label].image}" alt="${scene.meaningId} ${label}"><figcaption>${label}: frame ${scene.samples[label].frame}</figcaption></figure>`,
        )
        .join("")}</div></section>`,
  )
  .join("\n")}
</html>
`;

export const generateSceneReview = async ({
  rootDir,
  projectId: rawProjectId,
  runProcess = runMediaProcess,
  inspectDelivery = inspectCurrentDelivery,
  resolveTool = resolveMediaToolCommand,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly runProcess?: ProcessRunner;
  readonly inspectDelivery?: typeof inspectCurrentDelivery;
  readonly resolveTool?: typeof resolveMediaToolCommand;
}) => {
  const projectId = StoryIdSchema.parse(rawProjectId);
  const delivery = await inspectDelivery({ rootDir, storyId: projectId });
  if (delivery === null)
    throw new Error("Project has no verified current delivery.");
  const timing = SemanticTimingSchema.parse(
    (
      await readRegularJson(
        join(
          rootDir,
          "src/projects",
          projectId,
          "generated/semantic-timing.generated.json",
        ),
        "SemanticTiming",
      )
    ).raw,
  );
  const plan = planSceneReview(timing, delivery);

  const outRoot = join(rootDir, "out");
  const projectOut = join(outRoot, projectId);
  const reviewRoot = join(projectOut, "scene-review");
  for (const directory of [outRoot, projectOut, reviewRoot]) {
    await ensureRealDirectory(directory);
  }
  const outputDir = await mkdtemp(
    join(reviewRoot, `${delivery.deliveryBuildId}-`),
  );
  try {
    const expected = plan.frames.map(
      (_, index) => `frame-${String(index + 1).padStart(4, "0")}.png`,
    );
    const videoPath = join(
      rootDir,
      "deliveries",
      projectId,
      DELIVERY_FILES.video,
    );
    for (const [index, frame] of plan.frames.entries()) {
      const invocation = await resolveTool({
        rootDir,
        tool: "ffmpeg",
        args: [
          "-v",
          "error",
          // Seek just before the target PTS so the final frame is emitted too.
          "-ss",
          (Math.max(0, frame - 0.1) / delivery.fps).toFixed(9),
          "-i",
          videoPath,
          "-frames:v",
          "1",
          "-an",
          join(outputDir, expected[index]),
        ],
      });
      const result = await runProcess(invocation.command, invocation.args, {
        cwd: rootDir,
      });
      if (result.status !== 0) {
        throw new Error(
          `Scene review frame extraction failed: ${result.stderr}`,
        );
      }
    }
    const actual = (await readdir(outputDir)).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error("Scene review frame set is incomplete.");
    }
    for (const name of actual) {
      const path = join(outputDir, name);
      const metadata = await lstat(path);
      if (
        !metadata.isFile() ||
        metadata.isSymbolicLink() ||
        metadata.size < 8
      ) {
        throw new Error("Scene review frame is unsafe or empty.");
      }
      const handle = await open(path, "r");
      try {
        const signature = Buffer.alloc(8);
        const { bytesRead } = await handle.read(signature, 0, 8, 0);
        if (
          bytesRead !== 8 ||
          !signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ) {
          throw new Error("Scene review frame is not a PNG.");
        }
      } finally {
        await handle.close();
      }
    }
    const manifest = {
      storyId: projectId,
      deliveryBuildId: delivery.deliveryBuildId,
      semanticTimingFingerprint: timing.fingerprint,
      scenes: plan.scenes,
    };
    await writeFile(
      join(outputDir, "review.json"),
      `${serializeCanonicalJson(manifest)}\n`,
      { flag: "wx" },
    );
    await writeFile(join(outputDir, "index.html"), reviewHtml(plan), {
      flag: "wx",
    });
    return {
      status: "scene-review-ready" as const,
      projectId,
      outputDir,
      sceneCount: plan.scenes.length,
    };
  } catch (error) {
    await rm(outputDir, { recursive: true, force: true });
    throw error;
  }
};
