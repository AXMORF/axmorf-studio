import assert from "node:assert/strict";
import {
  copyFile,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  decodeCanonicalPcmWav,
  encodeCanonicalPcmWav,
} from "../../scripts/narration/domain/pcm-wav";
import { measurePcmLag } from "../../scripts/proofs/audio-timing/measure";
import { resolveMediaToolCommand } from "../../scripts/shared/media-tool-command";
import { runMediaProcess } from "../../scripts/shared/media-process";
import { renderH264AacVideo } from "../../scripts/shared/render-h264-aac";

test("H.264/AAC rendering keeps the previous output on render, mux, or unsafe-media failure", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "axmorf-audio-failure-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const outputPath = join(directory, "video.mp4");
  await writeFile(outputPath, "previous verified media");
  for (const failure of ["render", "unsafe-pcm", "mux", "empty-mux"] as const) {
    let muxes = 0;
    await assert.rejects(
      renderH264AacVideo({
        rootDir: directory,
        outputPath,
        audioChannels: 2,
        render: async ({ videoPath, pcmPath, options }) => {
          assert.deepEqual(options, {
            codec: "h264",
            pixelFormat: "yuv420p",
            audioCodec: "pcm-16",
            sampleRate: 48_000,
            enforceAudioTrack: true,
            disallowParallelEncoding: true,
          });
          await writeFile(videoPath, "h264");
          if (failure === "render") throw new Error("render fixture failure");
          if (failure === "unsafe-pcm") await symlink(outputPath, pcmPath);
          else await writeFile(pcmPath, "PCM");
        },
        resolveMediaTool: async ({ args }) => ({
          command: "ffmpeg-fixture",
          args,
        }),
        runProcess: async (_command, args) => {
          muxes += 1;
          await writeFile(args.at(-1)!, "");
          return { status: failure === "mux" ? 1 : 0, stdout: "", stderr: "" };
        },
      }),
      failure === "render"
        ? /render fixture failure/u
        : failure === "mux"
          ? /mux failed/u
          : /non-empty regular media/u,
    );
    assert.equal(
      muxes,
      failure === "render" || failure === "unsafe-pcm" ? 0 : 1,
    );
    assert.equal(await readFile(outputPath, "utf8"), "previous verified media");
    assert.deepEqual(await readdir(directory), ["video.mp4"]);
  }
});

