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
