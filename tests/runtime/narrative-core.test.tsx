import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Children, Fragment, isValidElement, type ReactNode } from "react";
import test from "node:test";
import ts from "typescript";
import { Html5Audio, Sequence } from "remotion";

import timingJson from "../../src/projects/gps-relativity/generated/semantic-timing.generated.json";
import {
  CaptionLayer,
  findActiveCaptionCue,
  NarrativeCore,
  NarrationAudioTrack,
  resolveCaptionLayout,
} from "../../src/remotion/runtime/narrative-core";
import { SemanticTimingSchema } from "../../src/contracts";

const timing = SemanticTimingSchema.parse(timingJson);
const runtimeDirectory = new URL(
  "../../src/remotion/runtime/narrative-core/",
  import.meta.url,
);

const parseSource = async (name: string) => {
  const source = await readFile(new URL(name, runtimeDirectory), "utf8");
  return {
    source,
    ast: ts.createSourceFile(
      name,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    ),
  };
};

test("NarrationAudioTrack mounts exactly one complete audio at rate one", () => {
  const track = NarrationAudioTrack({
    src: "resolved-complete.wav",
    leadInFrames: 15,
  });
  assert.ok(isValidElement<{ from: number; children: ReactNode }>(track));
  assert.equal(track.type, Sequence);
  assert.equal(track.props.from, 15);
  const audio = Children.only(track.props.children);
  assert.ok(
    isValidElement<{
      src: string;
      playbackRate: number;
      trimBefore?: number;
      trimAfter?: number;
      loop?: boolean;
    }>(audio),
  );
  assert.equal(audio.type, Html5Audio);
  assert.equal(audio.props.src, "resolved-complete.wav");
  assert.equal(audio.props.playbackRate, 1);
  assert.equal(audio.props.trimBefore, undefined);
  assert.equal(audio.props.trimAfter, undefined);
  assert.equal(audio.props.loop, undefined);
});

test("CaptionLayer selects only existing absolute left-closed right-open ranges", () => {
  const cues = timing.captionCues;
  assert.equal(findActiveCaptionCue(cues, 14), undefined);
  assert.equal(findActiveCaptionCue(cues, 15)?.chunkId, "position-is-time-01");
  assert.equal(findActiveCaptionCue(cues, 155)?.chunkId, "position-is-time-02");
  assert.equal(findActiveCaptionCue(cues, 687), undefined);
  assert.equal(findActiveCaptionCue(cues, 696)?.chunkId, "net-drift-01");
  assert.equal(findActiveCaptionCue(cues, 1716), undefined);
});

test("CaptionLayer resolves safe areas and maximum width across output shapes", () => {
  const safeAreaPx = { top: 80, right: 120, bottom: 120, left: 120 };

  assert.deepEqual(
    resolveCaptionLayout({ width: 1920, height: 1080, safeAreaPx }),
    {
      safeAreaPx,
      maxCaptionWidth: 1440,
      fontSize: 40,
    },
  );
  assert.deepEqual(
    resolveCaptionLayout({ width: 3840, height: 2160, safeAreaPx }),
    {
      safeAreaPx: { top: 108, right: 192, bottom: 173, left: 192 },
      maxCaptionWidth: 2880,
      fontSize: 40,
    },
  );
  assert.deepEqual(
    resolveCaptionLayout({ width: 1080, height: 1920, safeAreaPx }),
    {
      safeAreaPx: { top: 96, right: 120, bottom: 154, left: 120 },
      maxCaptionWidth: 840,
      fontSize: 40,
    },
  );
});

test("NarrativeCore has one audio track and one CaptionLayer with no canvas", () => {
  const core = NarrativeCore({
    src: "resolved-complete.wav",
    leadInFrames: 15,
    captionCues: timing.captionCues,
    safeAreaPx: { top: 80, right: 120, bottom: 120, left: 120 },
  });
  assert.ok(isValidElement<{ children: ReactNode }>(core));
  assert.equal(core.type, Fragment);
  const children = Children.toArray(core.props.children);
  assert.deepEqual(
    children.map((child) => (isValidElement(child) ? child.type : undefined)),
    [NarrationAudioTrack, CaptionLayer],
  );
});

test("runtime source makes forbidden timing and visual behavior absent", async () => {
  const audio = await parseSource("NarrationAudioTrack.tsx");
  const caption = await parseSource("CaptionLayer.tsx");
  const core = await parseSource("NarrativeCore.tsx");

  assert.equal(audio.ast.kind, ts.SyntaxKind.SourceFile);
  assert.equal(caption.ast.kind, ts.SyntaxKind.SourceFile);
  assert.equal(core.ast.kind, ts.SyntaxKind.SourceFile);
  assert.equal((audio.source.match(/<Html5Audio\b/g) ?? []).length, 1);
  assert.equal((audio.source.match(/<Sequence\b/g) ?? []).length, 1);
  assert.match(audio.source, /playbackRate=\{1\}/);
  assert.doesNotMatch(audio.source, /trimBefore|trimAfter|\bloop\b|\.map\(/);
  assert.doesNotMatch(
    caption.source,
    /\bfps\b|sampleRate|sample-frame|pcm|ttsChunks|Html5Audio|\bAudio\b/,
  );
  assert.match(caption.source, /useCurrentFrame\(\)/);
  assert.match(caption.source, /<AbsoluteFill style=\{fullFrameStyle\}>/);
  assert.doesNotMatch(
    core.source,
    /BaseCanvas|AbsoluteFill|capabilities|Scene|StoryVisualTrack|SoundDesignTrack|GlobalVisualLayers/,
  );
});
