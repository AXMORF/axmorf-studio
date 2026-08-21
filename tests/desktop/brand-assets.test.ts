import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { AXMORF_MARK_PATHS } from "../../src/remotion/runtime/axmorf-brand/AxmorfMark";

test("desktop brand assets are generated from the canonical AXMORF geometry", async () => {
  const root = join(process.cwd(), "desktop/resources/brand");
  const [svg, png, icns] = await Promise.all([
    readFile(join(root, "axmorf-studio-icon.svg"), "utf8"),
    readFile(join(root, "axmorf-studio-icon.png")),
    readFile(join(root, "axmorf-studio-icon.icns")),
  ]);
  for (const path of AXMORF_MARK_PATHS) assert.match(svg, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.equal((svg.match(/<path /gu) ?? []).length, AXMORF_MARK_PATHS.length);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 1024);
  assert.equal(png.readUInt32BE(20), 1024);
  assert.equal(icns.subarray(0, 4).toString("ascii"), "icns");
  assert.equal(icns.readUInt32BE(4), icns.length);
  assert.match(icns.toString("latin1"), /ic07/u);
  assert.match(icns.toString("latin1"), /ic10/u);
});
