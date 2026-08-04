import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { TestContext } from "node:test";

import {
  buildProductionRequirementsFreeze,
  computeGenerationInputFingerprint,
  computeStoryFingerprint,
  NarrationSpecSchema,
  STORY_CHECK_IDS,
  StoryCheckReportSchema,
  StorySpecSchema,
} from "../../src/contracts";
import { runProductionStart } from "../../scripts/production/start";
import {
  validNarrationSpec,
  validProjectSource,
  validStorySpec,
} from "../fixtures/narrative";

export const FIXED_PRODUCTION_NOW = new Date("2026-08-04T00:00:00.000Z");
export const FIXED_PRODUCTION_RUN_ID = "story-example-run-001";

export const checksumText = (bytes: string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;

export const writeProductionJson = async (path: string, value: unknown) => {
  await mkdir(dirname(path), { recursive: true });
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(path, bytes);
  return checksumText(bytes);
};
export const createProductionFixture = async (
  context: TestContext,
  rootDir: string,
) => {
  const projectDir = join(rootDir, "src/projects/story-example");
  const story = StorySpecSchema.parse(validStorySpec);
  const narration = NarrationSpecSchema.parse(validNarrationSpec);
  const storyCheck = StoryCheckReportSchema.parse({
    schemaVersion: 1,
    storyId: story.storyId,
    storyFingerprint: computeStoryFingerprint(story),
    generationInputFingerprint: computeGenerationInputFingerprint(
      story,
      narration,
    ),
    voiceProfileId: narration.voiceProfileId,
    decision: "proceed",
    checks: STORY_CHECK_IDS.map((checkId) => ({
      checkId,
      status: "pass",
      note: `Checked ${checkId}.`,
    })),
  });
  const source = { ...validProjectSource, storyCheck } as const;
  const sourceChecksums = {
    videoBrief: await writeProductionJson(
      join(projectDir, "brief.json"),
      source.brief,
    ),
    storySpec: await writeProductionJson(
      join(projectDir, "story.json"),
      source.story,
    ),
    narrationSpec: await writeProductionJson(
      join(projectDir, "narration.json"),
      source.narration,
    ),
    renderSpec: await writeProductionJson(
      join(projectDir, "render.json"),
      source.render,
    ),
    storyCheck: await writeProductionJson(
      join(projectDir, "reviews/story-check.json"),
      source.storyCheck,
    ),
  };
  const requirements = buildProductionRequirementsFreeze({
    source,
    sourceChecksums,
    enhancementSelection: {
      storyVisual: "required",
      sceneLocalSound: "allowed",
      globalSound: "none",
      globalVisual: "none",
    },
    resourcePolicy: {
      selfAuthoredVisualsAllowed: true,
      unlistedThirdPartyResources: "deny",
    },
    additionalRequirements: [],
  });
  await writeProductionJson(
    join(projectDir, "production/requirements.json"),
    requirements,
  );
  const started = await runProductionStart({
    rootDir,
    projectId: story.storyId,
    clock: () => FIXED_PRODUCTION_NOW,
    createRunId: () => FIXED_PRODUCTION_RUN_ID,
  });
  void context;
  return {
    rootDir,
    projectDir,
    source,
    requirements,
    runId: started.runId,
  } as const;
};
