import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  computeGenerationInputFingerprint,
  flattenTtsChunks,
  parseNarrativeProjectSource,
  validateStoryCheckReport,
} from "../../src/contracts";

const projectRoot = new URL(
  "../../src/projects/gps-relativity/",
  import.meta.url,
);

const readJson = async (relativePath: string): Promise<unknown> =>
  JSON.parse(await readFile(new URL(relativePath, projectRoot), "utf8"));

test("gps-relativity is a current real M2 source project", async () => {
  const [brief, story, narration, render, rawReport] = await Promise.all([
    readJson("brief.json"),
    readJson("story.json"),
    readJson("narration.json"),
    readJson("render.json"),
    readJson("reviews/story-check.json"),
  ]);
  const project = parseNarrativeProjectSource({
    brief,
    story,
    narration,
    render,
  });
  const report = validateStoryCheckReport({
    story: project.story,
    narration: project.narration,
    report: rawReport,
  });

  assert.equal(project.story.storyId, "gps-relativity");
  assert.equal(project.story.beats.length, 5);
  assert.equal(flattenTtsChunks(project.story).length, 10);
  assert.deepEqual(
    project.story.beats.flatMap((beat) => beat.explicitPauses),
    [
      { afterChunkId: "two-relativistic-effects-02", pauseMs: 300 },
      { afterChunkId: "error-accumulation-02", pauseMs: 400 },
    ],
  );
  assert.equal(
    project.narration.voiceProfileId,
    "science-explainer-young-male",
  );
  assert.equal(report.decision, "proceed");
  assert.equal(
    computeGenerationInputFingerprint(project.story, project.narration),
    "sha256:1b3d1abb5aa14bb8df07d2023a3ab947137a4e9f075234e82ae777a36cb39f96",
  );
  assert.equal(
    project.story.beats[0]?.ttsChunks[0]?.ttsText,
    "手机定位，表面上是在算位置，底层先是在比较时间。",
  );
});
