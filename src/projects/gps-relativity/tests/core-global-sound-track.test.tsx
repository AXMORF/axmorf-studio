import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import test from "node:test";

import { GlobalSoundTrack } from "../../../remotion/runtime/global-sound";
import { gpsRelativityFinalAssemblyData } from "../final-assembly-data";

test("FinalSoundProjection binds M7 sound identity without copying Scene cues", () => {
  const { finalSound } = gpsRelativityFinalAssemblyData;
  assert.equal(
    finalSound.projection.soundDesignProjectionFingerprint,
    gpsRelativityFinalAssemblyData.sceneSoundProjectionFingerprint,
  );
  assert.equal("contributions" in finalSound.projection, false);
  assert.equal("meaningId" in finalSound.projection, false);
  assert.equal(finalSound.plan.assets.length, 2);
});

test("GlobalSoundTrack mounts exactly two local frame-volume buses", () => {
  const element = GlobalSoundTrack({
    resolved: gpsRelativityFinalAssemblyData.finalSound,
  });
  assert.ok(isValidElement<{ children?: unknown }>(element));
  assert.equal(Children.toArray(element.props.children as ReactNode).length, 2);
});

test("global buses use the exact current-frame duck envelope at production boundaries", () => {
  const element = GlobalSoundTrack({
    resolved: gpsRelativityFinalAssemblyData.finalSound,
  });
  assert.ok(isValidElement<{ children?: unknown }>(element));
  const buses = Children.toArray(
    element.props.children as ReactNode,
  ) as ReactElement<{
    volume: (frame: number) => number;
  }>[];
  const ambienceVolume = buses[0]?.props.volume;
  const bgmVolume = buses[1]?.props.volume;
  assert.ok(ambienceVolume);
  assert.ok(bgmVolume);

  assert.equal(bgmVolume(0), 0.22);
  assert.equal(bgmVolume(15), 0.22 * 0.32);
  assert.equal(bgmVolume(155), 0.22 * 0.32);
  assert.ok(
    Math.abs(bgmVolume(691) - 0.22 * (0.32 + (4 / 15) * 0.68)) < Number.EPSILON,
  );
  assert.equal(bgmVolume(696), 0.22 * 0.32);
  assert.ok(
    Math.abs(bgmVolume(1730) - 0.22 * (0.32 + (14 / 15) * 0.68)) <
      Number.EPSILON,
  );
  assert.equal(ambienceVolume(15), 0.18 * 0.32);
  assert.throws(() => bgmVolume(-1));
  assert.throws(() => bgmVolume(1731));
});

test("global sound runtime excludes adaptive DSP network and directory discovery", async () => {
  const source = await readFile(
    new URL(
      "../../../remotion/runtime/global-sound/GlobalSoundTrack.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /volume=\{\(frame\) =>/);
  assert.doesNotMatch(
    source,
    /loudnorm|compressor|limiter|fetch\s*\(|https?:|node:fs|readdir\s*\(|\bglob\s*\(|import\s*\(/,
  );
});
