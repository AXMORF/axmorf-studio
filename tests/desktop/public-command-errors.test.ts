import assert from "node:assert/strict";
import test from "node:test";

import {
  publicPrepareCommandError,
  publicTaskCommandError,
} from "../../desktop/application/public-command-errors";

test("prepare errors expose a safe fixed-stage issue without leaking the private cause", () => {
  const template = publicPrepareCommandError(
    new Error(
      "Scene task compile failed (TS2307) at /Users/private/Workspace/Renderer.tsx",
    ),
  );
  assert.equal(template.code, "rsp-command-failed");
  assert.equal(template.message, "Production preparation failed.");
  assert.deepEqual(template.issues, [
    {
      path: "$.storyId",
      code: "rsp-prepare-scene-template-failed",
      message: "A configured Scene template failed fixed preparation.",
      ownerAction:
        "Do not retry this stopped lifecycle. Update AXMORF Studio to a compatible Runtime Pack, then start a new prepare attempt.",
    },
  ]);
  assert.doesNotMatch(JSON.stringify(template), /Users|private|TS2307/u);

  const generic = publicPrepareCommandError(
    new Error("private /absolute/path must not escape"),
  );
  assert.equal(generic.issues[0]?.code, "rsp-prepare-internal-failed");
  assert.doesNotMatch(JSON.stringify(generic), /absolute|private/iu);
});

test("task errors keep their existing operation-specific public mapping", () => {
  assert.equal(
    publicTaskCommandError({
      operation: "check",
      error: new Error("Renderer compile failed."),
    }).issues[0]?.code,
    "rsp-task-source-invalid",
  );
});

test("task readability errors expose actionable safe Renderer diagnostics", () => {
  const transform = publicTaskCommandError({
    operation: "check",
    error: new Error(
      "Renderer transform must be statically provable in src/Renderer.tsx.",
    ),
  });
  assert.deepEqual(transform.issues, [
    {
      path: "$.outputs[src/Renderer.tsx]",
      code: "rsp-task-renderer-transform-unprovable",
      message:
        "Renderer transform or scale is computed dynamically and cannot be proven readable.",
      ownerAction:
        "Remove frame-computed transform and scale values. Use frame-driven opacity, top, left, width, or height for motion, then rerun finalize and check.",
    },
  ]);

  const undersized = publicTaskCommandError({
    operation: "check",
    error: new Error(
      "Visible text size 22px is below the frozen 32px minimum in /Users/private/Renderer.tsx.",
    ),
  });
  assert.equal(
    undersized.issues[0]?.code,
    "rsp-task-text-size-below-minimum",
  );
  assert.equal(
    undersized.issues[0]?.message,
    "Visible text size 22px is below the frozen 32px minimum.",
  );
  assert.doesNotMatch(JSON.stringify(undersized), /Users|private/u);
});

test("GlobalVisual policy errors identify the owning output safely", () => {
  const boundary = publicTaskCommandError({
    operation: "check",
    error: new Error(
      "GlobalVisual source crosses its visual-only boundary: visible text.",
    ),
  });
  assert.deepEqual(boundary.issues, [
    {
      path: "$.outputs[src/GlobalVisualLayers.tsx]",
      code: "rsp-task-global-visual-boundary-invalid",
      message:
        "GlobalVisualLayers contains visible text or shared Scene, caption, narration, audio, or network ownership.",
      ownerAction:
        "Keep GlobalVisualLayers decorative and text-free; remove the named shared-boundary usage, then rerun finalize and check.",
    },
  ]);
});
