import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { TestContext } from "node:test";

import {
  SealedNarrationManifestSchema,
  type NarrativeAutoCheckReport,
} from "../../src/contracts";
import {
  writeM3NarrativeBaselineEvidence,
  type ProcessRunner,
} from "../../scripts/baseline/evidence";
import { writeNarrativeAutoCheckIfPassed } from "../../scripts/project-check/report-files";
import { runNarrativeAutoCheck } from "../../scripts/project-check/run";
import { generateProjectRegistry } from "../../scripts/registry/generate";

const ok = (stdout: string): Awaited<ReturnType<ProcessRunner>> => ({
  status: 0,
  stdout,
  stderr: "",
});

export type M4ProjectFixture = {
  readonly rootDir: string;
  readonly storyId: "gps-relativity";
  readonly processCalls: string[];
  readonly runProcess: ProcessRunner;
  readonly initialReport: NarrativeAutoCheckReport;
  readonly paths: {
    readonly brief: string;
    readonly story: string;
    readonly narration: string;
    readonly render: string;
    readonly storyCheck: string;
    readonly manifest: string;
    readonly timing: string;
    readonly registry: string;
    readonly receipt: string;
    readonly autoCheck: string;
    readonly transparentStill: string;
    readonly captionStill: string;
    readonly renderMedia: string;
    readonly completeWav: string;
    readonly firstChunkWav: string;
  };
};

export const createM4ProjectFixture = async (
  context: TestContext,
): Promise<M4ProjectFixture> => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-m4-project-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const storyId = "gps-relativity" as const;
  await cp(
    join(process.cwd(), "src/projects", storyId),
    join(rootDir, "src/projects", storyId),
    { recursive: true },
  );
  await cp(
    join(process.cwd(), "public/projects", storyId),
    join(rootDir, "public/projects", storyId),
    { recursive: true },
  );
  const paths = {
    brief: join(rootDir, `src/projects/${storyId}/brief.json`),
    story: join(rootDir, `src/projects/${storyId}/story.json`),
    narration: join(rootDir, `src/projects/${storyId}/narration.json`),
    render: join(rootDir, `src/projects/${storyId}/render.json`),
    storyCheck: join(rootDir, `src/projects/${storyId}/reviews/story-check.json`),
    manifest: join(
      rootDir,
      `src/projects/${storyId}/generated/sealed-narration.generated.json`,
    ),
    timing: join(
      rootDir,
      `src/projects/${storyId}/generated/semantic-timing.generated.json`,
    ),
    registry: join(rootDir, "src/projects/project-registry.generated.ts"),
    receipt: join(
      rootDir,
      `src/projects/${storyId}/generated/narrative-baseline-evidence.generated.json`,
    ),
    autoCheck: join(
      rootDir,
      `src/projects/${storyId}/generated/narrative-auto-check.generated.json`,
    ),
    transparentStill: join(
      rootDir,
      `out/${storyId}/m3-transparent-frame-0.png`,
    ),
    captionStill: join(rootDir, `out/${storyId}/m3-caption-frame-15.png`),
    renderMedia: join(rootDir, `out/${storyId}/m3-narrative-baseline.mp4`),
    completeWav: "",
    firstChunkWav: "",
  };
  const manifest = SealedNarrationManifestSchema.parse(
    JSON.parse(await readFile(paths.manifest, "utf8")),
  );
  const firstChunk = manifest.segments.find(
    (segment) => segment.kind === "chunk",
  );
  if (firstChunk?.kind !== "chunk") throw new Error("M4 fixture needs a chunk.");
  const resolvedPaths = {
    ...paths,
    completeWav: join(rootDir, manifest.completeAudio.localPath),
    firstChunkWav: join(rootDir, firstChunk.localPath),
  };
  for (const [path, bytes] of [
    [resolvedPaths.transparentStill, "synthetic-transparent-still"],
    [resolvedPaths.captionStill, "synthetic-caption-still"],
    [resolvedPaths.renderMedia, "synthetic-baseline-render"],
  ] as const) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }
  await generateProjectRegistry({ rootDir, mode: "write" });

  const processCalls: string[] = [];
  const runProcess: ProcessRunner = async (command, args) => {
    processCalls.push(`${command} ${args.join(" ")}`);
    if (command === "ffprobe") {
      return ok(
        JSON.stringify({
          streams: [
            {
              codec_type: "video",
              codec_name: "h264",
              avg_frame_rate: "30/1",
              nb_read_frames: "1731",
            },
            { codec_type: "audio", codec_name: "aac" },
          ],
        }),
      );
    }
    return args.join(" ").includes("crop=64:64:0:0") ||
      args.some((argument) => argument.includes("frame-0"))
      ? ok("lavfi.signalstats.YMIN=0\nlavfi.signalstats.YMAX=0\n")
      : ok("lavfi.signalstats.YMIN=0\nlavfi.signalstats.YMAX=255\n");
  };
  await writeM3NarrativeBaselineEvidence({ rootDir, storyId, runProcess });
  const initialReport = await runNarrativeAutoCheck({
    rootDir,
    projectId: storyId,
    runM3EvidenceProcess: runProcess,
  });
  if (initialReport.aggregateStatus !== "pass") {
    throw new Error("M4 fixture did not produce a passing AutoCheck.");
  }
  await writeNarrativeAutoCheckIfPassed({ rootDir, report: initialReport });
  return {
    rootDir,
    storyId,
    processCalls,
    runProcess,
    initialReport,
    paths: resolvedPaths,
  };
};

export const snapshotM4FixtureBytes = async (
  fixture: M4ProjectFixture,
) => {
  const snapshot: Record<string, string | null> = {};
  for (const path of Object.values(fixture.paths)) {
    try {
      snapshot[path] = createHash("sha256")
        .update(Uint8Array.from(await readFile(path)))
        .digest("hex");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      snapshot[path] = null;
    }
  }
  return snapshot;
};
