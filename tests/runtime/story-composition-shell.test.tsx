import assert from "node:assert/strict";
import { Children, createElement, isValidElement, type ReactNode } from "react";
import test from "node:test";
import { Series } from "remotion";

import {
  StoryCompositionShell,
  type StoryCompositionShellProps,
} from "../../src/remotion/runtime/story-composition-shell";
import {
  FIXED_INTRO_DURATION_IN_FRAMES,
  FIXED_OUTRO_DURATION_IN_FRAMES,
  getStoryCompositionDurationInFrames,
} from "../../src/contracts/story-composition";

const renderShell = (props: StoryCompositionShellProps) => {
  const shell = StoryCompositionShell(props);
  assert.ok(isValidElement<{ children?: ReactNode }>(shell));
  assert.equal(shell.type, Series);
  return shell;
};

test("StoryCompositionShell keeps an unadorned body on its own local timeline", () => {
  const body = createElement("span", null, "body");
  const shell = renderShell({ bodyDurationInFrames: 120, children: body });
  const sequences = Children.toArray(shell.props.children);

  assert.equal(sequences.length, 1);
  assert.ok(
    isValidElement<{ durationInFrames: number; children?: ReactNode }>(
      sequences[0],
    ),
  );
  assert.equal(sequences[0].type, Series.Sequence);
  assert.equal(sequences[0].props.durationInFrames, 120);
  assert.equal(sequences[0].props.children, body);
});

test("StoryCompositionShell orders optional intro and outro around the body", () => {
  const shell = renderShell({
    intro: {
      durationInFrames: 30,
      content: createElement("span", null, "intro"),
    },
    bodyDurationInFrames: 120,
    children: createElement("span", null, "body"),
    outro: {
      durationInFrames: 45,
      content: createElement("span", null, "outro"),
    },
  });
  const sequences = Children.toArray(shell.props.children);

  assert.deepEqual(
    sequences.map((sequence) => {
      assert.ok(
        isValidElement<{ durationInFrames: number; children?: ReactNode }>(
          sequence,
        ),
      );
      assert.equal(sequence.type, Series.Sequence);
      assert.ok(
        isValidElement<{ children?: ReactNode }>(sequence.props.children),
      );
      return {
        durationInFrames: sequence.props.durationInFrames,
        content: sequence.props.children.props.children,
      };
    }),
    [
      { durationInFrames: 30, content: "intro" },
      { durationInFrames: 120, content: "body" },
      { durationInFrames: 45, content: "outro" },
    ],
  );
});

test("fixed production boundaries preserve every body-local frame", () => {
  const bodyDurationInFrames = 120;
  const shell = renderShell({
    intro: {
      durationInFrames: FIXED_INTRO_DURATION_IN_FRAMES,
      content: createElement("span", null, "intro"),
    },
    bodyDurationInFrames,
    children: createElement("span", null, "body"),
    outro: {
      durationInFrames: FIXED_OUTRO_DURATION_IN_FRAMES,
      content: createElement("span", null, "outro"),
    },
  });
  const durations = Children.toArray(shell.props.children).map((sequence) => {
    assert.ok(isValidElement<{ durationInFrames: number }>(sequence));
    return sequence.props.durationInFrames;
  });
  const starts = durations.map((_, index) =>
    durations.slice(0, index).reduce((sum, duration) => sum + duration, 0),
  );

  assert.deepEqual(durations, [60, 120, 240]);
  assert.deepEqual(starts, [0, 60, 180]);
  assert.equal(starts[1] - 1, 59);
  assert.equal(starts[2] - 1, 179);
  assert.equal(
    durations.reduce((sum, duration) => sum + duration, 0),
    getStoryCompositionDurationInFrames(bodyDurationInFrames),
  );
});

test("StoryCompositionShell rejects invalid frame durations", () => {
  const body = createElement("span");
  assert.throws(
    () => StoryCompositionShell({ bodyDurationInFrames: 0, children: body }),
    /body duration must be a positive safe integer/iu,
  );
  assert.throws(
    () =>
      StoryCompositionShell({
        intro: { durationInFrames: 1.5, content: createElement("span") },
        bodyDurationInFrames: 120,
        children: body,
      }),
    /intro duration must be a positive safe integer/iu,
  );
});
