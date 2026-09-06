import { waitForFixtureReady, stopFixture } from "./process-fixture";
import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  browserPreparationNodeArgs,
  inspectInstalledBrowser,
  verifyWorkspaceBrowser,
} from "../../packages/studio/src/bootstrap/workspace-browser";

test("browser inspection refuses an absent browser without starting a download", async () => {
  const root = await mkdtemp(join(tmpdir(), "axmorf-browser-"));
  try {
    const renderer = join(root, "node_modules/@remotion/renderer");
    await mkdir(renderer, { recursive: true });
    await writeFile(join(root, "package.json"), "{}");
    await writeFile(join(renderer, "package.json"), '{"main":"index.js"}');
    await writeFile(
      join(renderer, "index.js"),
      'exports.ensureBrowser=async(o)=>{o.onBrowserDownload({chromeMode:"headless-shell"});throw new Error("DOWNLOAD STARTED")};',
    );
    await assert.rejects(inspectInstalledBrowser(root), (error: Error) => {
      assert.match(error.message, /npm run browser:prepare/u);
      assert.doesNotMatch(error.message, /DOWNLOAD STARTED/u);
      return true;
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("concurrent readiness calls share one probe and never download a missing browser", async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "axmorf-browser-single-")),
  );
  try {
    const renderer = join(root, "node_modules/@remotion/renderer");
    await mkdir(renderer, { recursive: true });
    await writeFile(join(root, "package.json"), "{}");
    await writeFile(join(renderer, "package.json"), '{"main":"index.js"}');
    await writeFile(
      join(renderer, "index.js"),
      `exports.ensureBrowser=async(o)=>{require('node:fs').appendFileSync('probes.log','probe\\n');o.onBrowserDownload({chromeMode:'headless-shell'});require('node:fs').writeFileSync('download.log','unexpected');};`,
    );
    const resources = {
      remotionPreflightEntry: "unused",
    } as import("../../packages/studio/src/runtime/runtime-resources").RuntimeResources;
    const first = verifyWorkspaceBrowser(root, resources);
    const second = verifyWorkspaceBrowser(root, resources);
    assert.equal(first, second);
    const results = await Promise.allSettled([first, second]);
    assert.ok(results.every(({ status }) => status === "rejected"));
    assert.equal(await readFile(join(root, "probes.log"), "utf8"), "probe\n");
    await assert.rejects(readFile(join(root, "download.log")), /ENOENT/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("controlled browser preparation interruption releases the exclusive lock", async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "axmorf-browser-interrupt-")),
  );
  const { spawn } = await import("node:child_process");
  let child: ReturnType<typeof spawn> | undefined;
  let completion: Promise<number | null> | undefined;
  try {
    const cli = join(root, "node_modules/@remotion/cli");
    const ready = join(root, "ready");
    await mkdir(cli, { recursive: true });
    await writeFile(join(root, "package.json"), "{}");
    await writeFile(
      join(cli, "package.json"),
      '{"name":"@remotion/cli","bin":{"remotion":"remotion-cli.js"}}',
    );
    await writeFile(
      join(cli, "remotion-cli.js"),
      `require('node:fs').writeFileSync(${JSON.stringify(ready)},'ready');setInterval(()=>{},1000);`,
    );
    const source = new URL(
      "../../packages/studio/src/bootstrap/workspace-browser.ts",
      import.meta.url,
    ).href;
    const script = `import {prepareWorkspaceBrowser} from ${JSON.stringify(source)};try{await prepareWorkspaceBrowser(${JSON.stringify(root)});}catch(error){process.stderr.write(error.message);}`;
    child = spawn(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    child.stderr!.on("data", (bytes) => {
      stderr += String(bytes);
    });
    completion = new Promise<number | null>((resolve, reject) => {
      child!.once("error", reject);
      child!.once("close", resolve);
    });
    await waitForFixtureReady({
      readyPath: ready,
      completion,
      diagnostics: () => stderr,
    });
    await readFile(join(root, ".axmorf-browser-prepare.lock"));
    child.kill("SIGTERM");
    assert.equal(await completion, 0);
    assert.match(stderr, /interrupted by SIGTERM/u);
    await assert.rejects(
      readFile(join(root, ".axmorf-browser-prepare.lock")),
      /ENOENT/u,
    );
  } finally {
    if (child !== undefined && completion !== undefined)
      await stopFixture(child, completion);
    await rm(root, { recursive: true, force: true });
  }
});

test("browser preparation selects native proxy support without exposing proxy credentials", () => {
  const proxy = "http://user:secret@127.0.0.1:8080";
  for (const name of [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "http_proxy",
    "https_proxy",
  ]) {
    assert.deepEqual(browserPreparationNodeArgs({ [name]: proxy }, true), [
      "--use-env-proxy",
    ]);
    assert.throws(
      () => browserPreparationNodeArgs({ [name]: proxy }, false),
      (error: Error) => {
        assert.match(error.message, /Upgrade.*--use-env-proxy/u);
        assert.doesNotMatch(error.message, /user|secret|127\.0/u);
        return true;
      },
    );
  }
  assert.deepEqual(browserPreparationNodeArgs({}, false), []);
  assert.deepEqual(browserPreparationNodeArgs({ HTTP_PROXY: "  " }, false), []);
  assert.deepEqual(
    browserPreparationNodeArgs(
      { HTTPS_PROXY: proxy, NODE_USE_ENV_PROXY: "0" },
      false,
    ),
    [],
  );
  assert.deepEqual(
    browserPreparationNodeArgs(
      { HTTPS_PROXY: proxy, NODE_USE_ENV_PROXY: "0" },
      true,
    ),
    [],
  );
});

for (const proxyMode of ["1", "0"]) {
  test(`browser ensure launcher applies native proxy mode ${proxyMode} only to its child`, async () => {
    const root = await realpath(
      await mkdtemp(join(tmpdir(), "axmorf-browser-proxy-")),
    );
    const { spawn } = await import("node:child_process");
    try {
      const cli = join(root, "node_modules/@remotion/cli");
      await mkdir(cli, { recursive: true });
      await writeFile(join(root, "package.json"), "{}");
      await writeFile(
        join(cli, "package.json"),
        '{"name":"@remotion/cli","bin":{"remotion":"remotion-cli.js"}}',
      );
      await writeFile(
        join(cli, "remotion-cli.js"),
        `require('node:fs').writeFileSync('launcher.json',JSON.stringify({nodeArgs:process.execArgv,args:process.argv.slice(2)}));process.exit(1);`,
      );
      const source = new URL(
        "../../packages/studio/src/bootstrap/workspace-browser.ts",
        import.meta.url,
      ).href;
      const script = `import {prepareWorkspaceBrowser} from ${JSON.stringify(source)};try{await prepareWorkspaceBrowser(${JSON.stringify(root)});}catch(error){process.stderr.write(error.message);}`;
      const child = spawn(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "-e", script],
        {
          env: {
            ...process.env,
            HTTP_PROXY: "http://127.0.0.1:9",
            HTTPS_PROXY: "http://127.0.0.1:9",
            http_proxy: "http://127.0.0.1:9",
            https_proxy: "http://127.0.0.1:9",
            NODE_USE_ENV_PROXY: proxyMode,
          },
          stdio: ["ignore", "ignore", "pipe"],
        },
      );
      let stderr = "";
      child.stderr.on("data", (bytes) => {
        stderr += String(bytes);
      });
      const timer = setTimeout(() => child.kill("SIGKILL"), 2000);
      try {
        const code = await new Promise<number | null>((resolve, reject) => {
          child.once("error", reject);
          child.once("close", resolve);
        });
        assert.equal(code, 0, stderr);
      } finally {
        clearTimeout(timer);
      }
      if (
        proxyMode === "1" &&
        !process.allowedNodeEnvironmentFlags.has("--use-env-proxy")
      ) {
        assert.match(stderr, /Upgrade.*--use-env-proxy/u);
        await assert.rejects(readFile(join(root, "launcher.json")), /ENOENT/u);
      } else {
        const recorded = JSON.parse(
          await readFile(join(root, "launcher.json"), "utf8"),
        ) as { nodeArgs: string[]; args: string[] };
        assert.deepEqual(
          recorded.nodeArgs,
          proxyMode === "1" ? ["--use-env-proxy"] : [],
        );
        assert.deepEqual(recorded.args, ["browser", "ensure"]);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

test("browser preparation preserves an explicit native proxy opt-out in NODE_OPTIONS", () => {
  for (const options of [
    "--no-use-env-proxy",
    '--trace-warnings "--no-use-env-proxy"',
    "'--no-use-env-proxy' --trace-warnings",
  ]) {
    assert.deepEqual(
      browserPreparationNodeArgs(
        { HTTPS_PROXY: "http://127.0.0.1:9", NODE_OPTIONS: options },
        false,
      ),
      [],
    );
  }
  assert.deepEqual(
    browserPreparationNodeArgs(
      {
        HTTPS_PROXY: "http://127.0.0.1:9",
        NODE_OPTIONS: '--title="--no-use-env-proxy"',
      },
      true,
    ),
    ["--use-env-proxy"],
  );
});
