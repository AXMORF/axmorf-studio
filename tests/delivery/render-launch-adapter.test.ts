import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { launchDetachedRemotionRender } from "../../scripts/delivery/adapters/render-launch";

test("detached adapter waits for spawn, immediately unreferences, and ignores exit", async () => {
  const child = new EventEmitter() as EventEmitter & {
    unref: () => void;
  };
  let unrefCount = 0;
  child.unref = () => {
    unrefCount += 1;
  };
  const spawnCalls: unknown[][] = [];
  const launched = launchDetachedRemotionRender({
    rootDir: "/repo",
    command: "/repo/node_modules/.bin/remotion",
    args: ["render", "src/index.ts", "StoryExample", "deliveries/story.mp4"],
    logPath: "/repo/out/story/render.log",
    openLog: async () => ({ fd: 17, close: async () => undefined }),
    spawnChild: (...args) => {
      spawnCalls.push(args);
      queueMicrotask(() => {
        child.emit("spawn");
        child.emit("exit", 1);
      });
      return child;
    },
  });

  await launched;
  assert.equal(spawnCalls.length, 1);
  assert.equal(unrefCount, 1);
  assert.equal(child.listenerCount("exit"), 0);
  assert.equal(child.listenerCount("close"), 0);
});

test("spawn failure rejects and cannot be mistaken for launch success", async () => {
  const child = new EventEmitter() as EventEmitter & { unref: () => void };
  child.unref = () => assert.fail("unref must not run after spawn failure");
  await assert.rejects(
    launchDetachedRemotionRender({
      rootDir: "/repo",
      command: "/repo/node_modules/.bin/remotion",
      args: ["render", "src/index.ts", "StoryExample", "deliveries/story.mp4"],
      logPath: "/repo/out/story/render.log",
      openLog: async () => ({ fd: 17, close: async () => undefined }),
      spawnChild: () => {
        queueMicrotask(() => child.emit("error", new Error("spawn failed")));
        return child;
      },
    }),
    /spawn failed/u,
  );
});
