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
  ShotPlanSetSchema,
  SceneSyncAnchorSetSchema,
  StorySpecSchema,
  aggregateSceneStoryBeat,
  aggregateSceneTimingBeat,
  resolveStorySceneGroups,
  validateSceneMotionPlan,
  StoryIdSchema,
  serializeCanonicalJson,
} from "@axmorf/studio/contracts";
import { inspectCurrentDelivery } from "../project-production/adapters/current-delivery-inspection";
import { readRegularJson } from "../project-production/adapters/project-input-snapshot";
import { resolveMediaToolCommand } from "../shared/media-tool-command";
import { runMediaProcess } from "../shared/media-process";
import type { ProcessRunner } from "../shared/process";
import { planSceneReview } from "./plan";
import { planMotionReview, planActionReview } from "./motion";

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

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/gu,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );

const reviewHtml = (
  plan: ReturnType<typeof planSceneReview>,
  clips: readonly {
    kind: string;
    startFrame: number;
    endFrame: number;
    file: string;
  }[],
  actions: ReturnType<typeof planActionReview>,
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
<p>Evidence generation does not approve motion, continuity, or listening quality.</p>
${clips.map((clip) => `<section><h2>${clip.kind}: frames ${clip.startFrame}–${clip.endFrame - 1}</h2><video controls preload="metadata" style="max-width:100%;max-height:75vh" src="${clip.file}"></video></section>`).join("\n")}
${actions.map((action) => `<section><h2>${escapeHtml(action.meaningId)} / ${escapeHtml(action.actionId)}</h2><p>${escapeHtml(action.explanatoryPurpose)}</p><p>${escapeHtml(action.initialState)} → ${escapeHtml(action.resultingState)}</p><p>Reading hold: ${action.readingHold ? `${action.readingHold.startFrame}–${action.readingHold.endFrame - 1}` : "none declared"}. Target revision: ${escapeHtml(action.meaningId)}, action ${escapeHtml(action.actionId)}.</p><p>Current source-plan annotation, not delivery-attested animation or automatic approval. Compare the actual clip against this intent. Record observed issues in revision-feedback.json; use the isolated project:revise workflow.</p></section>`).join("\n")}
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
  motion = false,
}: {
  readonly rootDir: string;
  readonly projectId: string;
  readonly runProcess?: ProcessRunner;
  readonly inspectDelivery?: typeof inspectCurrentDelivery;
  readonly resolveTool?: typeof resolveMediaToolCommand;
  readonly motion?: boolean;
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
  const motionScenes = [];
  if (motion) {
    const story = StorySpecSchema.parse(
      (
        await readRegularJson(
          join(rootDir, "src/projects", projectId, "story.json"),
          "StorySpec",
        )
      ).raw,
    );
    if (
      story.storyId !== projectId ||
      serializeCanonicalJson(story.beats.map(({ meaningId }) => meaningId)) !==
        serializeCanonicalJson(
          timing.storyBeats.map(({ meaningId }) => meaningId),
        )
    ) {
      throw new Error(
        "Motion review Story ownership is stale against current timing.",
      );
    }
    for (const group of resolveStorySceneGroups(story)) {
      const meaningIds = group.beats.map(({ meaningId }) => meaningId);
      motionScenes.push({
        meaningIds,
        beat: aggregateSceneTimingBeat(
          timing.storyBeats,
          meaningIds,
          aggregateSceneStoryBeat(group.beats),
        ),
      });
    }
  }
  const sceneClips = motion
    ? planMotionReview(
        motionScenes.map(({ beat }) => beat),
        timing.fps,
        timing.durationInFrames,
        {
          startFrame: timing.leadInFrames,
          endFrame: timing.durationInFrames - timing.tailFrames,
        },
      )
    : [];

  const actions: ReturnType<typeof planActionReview> = [];
  const sourcePlans: { meaningId: string; status: string }[] = [];
  if (motion)
    for (const { beat, meaningIds } of motionScenes) {
      let raw: unknown;
      try {
        raw = (
          await readRegularJson(
            join(
              rootDir,
              "src/projects",
              projectId,
              "scenes",
              beat.meaningId,
              "shot-plan.json",
            ),
            "Scene shot plan",
          )
        ).raw;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        sourcePlans.push({
          meaningId: beat.meaningId,
          status: "no-source-plan",
        });
        continue;
      }
      const shots = ShotPlanSetSchema.parse(raw);
      if (
        shots.meaningId !== beat.meaningId ||
        shots.sceneDurationInFrames !== beat.endFrame - beat.startFrame
      )
        throw new Error(
          "Motion review source plan is stale against Scene timing.",
        );
      if (shots.motionPlan) {
        const anchors = SceneSyncAnchorSetSchema.parse(
          (
            await readRegularJson(
              join(
                rootDir,
                "src/projects",
                projectId,
                "scenes",
                beat.meaningId,
                "sync-anchors.json",
              ),
              "Scene sync anchors",
            )
          ).raw,
        );
        if (
          anchors.meaningId !== shots.meaningId ||
          anchors.taskInputFingerprint !== shots.taskInputFingerprint
        )
          throw new Error("Motion review source anchors are cross-bound.");
        validateSceneMotionPlan({
          plan: shots.motionPlan,
          shots: shots.shots,
          anchors: anchors.anchors,
          duration: shots.sceneDurationInFrames,
          narrationCues:
            beat.kind === "narrated-scene"
              ? timing.captionCues
                  .filter((cue) => meaningIds.includes(cue.meaningId))
                  .map((cue) => ({
                    startFrame: cue.startFrame - beat.startFrame,
                    endFrame: cue.endFrame - beat.startFrame,
                  }))
              : undefined,
        });
      }
      actions.push(...planActionReview(shots, beat.startFrame));
      sourcePlans.push({
        meaningId: beat.meaningId,
        status: shots.motionPlan
          ? "current-source-reference-not-delivery-attested"
          : "legacy-plan-without-motion",
      });
    }
  const clips = [
    ...sceneClips,
    ...actions.map((action, index) => ({
      kind: "action" as const,
      ...action.frameRange,
      file: `motion-action-${String(index + 1).padStart(4, "0")}.mp4`,
    })),
  ];
  const frames = [
    ...new Set([
      ...plan.frames,
      ...actions.flatMap((action) => action.sampleFrames),
    ]),
  ].sort((a, b) => a - b);
  const imageForFrame = new Map(
    frames.map((frame, index) => [
      frame,
      `frame-${String(index + 1).padStart(4, "0")}.png`,
    ]),
  );
  const mappedPlan = {
    ...plan,
    scenes: plan.scenes.map((scene) => ({
      ...scene,
      samples: Object.fromEntries(
        Object.entries(scene.samples).map(([label, sample]) => [
          label,
          { ...sample, image: imageForFrame.get(sample.frame)! },
        ]),
      ) as typeof scene.samples,
    })),
  };

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
    const expected = frames.map(
      (_, index) => `frame-${String(index + 1).padStart(4, "0")}.png`,
    );
    const videoPath = join(
      rootDir,
      "deliveries",
      projectId,
      DELIVERY_FILES.video,
    );
    for (const [index, frame] of frames.entries()) {
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
    for (const clip of clips) {
      const invocation = await resolveTool({
        rootDir,
        tool: "ffmpeg",
        args: [
          "-v",
          "error",
          "-ss",
          (clip.startFrame / timing.fps).toFixed(9),
          "-i",
          videoPath,
          "-t",
          ((clip.endFrame - clip.startFrame) / timing.fps).toFixed(9),
          "-map",
          "0:v:0",
          "-map",
          "0:a:0?",
          "-c:v",
          "libx264",
          "-crf",
          "18",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-movflags",
          "+faststart",
          join(outputDir, clip.file),
        ],
      });
      const result = await runProcess(invocation.command, invocation.args, {
        cwd: rootDir,
      });
      if (result.status !== 0)
        throw new Error(
          `Scene review motion extraction failed: ${result.stderr}`,
        );
      const clipPath = join(outputDir, clip.file);
      const metadata = await lstat(clipPath);
      if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 12)
        throw new Error("Scene review motion clip is unsafe or empty.");
      const handle = await open(clipPath, "r");
      try {
        const header = Buffer.alloc(12);
        const { bytesRead } = await handle.read(header, 0, 12, 0);
        if (bytesRead !== 12 || header.toString("ascii", 4, 8) !== "ftyp")
          throw new Error("Scene review motion clip is not an MP4.");
      } finally {
        await handle.close();
      }
    }
    const manifest = {
      storyId: projectId,
      deliveryBuildId: delivery.deliveryBuildId,
      semanticTimingFingerprint: timing.fingerprint,
      scenes: mappedPlan.scenes,
      motion: {
        clips,
        sourcePlans,
        actions: actions.map((action) => ({
          ...action,
          samples: action.sampleFrames.map((frame) => ({
            frame,
            image: imageForFrame.get(frame)!,
          })),
        })),
        approval: "not-assessed",
      },
    };
    await writeFile(
      join(outputDir, "review.json"),
      `${serializeCanonicalJson(manifest)}\n`,
      { flag: "wx" },
    );
    if (motion)
      await writeFile(
        join(outputDir, "revision-feedback.json"),
        `${serializeCanonicalJson({
          deliveryBuildId: delivery.deliveryBuildId,
          assessment: "not-assessed",
          instructions:
            "Review actual clips, then record observed defects by meaningId/actionId and frameRange. This feedback is diagnostic, not an accepted production revision input. Read project:revise:context and create a strict isolated revision; preserve sealed narration and unaffected assets. Release checks remain unchanged.",
          issues: [],
          targets: actions.map((action) => ({
            ...action.revisionTarget,
            frameRange: action.frameRange,
          })),
          limitations: [
            "Source-plan annotations are not attested to this delivered video",
            "Motion/state metrics do not certify explanatory or aesthetic quality",
            "Review continuous playback and listen to audio; stills alone are insufficient",
          ],
        })}\n`,
        { flag: "wx" },
      );
    await writeFile(
      join(outputDir, "index.html"),
      reviewHtml(mappedPlan, clips, actions),
      {
        flag: "wx",
      },
    );
    return {
      status: "scene-review-ready" as const,
      projectId,
      outputDir,
      sceneCount: plan.scenes.length,
      actionCount: actions.length,
      motionAssessment: "not-assessed" as const,
    };
  } catch (error) {
    await rm(outputDir, { recursive: true, force: true });
    throw error;
  }
};
