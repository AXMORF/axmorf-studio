import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import { startWebControlCenter } from "../../packages/studio/src/web/server";

const revisionId = `revision-${"a".repeat(64)}`;
const deliveryBuildId = `delivery-${"b".repeat(64)}`;

const createFixture = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-web-runtime-"));
  const assetsDir = join(rootDir, "package-web");
  const deliveryDir = join(rootDir, "deliveries/story-example");
  await Promise.all([
    mkdir(join(assetsDir, "assets"), { recursive: true }),
    mkdir(deliveryDir, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(
      join(assetsDir, "index.html"),
      '<!doctype html><meta name="axmorf-studio-url" content="__AXMORF_STUDIO_URL__"><div id="root"></div>',
    ),
    writeFile(join(assetsDir, "assets/app.js"), "export const ready = true;"),
    writeFile(join(deliveryDir, "video.mp4"), "verified-video-bytes"),
    writeFile(join(deliveryDir, "cover-4x3.png"), "cover-four-three"),
    writeFile(join(deliveryDir, "cover-3x4.png"), "cover-three-four"),
  ]);
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  return { assetsDir, rootDir };
};

const requestWithHeaders = ({
  url,
  headers,
}: {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}) =>
  new Promise<{
    readonly statusCode: number | undefined;
    readonly headers: Readonly<
      Record<string, string | readonly string[] | undefined>
    >;
    readonly body: string;
  }>((resolve, reject) => {
    const target = new URL(url);
    const outgoing = request(
      {
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () =>
          resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    outgoing.once("error", reject);
    outgoing.end();
  });

test("runtime Web server is loopback-only and serves prebuilt assets with strict request authority", async (context) => {
  const { assetsDir, rootDir } = await createFixture(context);
  const apiRequests: string[] = [];
  const server = await startWebControlCenter({
    rootDir,
    assetsDir,
    port: 0,
    studioUrl: "http://127.0.0.1:43101/",
    api: async ({ method, url, body }) => {
      apiRequests.push(`${method}:${url}:${body ?? ""}`);
      return { statusCode: 200, body: { ok: true } };
    },
    inspectCurrentDelivery: async () => null,
    readCurrentRevision: async () => ({ revisionId }),
  });
  context.after(() => server.close());

  assert.equal(server.url, `http://127.0.0.1:${server.port}/`);
  const index = await fetch(server.url);
  assert.equal(index.status, 200);
  assert.match(await index.text(), /http:\/\/127\.0\.0\.1:43101\//u);
  assert.equal(
    index.headers
      .get("content-security-policy")
      ?.includes("default-src 'self'"),
    true,
  );
  assert.equal(
    index.headers.get("cross-origin-resource-policy"),
    "same-origin",
  );
  assert.equal(index.headers.get("x-content-type-options"), "nosniff");

  const script = await fetch(new URL("assets/app.js", server.url));
  assert.equal(script.status, 200);
  assert.equal(
    script.headers.get("content-type"),
    "text/javascript; charset=utf-8",
  );

  const api = await fetch(new URL("api/settings", server.url), {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      origin: `http://127.0.0.1:${server.port}`,
    },
    body: '{"enabled":true}',
  });
  assert.equal(api.status, 200);
  assert.deepEqual(await api.json(), { ok: true });
  assert.deepEqual(apiRequests, ['PUT:/api/settings:{"enabled":true}']);

  const wrongHost = await requestWithHeaders({
    url: server.url,
    headers: { host: `localhost:${server.port}` },
  });
  assert.equal(wrongHost.statusCode, 421);

  const wrongOrigin = await requestWithHeaders({
    url: server.url,
    headers: {
      host: `127.0.0.1:${server.port}`,
      origin: "http://attacker.invalid",
    },
  });
  assert.equal(wrongOrigin.statusCode, 403);

  const escaped = await fetch(new URL("%5c..%5csecret", server.url));
  assert.equal(escaped.status, 404);
});

test("Delivery media endpoint requires current build identity and supports GET HEAD and one byte range", async (context) => {
  const { assetsDir, rootDir } = await createFixture(context);
  let inspections = 0;
  const server = await startWebControlCenter({
    rootDir,
    assetsDir,
    port: 0,
    api: async () => ({ statusCode: 404, body: { error: "missing" } }),
    inspectCurrentDelivery: async ({ storyId }) => {
      inspections += 1;
      assert.equal(storyId, "story-example");
      return {
        storyId,
        revisionId,
        deliveryBuildId,
        artifacts: {
          video: { sizeBytes: Buffer.byteLength("verified-video-bytes") },
          cover4x3: { sizeBytes: Buffer.byteLength("cover-four-three") },
          cover3x4: { sizeBytes: Buffer.byteLength("cover-three-four") },
        },
      };
    },
    readCurrentRevision: async ({ projectId }) => {
      assert.equal(projectId, "story-example");
      return { revisionId };
    },
  });
  context.after(() => server.close());

  const videoUrl = new URL(
    `api/delivery/story-example/${deliveryBuildId}/video`,
    server.url,
  );
  const video = await fetch(videoUrl);
  assert.equal(video.status, 200);
  assert.equal(video.headers.get("accept-ranges"), "bytes");
  assert.equal(video.headers.get("content-type"), "video/mp4");
  assert.equal(
    video.headers.get("content-disposition"),
    'inline; filename="video.mp4"',
  );
  assert.equal(await video.text(), "verified-video-bytes");

  const head = await fetch(videoUrl, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-length"), "20");
  assert.equal(await head.text(), "");

  const range = await fetch(videoUrl, { headers: { range: "bytes=2-7" } });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get("content-range"), "bytes 2-7/20");
  assert.equal(await range.text(), "rified");

  const invalidRange = await fetch(videoUrl, {
    headers: { range: "bytes=0-1,4-5" },
  });
  assert.equal(invalidRange.status, 416);
  assert.equal(invalidRange.headers.get("content-range"), "bytes */20");

  const cover = await fetch(
    new URL(
      `api/delivery/story-example/${deliveryBuildId}/cover-4x3`,
      server.url,
    ),
  );
  assert.equal(cover.status, 200);
  assert.equal(cover.headers.get("content-type"), "image/png");
  assert.equal(await cover.text(), "cover-four-three");

  const wrongBuild = await fetch(
    new URL(
      `api/delivery/story-example/delivery-${"c".repeat(64)}/video`,
      server.url,
    ),
  );
  assert.equal(wrongBuild.status, 404);

  const arbitraryPath = await fetch(
    new URL(
      `api/delivery/story-example/${deliveryBuildId}/publish.json`,
      server.url,
    ),
  );
  assert.equal(arbitraryPath.status, 404);
  const invalidProject = await fetch(
    new URL(
      `api/delivery/${"a".repeat(97)}/${deliveryBuildId}/video`,
      server.url,
    ),
  );
  assert.equal(invalidProject.status, 404);

  await writeFile(
    join(rootDir, "deliveries/story-example/video.mp4"),
    "drifted-video",
  );
  const driftedMedia = await fetch(videoUrl);
  assert.equal(driftedMedia.status, 404);
  assert.equal(inspections, 7);
});

test("Delivery media endpoint rejects a verified but stale Revision", async (context) => {
  const { assetsDir, rootDir } = await createFixture(context);
  const server = await startWebControlCenter({
    rootDir,
    assetsDir,
    port: 0,
    api: async () => ({ statusCode: 404, body: { error: "missing" } }),
    inspectCurrentDelivery: async () => ({
      storyId: "story-example",
      revisionId,
      deliveryBuildId,
      artifacts: {
        video: { sizeBytes: 20 },
        cover4x3: { sizeBytes: 16 },
        cover3x4: { sizeBytes: 16 },
      },
    }),
    readCurrentRevision: async () => ({
      revisionId: `revision-${"c".repeat(64)}`,
    }),
  });
  context.after(() => server.close());

  const response = await fetch(
    new URL(`api/delivery/story-example/${deliveryBuildId}/video`, server.url),
  );
  assert.equal(response.status, 404);
});
