/** Host-only Chromium regression. Run after `npm run packages:build && npm run build`:
 * node --import tsx scripts/tests/check-recipe-pixels.ts
 * Two independent Chromium renders at 1920×1080 must produce identical PNGs.
 * Full PNG byte equality is stronger than pixel equality (no metadata ignored). */
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { getCompositions, renderStill } from "@remotion/renderer";
const scratch = await mkdtemp(join(tmpdir(), "axmorf-recipe-pixels-"));
try {
  const serveUrl = resolve("build");
  const browserExecutable = process.env.AXMORF_BROWSER_EXECUTABLE?.trim();
  const compositions = await getCompositions(serveUrl, { browserExecutable });
  const results = [];
  for (const id of ["Recipe-AxiomMorph", "Recipe-ParticleField"]) {
    const composition = compositions.find((c) => c.id === id);
    assert.ok(composition, `Missing ${id}`);
    // Travel and settled states: shards/particles must be present in the moving frame.
    for (const frame of [40, 100]) {
      const pixels: Buffer[] = [];
      for (const pass of [0, 1]) {
        const output = join(scratch, `${id}-${frame}-${pass}.png`);
        await renderStill({
          serveUrl,
          composition,
          frame,
          output,
          imageFormat: "png",
          browserExecutable,
        });
        const png = await readFile(output);
        assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
        assert.equal(png.readUInt32BE(16), 1920);
        assert.equal(png.readUInt32BE(20), 1080);
        pixels.push(png);
      }
      assert.deepEqual(
        pixels[0],
        pixels[1],
        `${id} frame ${frame}: PNG mismatch (pixel equality not established)`,
      );
      results.push({
        id,
        frame,
        width: 1920,
        height: 1080,
        equal: true,
        identicalPngBytes: pixels[0].length,
      });
      console.log(
        `${id} frame ${frame}: identical PNG bytes; all pixels equal`,
      );
    }
  }
  if (process.argv[2])
    await writeFile(process.argv[2], JSON.stringify(results, null, 2) + "\n");
} finally {
  await rm(scratch, { recursive: true, force: true });
}
