import process from "node:process";
import console from "node:console";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderFrames, selectComposition } from "@remotion/renderer";

const [timingPath, outputDir] = process.argv.slice(2);
assert(timingPath && outputDir);
const timing = JSON.parse(await fs.readFile(timingPath, "utf8"));
const captions = timing.captionCues.map((cue) => cue.text);
assert.equal(captions.length, 26);
await fs.mkdir(outputDir, { recursive: true });
const serveUrl = await bundle({
  entryPoint: path.resolve("proofs/caption-wrap-regression/index.tsx"),
  outDir: path.join(outputDir, "bundle"),
});
const browserExecutable = process.env.AXMORF_BROWSER_EXECUTABLE;
const records = {};
for (const balanced of [false, true]) {
  const inputProps = { captions, balanced };
  const composition = await selectComposition({
    serveUrl,
    id: "CaptionWrapRegression",
    inputProps,
    browserExecutable,
  });
  const rows = new Map();
  await renderFrames({
    serveUrl,
    composition,
    inputProps,
    outputDir: path.join(outputDir, balanced ? "balanced" : "before"),
    imageFormat: "png",
    concurrency: 1,
    browserExecutable,
    onStart: () => {},
    onFrameUpdate: () => {},
    onBrowserLog: (log) => {
      if (log.text.startsWith("CAPTION_LAYOUT:")) {
        const row = JSON.parse(log.text.slice(15));
        rows.set(row.frame, row);
      }
    },
  });
  const values = [...rows.values()].sort((a, b) => a.frame - b.frame);
  assert.equal(values.length, 26, "Every cue must be measured in Chromium");
  const orphans = values.filter(
    (row) =>
      row.lines.length > 1 &&
      (row.lines.at(-1).match(/\p{Script=Han}/gu) ?? []).length === 1,
  );
  records[balanced ? "balanced" : "before"] = { rows: values, orphans };
  if (balanced) {
    assert.equal(orphans.length, 0, "No one-Han-character final line");
    for (const row of values) {
      assert(row.lines.length <= 2, "Caption line budget unchanged");
      assert.equal(row.fontSize, "40px", "Do not shrink captions");
      assert(
        row.rect.left >= 90 && row.rect.right <= 990 && row.rect.bottom <= 1740,
        "Caption remains inside the shared safe area",
      );
    }
  }
}
assert(
  records.before.orphans.length > 0,
  "Reproduce the actual orphan before balancing",
);
await fs.writeFile(
  path.join(outputDir, "caption-wrap-measurements.json"),
  JSON.stringify(records, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    cues: 26,
    beforeOrphans: records.before.orphans.length,
    afterOrphans: records.balanced.orphans.length,
    fontSize: "40px",
    maxLines: 2,
  }),
);
