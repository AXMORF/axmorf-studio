import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildPreviewVideoUrl,
  PreviewCatalogSchema,
  type PreviewCatalog,
} from "../../desktop/contracts/preview";
import {
  DesktopMediaProtocol,
  registerDesktopMediaProtocol,
} from "../../desktop/main/media-protocol";

const revisionId = `revision-${"b".repeat(64)}`;
const deliveryBuildId = `delivery-${"c".repeat(64)}`;

const digest = (bytes: Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const catalogFor = (bytes: Uint8Array): PreviewCatalog =>
  PreviewCatalogSchema.parse({
    schemaVersion: 1,
    contractVersion: "desktop-preview-catalog-v1",
    entries: [
      {
        storyId: "story-one",
        revisionId,
        deliveryBuildId,
        compositionId: "StoryOne",
        title: "Story one",
        width: 1920,
        height: 1080,
        fps: 30,
        frameCount: 60,
        video: { checksum: digest(bytes), sizeBytes: bytes.byteLength },
        timeline: {
          durationInFrames: 60,
          leadInFrames: 0,
          tailFrames: 0,
          narrationStartFrame: 0,
          scenes: [
            {
              kind: "narrated-scene",
              meaningId: "opening",
              label: "Opening",
              startFrame: 0,
              endFrame: 60,
            },
          ],
          narration: [
            {
              kind: "chunk",
              chunkId: "opening-one",
              meaningId: "opening",
              text: "Opening",
              startFrame: 0,
              endFrame: 60,
            },
          ],
          captions: [
            {
              chunkId: "opening-one",
              meaningId: "opening",
              text: "Opening",
              startFrame: 0,
              endFrame: 60,
            },
          ],
        },
      },
    ],
    unavailable: [],
  });

const setup = async (byteLength = 192) => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "axmorf-media-"));
  const delivery = join(repositoryRoot, "deliveries/story-one");
  await mkdir(delivery, { recursive: true });
  const path = join(delivery, "video.mp4");
  const bytes = Uint8Array.from({ length: byteLength }, (_, index) => index);
  await writeFile(path, bytes);
  const catalog = catalogFor(bytes);
  const url = buildPreviewVideoUrl(catalog.entries[0]!);
  const media = new DesktopMediaProtocol();
  await media.selectWorkspace(repositoryRoot);
  await media.replaceCatalog(catalog);
  return { repositoryRoot, path, bytes, catalog, url, media };
};

test("media protocol serves GET/HEAD and open, bounded, and suffix ranges", async (context) => {
  const { repositoryRoot, bytes, url, media } = await setup();
  context.after(async () => {
    await media.close();
    await rm(repositoryRoot, { recursive: true, force: true });
  });

  const full = await media.handleRequest(new Request(url));
  assert.equal(full.status, 200);
  assert.equal(full.headers.get("content-type"), "video/mp4");
  assert.equal(full.headers.get("content-length"), String(bytes.byteLength));
  assert.equal(full.headers.get("accept-ranges"), "bytes");
  assert.deepEqual(new Uint8Array(await full.arrayBuffer()), bytes);

  const head = await media.handleRequest(new Request(url, { method: "HEAD" }));
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("content-length"), String(bytes.byteLength));
  assert.equal((await head.arrayBuffer()).byteLength, 0);

  const partialHead = await media.handleRequest(
    new Request(url, { method: "HEAD", headers: { Range: "bytes=8-15" } }),
  );
  assert.equal(partialHead.status, 206);
  assert.equal(partialHead.headers.get("content-range"), "bytes 8-15/192");
  assert.equal(partialHead.headers.get("content-length"), "8");
  assert.equal((await partialHead.arrayBuffer()).byteLength, 0);

  for (const [header, start, end] of [
    ["bytes=16-31", 16, 31],
    ["bytes=160-", 160, 191],
    ["bytes=-12", 180, 191],
  ] as const) {
    const response = await media.handleRequest(
      new Request(url, { headers: { Range: header } }),
    );
    assert.equal(response.status, 206);
    assert.equal(
      response.headers.get("content-range"),
      `bytes ${start}-${end}/${bytes.byteLength}`,
    );
    assert.equal(
      response.headers.get("content-length"),
      String(end - start + 1),
    );
    assert.deepEqual(
      new Uint8Array(await response.arrayBuffer()),
      bytes.slice(start, end + 1),
    );
  }
});

