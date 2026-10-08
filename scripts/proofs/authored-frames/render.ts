import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { bundle } from "@remotion/bundler";
import {
  ensureBrowser,
  getCompositions,
  openBrowser,
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";

import { serializeCanonicalJson } from "@axmorf/studio/contracts";
import {
  decodeCanonicalPcmWav,
  encodeCanonicalPcmWav,
} from "../../narration/domain/pcm-wav";
import { prepareNarrationInputs } from "../../project-production/application/prepare-fixed-tasks";
import { inspectProjectVideo } from "../../project-production/adapters/media";
import { renderH264AacVideo } from "../../shared/render-h264-aac";
import { resolveMediaToolCommand } from "../../shared/media-tool-command";
import { runMediaProcess } from "../../shared/media-process";
import { measurePcmLag } from "../audio-timing/measure";
import {
  AUTHORED_GROUPED_PULSE_CHECKSUM,
  createAuthoredGroupedRuntimeFixture,
} from "../../../tests/fixtures/scene/authored-grouped";

const rootDir = process.cwd();
const outputDirectory = join(rootDir, "out/authored-frames-proof");
const fixtureRoot = join(outputDirectory, "fixture");
const fixture = createAuthoredGroupedRuntimeFixture();
const checksum = (bytes: Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const execute = promisify(execFile);

const pulsePcm = Buffer.alloc(19_200 * 2);
for (let index = 0; index < 19_200; index += 1) {
  const envelope = Math.min(1, index / 480, (19_199 - index) / 480);
  pulsePcm.writeInt16LE(
    Math.round(
      12_000 * envelope * Math.sin((2 * Math.PI * 440 * index) / 48_000),
    ),
    index * 2,
  );
}
const pulse = encodeCanonicalPcmWav(pulsePcm);
assert.equal(checksum(pulse), AUTHORED_GROUPED_PULSE_CHECKSUM);
const publicDir = join(fixtureRoot, "public");
const pulsePath = join(publicDir, "proofs/authored-frames/pulse.wav");
await mkdir(dirname(pulsePath), { recursive: true });
await writeFile(pulsePath, pulse);
const sourceDirectory = join(
  fixtureRoot,
  "src/projects",
  fixture.projectSource.story.storyId,
);
await mkdir(sourceDirectory, { recursive: true });
for (const name of ["brief", "story", "narration", "render"] as const)
  await writeFile(
    join(sourceDirectory, `${name}.json`),
    `${serializeCanonicalJson(fixture.projectSource[name])}\n`,
  );
const prepared = await prepareNarrationInputs({
  rootDir: fixtureRoot,
  projectId: fixture.projectSource.story.storyId,
  env: {
    RSP_PRODUCER_CONFIG: join(fixtureRoot, "absent-provider-config.json"),
  },
});
assert.equal(prepared.timingSource, "authored-frames");
assert.equal(prepared.sealedNarration, null);
assert.equal(prepared.completeAudioBytes, null);
assert.deepEqual(prepared.actualCost, {
  providerRequests: 0,
  providerCacheHits: 0,
});
assert.equal(
  serializeCanonicalJson(prepared.semanticTiming),
  serializeCanonicalJson(fixture.semanticTiming),
);
assert.deepEqual(await readdir(join(sourceDirectory, "generated")), [
  "semantic-timing.generated.json",
]);
assert.equal(fixture.soundDesign.contributions.length, 1);

const browserStatus = await ensureBrowser({
  browserExecutable: process.env.AXMORF_BROWSER_EXECUTABLE,
  logLevel: "info",
});
if (!("path" in browserStatus))
  throw new Error("Proof browser is unavailable.");
process.stdout.write(
  "Bundling authored-frame grouped runtime proof. Zero provider calls.\n",
);
const serveUrl = await bundle({
  entryPoint: join(rootDir, "proofs/authored-frames/source/index.tsx"),
  rootDir,
  outDir: join(outputDirectory, "bundle"),
  publicDir,
  enableCaching: false,
  webpackOverride: (configuration) => ({
    ...configuration,
    resolve: {
      ...configuration.resolve,
      alias: {
        ...configuration.resolve?.alias,
        "@axmorf/studio/contracts$": join(
          rootDir,
          "packages/studio/src/contracts/index.ts",
        ),
        "@axmorf/studio/remotion$": join(
          rootDir,
          "packages/studio/src/remotion.ts",
        ),
      },
    },
  }),
});
const browser = await openBrowser("chrome", {
  browserExecutable: browserStatus.path,
  logLevel: "error",
});
const checkpointFrames = [0, 59, 60, 119] as const;
const videoPath = join(outputDirectory, "video.mp4");
const sceneMixPath = join(outputDirectory, "scene-mix.wav");
const audioVariants = [
  { audioChannels: 2, silent: false, videoPath, pcmPath: sceneMixPath },
  {
    audioChannels: 1,
    silent: false,
    videoPath: join(outputDirectory, "mono-video.mp4"),
    pcmPath: join(outputDirectory, "mono-mix.wav"),
  },
  {
    audioChannels: 2,
    silent: true,
    videoPath: join(outputDirectory, "silent-video.mp4"),
    pcmPath: join(outputDirectory, "silent-mix.wav"),
  },
  {
    audioChannels: 1,
    silent: true,
    videoPath: join(outputDirectory, "mono-silent-video.mp4"),
    pcmPath: join(outputDirectory, "mono-silent-mix.wav"),
  },
] as const;
try {
  const compositions = await getCompositions(serveUrl, {
    puppeteerInstance: browser,
    logLevel: "error",
  });
  const composition = compositions.find(
    ({ id }) => id === "AuthoredGroupedProof",
  );
  assert.ok(composition);
  assert.equal(composition.durationInFrames, 120);
  const silentComposition = await selectComposition({
    serveUrl,
    id: composition.id,
    inputProps: { silent: true },
    puppeteerInstance: browser,
    logLevel: "error",
  });
  for (const frame of checkpointFrames)
    await renderStill({
      serveUrl,
      composition,
      output: join(outputDirectory, `frame-${frame}.png`),
      frame,
      imageFormat: "png",
      puppeteerInstance: browser,
      logLevel: "error",
    });
  process.stdout.write(
    "Rendering all 120 frames and the single boundary-crossing pulse.\n",
  );
  for (const variant of audioVariants)
    await renderH264AacVideo({
      rootDir,
      outputPath: variant.videoPath,
      audioChannels: variant.audioChannels,
      render: async ({ videoPath: separatedVideo, pcmPath, options }) => {
        await renderMedia({
          serveUrl,
          composition: variant.silent ? silentComposition : composition,
          inputProps: { silent: variant.silent },
          outputLocation: separatedVideo,
          ...options,
          separateAudioTo: pcmPath,
          concurrency: 2,
          puppeteerInstance: browser,
          logLevel: "error",
        });
        await copyFile(pcmPath, variant.pcmPath);
      },
    });
} finally {
  await browser.close({ silent: true });
}

const media = await inspectProjectVideo({
  rootDir,
  absolutePath: videoPath,
  render: fixture.projectSource.render,
  frameCount: 120,
});
const runFfmpeg = async (args: readonly string[]) => {
  return (
    await execute("ffmpeg", [...args], {
      encoding: "buffer",
      maxBuffer: 8_000_000,
    })
  ).stdout;
};
const checkpoints = [];
for (const frame of checkpointFrames) {
  const pixels = await runFfmpeg([
    "-v",
    "error",
    "-i",
    join(outputDirectory, `frame-${frame}.png`),
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "-",
  ]);
  let sumX = 0;
  let count = 0;
  for (let offset = 0; offset < pixels.length; offset += 3) {
    if (
      pixels[offset] < 20 &&
      pixels[offset + 1] > 190 &&
      pixels[offset + 2] > 170
    ) {
      sumX += (offset / 3) % 640;
      count += 1;
    }
  }
  assert.ok(count > 400, "The shared Scene subject must remain visible.");
  checkpoints.push({ frame, subjectCenterX: sumX / count });
}
const step =
  (checkpoints[3].subjectCenterX - checkpoints[0].subjectCenterX) / 119;
assert.ok(step > 3);
for (const checkpoint of checkpoints)
  assert.ok(
    Math.abs(
      checkpoint.subjectCenterX -
        checkpoints[0].subjectCenterX -
        checkpoint.frame * step,
    ) < 1,
    "The Scene clock must remain continuous across the Beat boundary.",
  );

const runWorkspaceTool = async (
  tool: "ffmpeg" | "ffprobe",
  args: readonly string[],
) => {
  const command = await resolveMediaToolCommand({ rootDir, tool, args });
  const result = await runMediaProcess(command.command, command.args, {
    cwd: rootDir,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};
const decodeMono = async (path: string, output: string) => {
  const decodedPath = join(outputDirectory, output);
  await runWorkspaceTool("ffmpeg", [
    "-v",
    "error",
    "-i",
    path,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "48000",
    "-c:a",
    "pcm_s16le",
    "-y",
    decodedPath,
  ]);
  return decodeCanonicalPcmWav(await readFile(decodedPath)).rawPcm;
};
const inspectPulse = (decodedAudio: Buffer) => {
  let firstActive = -1;
  let lastActive = -1;
  let peak = 0;
  for (let offset = 0; offset < decodedAudio.length; offset += 2) {
    const amplitude = Math.abs(decodedAudio.readInt16LE(offset));
    peak = Math.max(peak, amplitude);
    if (amplitude > 500) {
      firstActive = firstActive === -1 ? offset / 2 : firstActive;
      lastActive = offset / 2;
    }
  }
  assert.ok(
    peak > 1_000 && peak < 8_000,
    "The Scene pulse must be audible without duplicate mixing.",
  );
  return {
    firstActiveSeconds: firstActive / 48_000,
    lastActiveSeconds: lastActive / 48_000,
    peak,
  };
};
const pcmAudio = await decodeMono(sceneMixPath, "pcm-decoded.wav");
const aacAudio = await decodeMono(videoPath, "aac-decoded.wav");
const pcmPulse = inspectPulse(pcmAudio);
const aacPulse = inspectPulse(aacAudio);
assert.ok(
  pcmPulse.firstActiveSeconds >= 1.8 && pcmPulse.firstActiveSeconds < 1.81,
);
assert.ok(
  pcmPulse.lastActiveSeconds > 2.19 && pcmPulse.lastActiveSeconds <= 2.2,
);
const waveform = measurePcmLag({
  reference: pcmAudio,
  decoded: aacAudio,
  startSample: 85_000,
  endSample: 106_000,
  maxLagSamples: 3_000,
});
assert.equal(
  waveform.lagSamples,
  0,
  "Decoded AAC must preserve the PCM sample clock.",
);
assert.ok(waveform.correlation > 0.999);
for (const field of ["firstActiveSeconds", "lastActiveSeconds"] as const)
  assert.ok(
    Math.abs(aacPulse[field] - pcmPulse[field]) <= 1 / 48_000,
    "AAC playback must preserve pulse edges to within one sample.",
  );
const audioPacket = JSON.parse(
  await runWorkspaceTool("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "a:0",
    "-read_intervals",
    "%+#1",
    "-show_packets",
    "-of",
    "json",
    videoPath,
  ]),
) as {
  packets: {
    pts: number;
    side_data_list?: { side_data_type: string; skip_samples: number }[];
  }[];
};
const firstAudioPacket = audioPacket.packets[0];
const primingSamples = firstAudioPacket.side_data_list?.find(
  ({ side_data_type }) => side_data_type === "Skip Samples",
)?.skip_samples;
const audioMatrix = [];
for (const [index, variant] of audioVariants.entries()) {
  const variantMedia = await inspectProjectVideo({
    rootDir,
    absolutePath: variant.videoPath,
    render: {
      ...fixture.projectSource.render,
      output: {
        ...fixture.projectSource.render.output,
        audioChannels: variant.audioChannels,
      },
    },
    frameCount: 120,
  });
  const reference = await decodeMono(
    variant.pcmPath,
    `matrix-${index}-pcm.wav`,
  );
  const decoded = await decodeMono(
    variant.videoPath,
    `matrix-${index}-aac.wav`,
  );
  if (variant.silent) {
    assert.ok(reference.every((value) => value === 0));
    assert.ok(decoded.every((value) => value === 0));
    audioMatrix.push({
      audioChannels: variant.audioChannels,
      silent: true,
      media: variantMedia,
      decodedPeak: 0,
    });
  } else {
    const lag = measurePcmLag({
      reference,
      decoded,
      startSample: 85_000,
      endSample: 106_000,
      maxLagSamples: 3_000,
    });
    assert.equal(lag.lagSamples, 0, JSON.stringify(lag));
    assert.ok(lag.correlation > 0.999, JSON.stringify(lag));
    audioMatrix.push({
      audioChannels: variant.audioChannels,
      silent: false,
      media: variantMedia,
      ...lag,
    });
  }
}
const evidence = {
  schemaVersion: 1,
  timingSource: "authored-frames",
  semanticTimingFingerprint: fixture.semanticTiming.fingerprint,
  providerRequests: 0,
  sealedNarration: null,
  masteredNarration: null,
  captionCount: 0,
  semanticBeatCount: fixture.semanticTiming.storyBeats.length,
  sceneOwnerCount: 1,
  soundContributionCount: fixture.soundDesign.contributions.length,
  media,
  audioMatrix,
  rasterInspectionTool: (await execute("ffmpeg", ["-version"])).stdout.split(
    "\n",
  )[0],
  audioInspectionTool: (await runWorkspaceTool("ffmpeg", ["-version"])).split(
    "\n",
  )[0],
  videoChecksum: checksum(await readFile(videoPath)),
  checkpoints,
  pulse: {
    startFrame: 54,
    endFrame: 66,
    pcm: pcmPulse,
    aac: aacPulse,
    decodedLagSamples: waveform.lagSamples,
    correlation: waveform.correlation,
    firstAudioPacketPts: firstAudioPacket.pts,
    aacPrimingSamples: primingSamples,
  },
};
await writeFile(
  join(outputDirectory, "evidence.json"),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