test("Workspace FFmpeg AAC mux preserves PCM pulse positions and silence in mono and stereo", async (context) => {
  const rootDir = process.cwd();
  const directory = await mkdtemp(join(tmpdir(), "axmorf-audio-timing-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const mediaTool = async (
    tool: "ffmpeg" | "ffprobe",
    args: readonly string[],
  ) => {
    const command = await resolveMediaToolCommand({ rootDir, tool, args });
    const result = await runMediaProcess(command.command, command.args, {
      cwd: rootDir,
      timeoutMs: 30_000,
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  // Original 16 x 16 black RGB PNG, produced with zlib and valid chunk CRCs.
  const framePath = join(directory, "frame.png");
  await writeFile(
    framePath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAEElEQVR4nGNgGAWjYBTAAAADEAABPywr7AAAAABJRU5ErkJggg==",
      "base64",
    ),
  );
  const sourceVideo = join(directory, "source.mp4");
  await mediaTool("ffmpeg", [
    "-v",
    "error",
    "-xerror",
    "-loop",
    "1",
    "-framerate",
    "30",
    "-i",
    framePath,
    "-frames:v",
    "90",
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-video_track_timescale",
    "90000",
    "-y",
    sourceVideo,
  ]);
  const pcm = Buffer.alloc(144_000 * 2);
  const starts = [9_600, 64_800, 122_400];
  const pulseLength = 6_000;
  for (const [pulse, start] of starts.entries()) {
    let phase = 0;
    for (let sample = 0; sample < pulseLength; sample += 1) {
      phase += (2 * Math.PI * (380 + pulse * 240 + sample / 5)) / 48_000;
      const envelope = Math.min(
        1,
        sample / 240,
        (pulseLength - sample - 1) / 240,
      );
      pcm.writeInt16LE(
        Math.round(10_000 * envelope * Math.sin(phase)),
        (start + sample) * 2,
      );
    }
  }
  for (const audioChannels of [1, 2] as const) {
    for (const silent of [false, true]) {
      await context.test(
        `${audioChannels} channels, ${silent ? "silent" : "three pulses"}`,
        async () => {
          const reference = silent ? Buffer.alloc(pcm.length) : pcm;
          const outputPath = join(
            directory,
            `video-${audioChannels}-${silent}.mp4`,
          );
          await renderH264AacVideo({
            rootDir,
            outputPath,
            audioChannels,
            render: async ({ videoPath, pcmPath }) => {
              await copyFile(sourceVideo, videoPath);
              await writeFile(pcmPath, encodeCanonicalPcmWav(reference));
            },
          });
          const metadata = JSON.parse(
            await mediaTool("ffprobe", [
              "-v",
              "error",
              "-count_frames",
              "-show_entries",
              "stream=codec_name,channels,nb_read_frames,duration",
              "-of",
              "json",
              outputPath,
            ]),
          ) as {
            streams: {
              codec_name: string;
              channels?: number;
              nb_read_frames: string;
              duration: string;
            }[];
          };
          assert.equal(metadata.streams[0].codec_name, "h264");
          assert.equal(metadata.streams[0].nb_read_frames, "90");
          assert.equal(metadata.streams[1].codec_name, "aac");
          assert.equal(metadata.streams[1].channels, audioChannels);
          assert.equal(metadata.streams[1].duration, "3.000000");
          const decodedPath = join(
            directory,
            `decoded-${audioChannels}-${silent}.wav`,
          );
          await mediaTool("ffmpeg", [
            "-v",
            "error",
            "-i",
            outputPath,
            "-vn",
            "-ac",
            "1",
            "-c:a",
            "pcm_s16le",
            "-y",
            decodedPath,
          ]);
          const decoded = decodeCanonicalPcmWav(
            await readFile(decodedPath),
          ).rawPcm;
          if (silent) {
            assert.ok(decoded.every((value) => value === 0));
          } else {
            for (const start of starts) {
              const lag = measurePcmLag({
                reference,
                decoded,
                startSample: start - 240,
                endSample: start + pulseLength + 240,
                maxLagSamples: 3_000,
              });
              assert.equal(lag.lagSamples, 0, JSON.stringify(lag));
              assert.ok(lag.correlation > 0.999, JSON.stringify(lag));
            }
          }
        },
      );
    }
  }
  for (const frameCount of [1, 12]) {
    await context.test(
      `${frameCount} frames preserve exact video PTS, DTS, duration and fps through mux`,
      async () => {
        const shortVideo = join(directory, `source-${frameCount}.mp4`);
        await mediaTool("ffmpeg", [
          "-v",
          "error",
          "-xerror",
          "-loop",
          "1",
          "-framerate",
          "30",
          "-i",
          framePath,
          "-frames:v",
          String(frameCount),
          "-an",
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-video_track_timescale",
          "90000",
          "-y",
          shortVideo,
        ]);
        const outputPath = join(directory, `muxed-${frameCount}.mp4`);
        await renderH264AacVideo({
          rootDir,
          outputPath,
          audioChannels: 1,
          render: async ({ videoPath, pcmPath }) => {
            await copyFile(shortVideo, videoPath);
            await writeFile(
              pcmPath,
              encodeCanonicalPcmWav(Buffer.alloc(frameCount * 1600 * 2)),
            );
          },
        });
        const probe = async (path: string) =>
          JSON.parse(
            await mediaTool("ffprobe", [
              "-v",
              "error",
              "-count_frames",
              "-select_streams",
              "v:0",
              "-show_streams",
              "-show_packets",
              "-show_entries",
              "stream=r_frame_rate,avg_frame_rate,time_base,start_pts,duration_ts,nb_read_frames:packet=pts,dts,duration",
              "-of",
              "json",
              path,
            ]),
          ) as {
            streams: {
              r_frame_rate: string;
              avg_frame_rate: string;
              time_base: string;
              start_pts: number;
              duration_ts: number;
              nb_read_frames: string;
            }[];
            packets: { pts: number; dts: number; duration: number }[];
          };
        const source = await probe(shortVideo);
        const muxed = await probe(outputPath);
        for (const field of [
          "r_frame_rate",
          "avg_frame_rate",
          "time_base",
          "start_pts",
          "duration_ts",
          "nb_read_frames",
        ] as const)
          assert.equal(muxed.streams[0][field], source.streams[0][field]);
        assert.deepEqual(muxed.packets, source.packets);
        assert.equal(muxed.streams[0].r_frame_rate, "30/1");
        assert.equal(muxed.streams[0].avg_frame_rate, "30/1");
        assert.equal(muxed.streams[0].time_base, "1/90000");
        assert.equal(muxed.streams[0].start_pts, 0);
        assert.equal(muxed.streams[0].duration_ts, frameCount * 3000);
        assert.equal(muxed.streams[0].nb_read_frames, String(frameCount));
        assert.deepEqual(
          muxed.packets.map(({ pts }) => pts).sort((a, b) => a - b),
          Array.from({ length: frameCount }, (_, index) => index * 3000),
        );
        assert.ok(muxed.packets.every(({ duration }) => duration === 3000));
        await mediaTool("ffmpeg", [
          "-v",
          "error",
          "-xerror",
          "-i",
          outputPath,
          "-c:v",
          "rawvideo",
          "-c:a",
          "pcm_s16le",
          "-f",
          "null",
          "-",
        ]);
      },
    );
  }
});
