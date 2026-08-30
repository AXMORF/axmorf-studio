import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";

import {
  parseDevArguments,
  parseSinglePortArgument,
  startDevServices,
  startPreviewService,
  type SpawnedProcess,
} from "../../packages/studio/src/cli/launchers";

class FakeProcess extends EventEmitter implements SpawnedProcess {
  readonly pid = 42;
  terminated = false;

  terminate = () => {
    this.terminated = true;
  };
}

test("Web Preview and dev ports have strict non-reordered arguments", () => {
  assert.deepEqual(parseSinglePortArgument([], "--port", 3100), { port: 3100 });
  assert.deepEqual(
    parseSinglePortArgument(["--port", "43100"], "--port", 3100),
    {
      port: 43100,
    },
  );
  assert.deepEqual(parseDevArguments([]), { webPort: 3100, studioPort: 3101 });
  assert.deepEqual(
    parseDevArguments(["--web-port", "43100", "--studio-port", "43101"]),
    { webPort: 43100, studioPort: 43101 },
  );
  for (const args of [
    ["--port", "0"],
    ["--port", "not-a-port"],
    ["--studio-port", "43101", "--web-port", "43100"],
  ]) {
    assert.throws(
      () =>
        args[0] === "--port"
          ? parseSinglePortArgument(args, "--port", 3100)
          : parseDevArguments(args),
      /port/iu,
    );
  }
});

test("Preview executes the Workspace-local Remotion JS entry without shell or .bin", async () => {
  const child = new FakeProcess();
  const calls: unknown[] = [];
  const service = await startPreviewService({
    rootDir: "/workspace",
    port: 43101,
    resolveRemotion: async () => ({
      command: "/node",
      argsPrefix: ["/workspace/node_modules/@remotion/cli/remotion-cli.js"],
    }),
    spawnProcess: (request) => {
      calls.push(request);
      return child;
    },
  });
  assert.deepEqual(calls, [
    {
      command: "/node",
      args: [
        "/workspace/node_modules/@remotion/cli/remotion-cli.js",
        "studio",
        "src/index.ts",
        "--port=43101",
        "--no-open",
      ],
      cwd: "/workspace",
      env: process.env,
    },
  ]);
  await service.close();
  assert.equal(child.terminated, true);
});

test("dev closes Web when Studio exits and closes Studio when Web startup fails", async () => {
  const child = new FakeProcess();
  let webCloseCount = 0;
  const service = await startDevServices({
    rootDir: "/workspace",
    webPort: 43100,
    studioPort: 43101,
    startWeb: async () => ({
      url: "http://127.0.0.1:43100/",
      close: async () => {
        webCloseCount += 1;
      },
    }),
    startPreview: async () => ({
      url: "http://127.0.0.1:43101/",
      wait: () =>
        new Promise((resolvePromise) => {
          child.once("exit", (code, signal) =>
            resolvePromise({ code, signal }),
          );
        }),
      close: async () => child.terminate(),
    }),
  });
  child.emit("exit", 7, null);
  assert.deepEqual(await service.wait(), { code: 7, signal: null });
  assert.equal(webCloseCount, 1);
  await service.close();
  assert.equal(webCloseCount, 1);
  assert.equal(child.terminated, true);

  let closedAfterFailure = false;
  await assert.rejects(
    startDevServices({
      rootDir: "/workspace",
      webPort: 43100,
      studioPort: 43101,
      startWeb: async () => ({
        url: "http://127.0.0.1:43100/",
        close: async () => {
          closedAfterFailure = true;
        },
      }),
      startPreview: async () => {
        throw new Error("studio failed");
      },
    }),
    /studio failed/u,
  );
  assert.equal(closedAfterFailure, true);
});
