import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("exact Remotion 4.0.489 requires the scoped Workspace loopback adapter", async () => {
  const root = process.cwd();
  const [
    rendererPackage,
    portConfig,
    prepareServer,
    serveStatic,
    bundlerPackage,
    workspaceRenderer,
  ] = await Promise.all([
    readFile(
      join(root, "node_modules/@remotion/renderer/package.json"),
      "utf8",
    ).then((value) => JSON.parse(value) as { version: string }),
    readFile(
      join(root, "node_modules/@remotion/renderer/dist/port-config.js"),
      "utf8",
    ),
    readFile(
      join(root, "node_modules/@remotion/renderer/dist/prepare-server.js"),
      "utf8",
    ),
    readFile(
      join(root, "node_modules/@remotion/renderer/dist/serve-static.js"),
      "utf8",
    ),
    readFile(
      join(root, "node_modules/@remotion/bundler/package.json"),
      "utf8",
    ).then(
      (value) =>
        JSON.parse(value) as { dependencies: Readonly<Record<string, string>> },
    ),
    readFile(
      join(
        root,
        "scripts/project-production/adapters/workspace-remotion-renderer.ts",
      ),
      "utf8",
    ),
  ]);

  assert.equal(rendererPackage.version, "4.0.489");
  assert.match(portConfig, /return '0\.0\.0\.0'/u);
  assert.match(portConfig, /return '::'/u);
  assert.match(prepareServer, /serveStatic/u);
  assert.match(prepareServer, /http:\/\/localhost:/u);
  assert.match(serveStatic, /getPortConfig\)\(options\.forceIPv4\)/u);
  assert.match(
    serveStatic,
    /server\.listen\(\{ port, host: portConfig\.host \}\)/u,
  );
  assert.equal(bundlerPackage.dependencies["@remotion/studio"], "4.0.489");
  assert.equal(
    bundlerPackage.dependencies["@remotion/studio-shared"],
    "4.0.489",
  );

  assert.match(
    workspaceRenderer,
    /const REMOTION_RENDERER_VERSION = "4\.0\.489"/u,
  );
  assert.match(workspaceRenderer, /from "\.\.\/domain\/production-locations"/u);
  assert.doesNotMatch(workspaceRenderer, /buildDelivery/u);
  assert.doesNotMatch(workspaceRenderer, /prepareProjectAuthoringBuild/u);
  assert.match(
    workspaceRenderer,
    /export type WorkspaceRemotionRenderExecution/u,
  );
  assert.match(
    workspaceRenderer,
    /join\(rendererRoot, "dist\/port-config\.js"\)/u,
  );
  assert.match(
    workspaceRenderer,
    /server\.listen\(\s*\{ host: "127\.0\.0\.1", port: 0, exclusive: true \}/u,
  );
  assert.match(workspaceRenderer, /hostsToTry: \["127\.0\.0\.1"\]/u);
  assert.match(workspaceRenderer, /HttpServer\.prototype\.listen = function/u);
  assert.match(
    workspaceRenderer,
    /options\?\.host !== "127\.0\.0\.1" \|\| options\.port !== port/u,
  );
  assert.match(workspaceRenderer, /lifecycle\.onListenerClosed\(event\)/u);
  assert.match(workspaceRenderer, /\.onListenerReady\(event\)/u);
  assert.match(
    workspaceRenderer,
    /HttpServer\.prototype\.listen = originalListen/u,
  );
  assert.match(
    workspaceRenderer,
    /toolchain\.portConfig\.getPortConfig = originalPortConfig/u,
  );
  assert.match(workspaceRenderer, /activeBuildSettlement/u);
});
