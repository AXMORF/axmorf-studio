import assert from "node:assert/strict";
import test from "node:test";

import { VideoBriefSchema } from "../../src/contracts/brief";
import { flattenTtsChunks, StorySpecSchema } from "../../src/contracts/story";
import { validStorySpec, validVideoBrief } from "../fixtures/narrative";

test("valid authored inputs preserve StoryBeat and TTSChunk order", () => {
  const brief = VideoBriefSchema.parse(validVideoBrief);
  const story = StorySpecSchema.parse(validStorySpec);

  assert.equal(brief.storyId, story.storyId);
  assert.deepEqual(brief.sourceReferences, validVideoBrief.sourceReferences);
  assert.deepEqual(flattenTtsChunks(story), [
    { chunkId: "opening-01", meaningId: "opening", ttsText: "A" },
    { chunkId: "conclusion-01", meaningId: "conclusion", ttsText: "B" },
  ]);
});

test("VideoBrief keeps structured public source references", () => {
  assert.deepEqual(
    VideoBriefSchema.parse({
      ...validVideoBrief,
      sourceReferences: [
        {
          title: "Remotion documentation",
          url: "https://www.remotion.dev/docs/",
        },
        {
          title: "Local development reference",
          url: "http://127.0.0.1:3000/reference",
        },
      ],
    }).sourceReferences,
    [
      {
        title: "Remotion documentation",
        url: "https://www.remotion.dev/docs/",
      },
      {
        title: "Local development reference",
        url: "http://127.0.0.1:3000/reference",
      },
    ],
  );
  assert.throws(() =>
    VideoBriefSchema.parse({
      ...validVideoBrief,
      sourceReferences: [
        { title: "Unsafe protocol", url: "file:///tmp/reference.md" },
      ],
    }),
  );
  assert.throws(() =>
    VideoBriefSchema.parse({
      ...validVideoBrief,
      sourceReferences: [{ title: "Malformed", url: "not a URL" }],
    }),
  );
});

test("VideoBrief projects an empty source-reference list when none is authored", () => {
  const { sourceReferences: _sourceReferences, ...withoutReferences } =
    validVideoBrief;
  void _sourceReferences;
  assert.deepEqual(
    VideoBriefSchema.parse(withoutReferences).sourceReferences,
    [],
  );
});

test("all authoring objects reject unknown fields", () => {
  assert.throws(() =>
    VideoBriefSchema.parse({ ...validVideoBrief, providerUrl: "http://tts" }),
  );
  assert.throws(() =>
    StorySpecSchema.parse({ ...validStorySpec, rendererId: "forbidden" }),
  );
});

test("StorySpec rejects duplicate semantic and chunk ids", () => {
  const duplicateMeaning = {
    ...validStorySpec,
    beats: [
      validStorySpec.beats[0],
      { ...validStorySpec.beats[1], meaningId: "opening" },
    ],
  };
  const duplicateChunk = {
    ...validStorySpec,
    beats: [
      validStorySpec.beats[0],
      {
        ...validStorySpec.beats[1],
        ttsChunks: [{ chunkId: "opening-01", ttsText: "B" }],
      },
    ],
  };

  assert.throws(() => StorySpecSchema.parse(duplicateMeaning));
  assert.throws(() => StorySpecSchema.parse(duplicateChunk));
});

test("explicit pauses must follow one chunk in the owning StoryBeat", () => {
  const unknownChunk = {
    ...validStorySpec,
    beats: [
      {
        ...validStorySpec.beats[0],
        explicitPauses: [{ afterChunkId: "missing-01", pauseMs: 250 }],
      },
      validStorySpec.beats[1],
    ],
  };
  const duplicatePause = {
    ...validStorySpec,
    beats: [
      {
        ...validStorySpec.beats[0],
        explicitPauses: [
          { afterChunkId: "opening-01", pauseMs: 250 },
          { afterChunkId: "opening-01", pauseMs: 500 },
        ],
      },
      validStorySpec.beats[1],
    ],
  };

  assert.throws(() => StorySpecSchema.parse(unknownChunk));
  assert.throws(() => StorySpecSchema.parse(duplicatePause));
});

test("explicit pause declarations follow their chunk order", () => {
  assert.throws(() =>
    StorySpecSchema.parse({
      ...validStorySpec,
      beats: [
        {
          ...validStorySpec.beats[0],
          ttsChunks: [
            { chunkId: "opening-01", ttsText: "A" },
            { chunkId: "opening-02", ttsText: "A2" },
          ],
          explicitPauses: [
            { afterChunkId: "opening-02", pauseMs: 100 },
            { afterChunkId: "opening-01", pauseMs: 100 },
          ],
        },
        validStorySpec.beats[1],
      ],
    }),
  );
});

test("explicit pause milliseconds are non-negative integers", () => {
  assert.doesNotThrow(() =>
    StorySpecSchema.parse({
      ...validStorySpec,
      beats: [
        {
          ...validStorySpec.beats[0],
          explicitPauses: [{ afterChunkId: "opening-01", pauseMs: 0 }],
        },
        validStorySpec.beats[1],
      ],
    }),
  );
  assert.throws(() =>
    StorySpecSchema.parse({
      ...validStorySpec,
      beats: [
        {
          ...validStorySpec.beats[0],
          explicitPauses: [{ afterChunkId: "opening-01", pauseMs: -1 }],
        },
        validStorySpec.beats[1],
      ],
    }),
  );
});
