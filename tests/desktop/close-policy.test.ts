import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveClosePolicy,
  shouldQuitAfterConfirmation,
} from "../../desktop/application/close-policy";

test("close policy exits immediately only when no work is active", () => {
  assert.equal(
    resolveClosePolicy({ activeWork: false, intent: "window-close" }),
    "shutdown-and-quit",
  );
  assert.equal(
    resolveClosePolicy({ activeWork: false, intent: "explicit-quit" }),
    "shutdown-and-quit",
  );
  assert.equal(
    resolveClosePolicy({ activeWork: true, intent: "window-close" }),
    "hide-window",
  );
  assert.equal(
    resolveClosePolicy({ activeWork: true, intent: "explicit-quit" }),
    "confirm-quit",
  );
  assert.equal(
    resolveClosePolicy({ activeWork: true, intent: "system-quit" }),
    "shutdown-and-quit",
  );
});

test("explicit active-work quit needs an affirmative confirmation", () => {
  assert.equal(shouldQuitAfterConfirmation("confirm-quit", false), false);
  assert.equal(shouldQuitAfterConfirmation("confirm-quit", true), true);
  assert.equal(shouldQuitAfterConfirmation("shutdown-and-quit", false), true);
  assert.equal(shouldQuitAfterConfirmation("hide-window", true), false);
});

test("preparing production uses the active-work close and quit policy", () => {
  const preparing = {
    storyId: "story-one",
    kind: "production",
    attemptId: null,
    phase: "preparing-production",
  };
  assert.equal(
    resolveClosePolicy({ activeWork: preparing, intent: "window-close" }),
    "hide-window",
  );
  assert.equal(
    resolveClosePolicy({ activeWork: preparing, intent: "explicit-quit" }),
    "confirm-quit",
  );
});