test("invalid ranges and methods fail closed with exact protocol headers", async (context) => {
  const { repositoryRoot, bytes, url, media } = await setup();
  context.after(async () => {
    await media.close();
    await rm(repositoryRoot, { recursive: true, force: true });
  });

  for (const range of ["bytes=", "bytes=3-2", "bytes=999-", "bytes=1-2,4-5"]) {
    const response = await media.handleRequest(
      new Request(url, { headers: { Range: range } }),
    );
    assert.equal(response.status, 416);
    assert.equal(
      response.headers.get("content-range"),
      `bytes */${bytes.byteLength}`,
    );
    assert.equal(response.headers.get("accept-ranges"), "bytes");
    assert.equal(response.headers.get("content-length"), "0");
  }
  const post = await media.handleRequest(new Request(url, { method: "POST" }));
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, HEAD");
  assert.equal(post.headers.get("content-length"), "0");
  assert.equal(
    (await media.handleRequest(new Request(`${url}?path=/etc/passwd`))).status,
    404,
  );
  assert.equal(
    (
      await media.handleRequest(
        new Request(url.replace("story-one", "..%2Fstory-one")),
      )
    ).status,
    404,
  );
});

test("refresh revokes stale URLs and pinned descriptor rejects atomic replacement", async (context) => {
  const { repositoryRoot, path, bytes, url, media } = await setup();
  context.after(async () => {
    await media.close();
    await rm(repositoryRoot, { recursive: true, force: true });
  });

  const replacement = join(path, "..", "replacement.mp4");
  await writeFile(
    replacement,
    Uint8Array.from(bytes, (value) => 255 - value),
  );
  await rename(replacement, path);
  assert.equal((await media.handleRequest(new Request(url))).status, 409);

  await media.replaceCatalog(
    PreviewCatalogSchema.parse({
      schemaVersion: 1,
      contractVersion: "desktop-preview-catalog-v1",
      entries: [],
      unavailable: [],
    }),
  );
  assert.equal((await media.handleRequest(new Request(url))).status, 404);
});

test("refresh reuses an unchanged ticket while an existing response is streaming", async (context) => {
  const { repositoryRoot, bytes, catalog, url, media } = await setup(
    128 * 1024,
  );
  context.after(async () => {
    await media.close();
    await rm(repositoryRoot, { recursive: true, force: true });
  });

  const response = await media.handleRequest(new Request(url));
  assert.ok(response.body !== null);
  const reader = response.body.getReader();
  const first = await reader.read();
  assert.equal(first.done, false);
  await media.replaceCatalog(catalog);
  const chunks = [first.value!];
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    chunks.push(next.value);
  }
  const streamed = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  assert.deepEqual(streamed, Buffer.from(bytes));
});

test("in-place checksum drift and symlink media are rejected", async (context) => {
  const { repositoryRoot, path, bytes, url, media } = await setup();
  context.after(async () => {
    await media.close();
    await rm(repositoryRoot, { recursive: true, force: true });
  });

  await writeFile(
    path,
    Uint8Array.from(bytes, (value) => value ^ 0xff),
  );
  assert.equal((await media.handleRequest(new Request(url))).status, 409);

  await media.close();
  const target = join(repositoryRoot, "target.mp4");
  await writeFile(target, bytes);
  await writeFile(path, bytes);
  await rename(path, join(repositoryRoot, "old-video.mp4"));
  await symlink(target, path);
  const symlinkMedia = new DesktopMediaProtocol();
  await symlinkMedia.selectWorkspace(repositoryRoot);
  await assert.rejects(() => symlinkMedia.replaceCatalog(catalogFor(bytes)));
  await symlinkMedia.close();
});

test("registration owns only the axmorf-media handler", async () => {
  const media = new DesktopMediaProtocol();
  const events: string[] = [];
  const dispose = registerDesktopMediaProtocol({
    protocol: {
      handle: (scheme) => events.push(`handle:${scheme}`),
      unhandle: (scheme) => events.push(`unhandle:${scheme}`),
    },
    media,
  });
  dispose();
  await media.close();
  assert.deepEqual(events, ["handle:axmorf-media", "unhandle:axmorf-media"]);
});
