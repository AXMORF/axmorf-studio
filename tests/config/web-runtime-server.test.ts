import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rm,
  truncate,
  writeFile,
} from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { startWebControlCenter } from "../../packages/studio/src/web/server";

const FILM_ID = "film-example";

/** publish.json is the delivery authority: the server only serves files of the recorded size. */
const writePublish = async (
  rootDir: string,
  sizes: Readonly<{ video: number; cover4x3: number; cover3x4: number }>,
) => {
  const file = (name: string, size: number) => ({
    path: `deliveries/${FILM_ID}/${name}`,
    checksum: `sha256:${"a".repeat(64)}`,
    size,
  });
  await writeFile(
    join(rootDir, "deliveries", FILM_ID, "publish.json"),
    JSON.stringify({
      schemaVersion: 1,
      filmId: FILM_ID,
      title: "Example",
      description: "",
      tags: [],
      durationInFrames: 30,
      fps: 30,
      width: 1080,
      height: 1920,
      deliveredAt: "2026-10-18T00:00:00.000Z",
      files: {
        video: file("video.mp4", sizes.video),
        cover4x3: file("cover-4x3.png", sizes.cover4x3),
        cover3x4: file("cover-3x4.png", sizes.cover3x4),
      },
      attributions: [],
    }),
  );
};

const createFixture = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-web-runtime-"));
  const assetsDir = join(rootDir, "package-web");
  const deliveryDir = join(rootDir, "deliveries", FILM_ID);
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

const countOpenDescriptors = async (absolutePath: string) => {
  if (process.platform !== "linux") return null;
  const descriptors = await readdir("/proc/self/fd");
  const targets = await Promise.all(
    descriptors.map(async (descriptor) => {
      try {
        return await readlink(`/proc/self/fd/${descriptor}`);
      } catch {
        return null;
      }
    }),
  );
  return targets.filter((target) => target === absolutePath).length;
};

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

test("Delivery media endpoint serves the files publish.json records, with GET HEAD and one byte range", async (context) => {
  const { assetsDir, rootDir } = await createFixture(context);
  await writePublish(rootDir, {
    video: Buffer.byteLength("verified-video-bytes"),
    cover4x3: Buffer.byteLength("cover-four-three"),
    cover3x4: Buffer.byteLength("cover-three-four"),
  });
  const server = await startWebControlCenter({
    rootDir,
    assetsDir,
    port: 0,
    api: async () => ({ statusCode: 404, body: { error: "missing" } }),
  });
  context.after(() => server.close());

  const videoUrl = new URL(`api/films/${FILM_ID}/video`, server.url);
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
    new URL(`api/films/${FILM_ID}/cover-4x3`, server.url),
  );
  assert.equal(cover.status, 200);
  assert.equal(cover.headers.get("content-type"), "image/png");
  assert.equal(await cover.text(), "cover-four-three");

  const cacheBusted = await fetch(
    new URL(`api/films/${FILM_ID}/cover-3x4?at=2026`, server.url),
  );
  assert.equal(await cacheBusted.text(), "cover-three-four");

  const arbitraryPath = await fetch(
    new URL(`api/films/${FILM_ID}/publish.json`, server.url),
  );
  assert.equal(arbitraryPath.status, 404);
  const invalidFilm = await fetch(
    new URL(`api/films/${"a".repeat(97)}/video`, server.url),
  );
  assert.equal(invalidFilm.status, 404);
  const undelivered = await fetch(
    new URL("api/films/other-film/video", server.url),
  );
  assert.equal(undelivered.status, 404);

  await writeFile(
    join(rootDir, "deliveries", FILM_ID, "video.mp4"),
    "drifted-video",
  );
  const driftedMedia = await fetch(videoUrl);
  assert.equal(driftedMedia.status, 404);
});

test("Delivery media rejects a publish.json that names another film", async (context) => {
  const { assetsDir, rootDir } = await createFixture(context);
  await writePublish(rootDir, { video: 20, cover4x3: 16, cover3x4: 16 });
  const publishPath = join(rootDir, "deliveries", FILM_ID, "publish.json");
  const publish = JSON.parse(await readFile(publishPath, "utf8"));
  await writeFile(
    publishPath,
    JSON.stringify({ ...publish, filmId: "another-film" }),
  );
  const server = await startWebControlCenter({
    rootDir,
    assetsDir,
    port: 0,
    api: async () => ({ statusCode: 404, body: { error: "missing" } }),
  });
  context.after(() => server.close());

  const response = await fetch(
    new URL(`api/films/${FILM_ID}/video`, server.url),
  );
  assert.equal(response.status, 404);
});

test("Delivery media closes its file when the client aborts a response", async (context) => {
  const { assetsDir, rootDir } = await createFixture(context);
  const videoPath = join(rootDir, "deliveries", FILM_ID, "video.mp4");
  const videoSize = 64 * 1024 * 1024;
  await truncate(videoPath, videoSize);
  await writePublish(rootDir, { video: videoSize, cover4x3: 16, cover3x4: 16 });
  const server = await startWebControlCenter({
    rootDir,
    assetsDir,
    port: 0,
    api: async () => ({ statusCode: 404, body: { error: "missing" } }),
  });
  context.after(() => server.close());

  await new Promise<void>((resolve, reject) => {
    const outgoing = request(
      new URL(`api/films/${FILM_ID}/video`, server.url),
      (response) => {
        response.once("data", () => response.destroy());
        response.once("close", resolve);
      },
    );
    outgoing.once("error", reject);
    outgoing.end();
  });

  let openDescriptors = await countOpenDescriptors(videoPath);
  for (
    let attempt = 0;
    openDescriptors !== null && attempt < 20;
    attempt += 1
  ) {
    if (openDescriptors === 0) break;
    await delay(10);
    openDescriptors = await countOpenDescriptors(videoPath);
  }
  if (openDescriptors !== null) assert.equal(openDescriptors, 0);
});
