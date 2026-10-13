import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { validateRasterImageBytes } from "../../scripts/project-assets/adapters/raster-decoder";
import { inspectImageBytes } from "../../scripts/project-assets/domain/image";

const rootDir = join(import.meta.dirname, "../..");
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test("installed Workspace FFmpeg decodes one complete static PNG frame", async () => {
  await validateRasterImageBytes({
    rootDir,
    bytes: PNG,
    image: inspectImageBytes(PNG),
  });
});

test("valid image headers cannot stand in for decodable PNG, JPEG or WebP pixels", async () => {
  const png = Buffer.from(PNG);
  png[41] = 0;
  const jpeg = Buffer.from([
    0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0, 0xff, 0xd9,
  ]);
  const webp = Buffer.alloc(30);
  webp.write("RIFF", 0);
  webp.writeUInt32LE(22, 4);
  webp.write("WEBPVP8 ", 8);
  webp.writeUInt32LE(10, 16);
  webp.set([0x9d, 1, 0x2a], 23);
  webp.writeUInt16LE(1, 26);
  webp.writeUInt16LE(1, 28);
  for (const bytes of [png, jpeg, webp]) {
    const image = inspectImageBytes(bytes);
    assert.equal(image.width, 1);
    assert.equal(image.height, 1);
    await assert.rejects(
      () => validateRasterImageBytes({ rootDir, bytes, image }),
      /pixel decoding failed|no complete pixel scan|no pixel payload/u,
      image.mimeType,
    );
  }
});

test("truncated containers are rejected even if a decoder could recover some pixels", async () => {
  const bytes = PNG.subarray(0, PNG.length - 12);
  await assert.rejects(
    () =>
      validateRasterImageBytes({
        rootDir,
        bytes,
        image: inspectImageBytes(bytes),
        runProcess: async () => {
          assert.fail("Incomplete containers must not reach the decoder.");
        },
      }),
    /container is incomplete/u,
  );
});

test("decoder success must include exactly one whole decoded frame", async () => {
  for (const sizes of [[], [2], [4, 4]]) {
    await assert.rejects(
      () =>
        validateRasterImageBytes({
          rootDir,
          bytes: PNG,
          image: inspectImageBytes(PNG),
          runProcess: async (_command, args) => {
            for (const [index, size] of sizes.entries()) {
              await writeFile(
                args
                  .at(-1)!
                  .replace("%02d", String(index + 1).padStart(2, "0")),
                Buffer.alloc(size),
              );
            }
            return { status: 0, stdout: "", stderr: "" };
          },
        }),
      /complete frame/u,
    );
  }
});
