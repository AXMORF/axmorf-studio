import { spawn } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, parse, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import {
  NarrationSpecSchema,
  RenderSpecSchema,
  SealedNarrationManifestSchema,
  StorySpecSchema,
  computeGenerationInputFingerprint,
  computeSealedNarrationFingerprint,
  generateSemanticTiming,
} from "../../src/contracts";

const MATRIX_ROOT_PREFIX = join(tmpdir(), "rsp-project-deletion-");

type ProcessResult = Readonly<{
  status: number;
  stdout: string;
  stderr: string;
}>;

const runProcess = (
  command: string,
  args: readonly string[],
  cwd: string,
): Promise<ProcessResult> =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(command, [...args], {
      cwd,
      shell: false,
      env: { ...process.env, CI: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (status) => {
      resolvePromise({ status: status ?? -1, stdout, stderr });
    });
  });

const run = async (command: string, args: readonly string[], cwd: string) => {
  const result = await runProcess(command, args, cwd);
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed in the isolated matrix.\n${result.stdout}${result.stderr}`,
    );
  }
  return result;
};

const expectFailure = async (
  command: string,
  args: readonly string[],
  cwd: string,
) => {
  const result = await runProcess(command, args, cwd);
  if (result.status === 0) {
    throw new Error(`${command} ${args.join(" ")} must fail closed.`);
  }
  return result;
};

const npm = (cwd: string, args: readonly string[]) => run("npm", args, cwd);

export const assertIsolatedMatrixRoot = (rawPath: string) => {
  const path = resolve(rawPath);
  const parsed = parse(path);
  if (
    parsed.dir !== resolve(tmpdir()) ||
    !parsed.base.startsWith("rsp-project-deletion-") ||
    parsed.base === "rsp-project-deletion-"
  ) {
    throw new Error("Deletion matrix root is not an isolated mktemp path.");
  }
  return path;
};

const listProjectIds = async (rootDir: string) => {
  const projectsRoot = join(rootDir, "src/projects");
  const entries = await readdir(projectsRoot, { withFileTypes: true });
  const projectIds: string[] = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (entry.isSymbolicLink()) {
      throw new Error(`Matrix rejects a Project symlink: ${entry.name}.`);
    }
    if (!entry.isDirectory()) continue;
    const compositionPath = join(projectsRoot, entry.name, "Composition.tsx");
    try {
      const metadata = await lstat(compositionPath);
      if (!metadata.isFile() || metadata.isSymbolicLink()) {
        throw new Error("Matrix Project Composition must be a regular file.");
      }
      projectIds.push(entry.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return projectIds;
};

export const selectDeletionTarget = async (rootDir: string) => {
  const projectIds = await listProjectIds(rootDir);
  for (const projectId of projectIds) {
    try {
      const metadata = await lstat(
        join(rootDir, "src/projects", projectId, "verification.profile.json"),
      );
      if (metadata.isFile() && !metadata.isSymbolicLink()) return projectId;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const fallback = projectIds[0];
  if (fallback === undefined) throw new Error("Matrix requires one Project.");
  return fallback;
};

export const removeTreeWithinMatrix = async (
  matrixRoot: string,
  target: string,
) => {
  const isolatedRoot = assertIsolatedMatrixRoot(matrixRoot);
  const resolvedTarget = resolve(target);
  if (
    resolvedTarget === isolatedRoot ||
    !resolvedTarget.startsWith(`${isolatedRoot}${sep}`)
  ) {
    throw new Error("Deletion target escapes the isolated matrix root.");
  }
  await rm(resolvedTarget, { recursive: true, force: true });
};

const createIsolatedRepository = async ({
  sourceRoot,
  label,
}: {
  readonly sourceRoot: string;
  readonly label: string;
}) => {
  const matrixRoot = assertIsolatedMatrixRoot(
    await mkdtemp(`${MATRIX_ROOT_PREFIX}${label}-`),
  );
  const repositoryRoot = join(matrixRoot, "repository");
  const archivePath = join(matrixRoot, "repository.tar");
  await mkdir(repositoryRoot, { recursive: true });
  await run(
    "git",
    [
      "archive",
      "--format=tar",
      `--output=${archivePath}`,
      "HEAD",
      "--",
      ".",
      ":(exclude)public/voice_profile",
      ":(exclude)public/voice_profile/**",
    ],
    sourceRoot,
  );
  await run("tar", ["-xf", archivePath, "-C", repositoryRoot], sourceRoot);
  await unlink(archivePath);
  await symlink(
    join(sourceRoot, "node_modules"),
    join(repositoryRoot, "node_modules"),
  );
  await run("git", ["init", "-q"], repositoryRoot);
  await run(
    "git",
    ["remote", "add", "matrix-source", sourceRoot],
    repositoryRoot,
  );
  await run(
    "git",
    ["fetch", "-q", "--no-tags", "matrix-source", "HEAD"],
    repositoryRoot,
  );
  await run("git", ["reset", "-q", "--mixed", "FETCH_HEAD"], repositoryRoot);
  return { matrixRoot, repositoryRoot } as const;
};

const regenerateCurrentSet = async (rootDir: string) => {
  await npm(rootDir, ["run", "registry:generate"]);
  await npm(rootDir, ["run", "catalog:generate"]);
};

const runSourceSurface = async (rootDir: string) => {
  await npm(rootDir, ["test"]);
  await npm(rootDir, ["run", "registry:check"]);
  await npm(rootDir, ["run", "catalog:check"]);
  await npm(rootDir, [
    "run",
    "project:verify",
    "--",
    "--all",
    "--scope",
    "source",
  ]);
  return npm(rootDir, ["run", "compositions"]);
};

const writeJson = async (path: string, value: unknown) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const writeSyntheticProject = async (rootDir: string) => {
  const storyId = "synthetic-matrix";
  const compositionId = "SyntheticMatrix";
  const projectRoot = join(rootDir, "src/projects", storyId);
  const brief = {
    schemaVersion: 1,
    storyId,
    title: "Synthetic matrix Project",
    sourceMaterial: "Prove a Project can be added from zero current state.",
    audience: "Repository maintainers",
    targetDurationSeconds: 4,
    deliveryConstraints: ["Remain independent from core configuration."],
  } as const;
  const story = StorySpecSchema.parse({
    schemaVersion: 1,
    storyId,
    title: "Synthetic matrix Project",
    beats: [
      {
        meaningId: "opening",
        narrativePurpose: "State the isolated registration proof.",
        ttsChunks: [{ chunkId: "opening-01", ttsText: "A" }],
        explicitPauses: [],
      },
    ],
  });
  const narration = NarrationSpecSchema.parse({
    schemaVersion: 1,
    voiceProfileId: "synthetic-voice",
    mode: "voice-clone",
    seed: 1,
  });
  const render = RenderSpecSchema.parse({
    schemaVersion: 1,
    compositionId,
    fps: 30,
    width: 1920,
    height: 1080,
    locale: "zh-CN",
    leadInFrames: 0,
    tailFrames: 0,
    captionSafeAreaPx: { top: 72, right: 96, bottom: 72, left: 96 },
    output: {
      container: "mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      audioChannels: 2,
    },
  });
  const pcm = {
    sampleRate: 48_000,
    channelLayout: "mono",
    sampleFormat: "s16le",
  } as const;
  const sealInput = {
    schemaVersion: 1,
    storyId,
    narrationSpec: narration,
    generationInputFingerprint: computeGenerationInputFingerprint(
      story,
      narration,
    ),
    normalizationAlgorithmId: "pcm-s16le-normalize-v1",
    assemblyAlgorithmId: "ordered-pcm-concat-v1",
    canonicalPcm: pcm,
    segments: [
      {
        kind: "chunk" as const,
        chunkId: "opening-01",
        meaningId: "opening",
        ttsText: "A",
        localPath: `public/projects/${storyId}/narration/chunks/opening-01.wav`,
        checksum: `sha256:${"a".repeat(64)}`,
        pcm,
        sampleFrameCount: 48_000,
      },
    ],
    completeAudio: {
      localPath: `public/projects/${storyId}/narration/complete.wav`,
      checksum: `sha256:${"b".repeat(64)}`,
      pcm,
      sampleFrameCount: 48_000,
    },
  } as const;
  const sealedNarration = SealedNarrationManifestSchema.parse({
    ...sealInput,
    sealedNarrationFingerprint: computeSealedNarrationFingerprint(sealInput),
  });
  const timing = generateSemanticTiming({
    story,
    narration,
    render,
    sealedNarration,
  });
  await Promise.all([
    writeJson(join(projectRoot, "brief.json"), brief),
    writeJson(join(projectRoot, "story.json"), story),
    writeJson(join(projectRoot, "narration.json"), narration),
    writeJson(join(projectRoot, "render.json"), render),
    writeJson(
      join(projectRoot, "generated/sealed-narration.generated.json"),
      sealedNarration,
    ),
    writeJson(
      join(projectRoot, "generated/semantic-timing.generated.json"),
      timing,
    ),
  ]);
  await writeFile(
    join(projectRoot, "Composition.tsx"),
    "const SyntheticMatrix = () => null;\nexport default SyntheticMatrix;\n",
  );
  return { storyId, compositionId } as const;
};

const reportCase = (caseId: string, summary: string) => {
  process.stdout.write(`Case ${caseId} pass: ${summary}\n`);
};

export const runProjectDeletionMatrix = async (sourceRoot: string) => {
  const cleanups: string[] = [];
  try {
    const zero = await createIsolatedRepository({
      sourceRoot,
      label: "zero-project",
    });
    cleanups.push(zero.matrixRoot);
    await npm(zero.repositoryRoot, ["run", "bootstrap"]);
    await npm(zero.repositoryRoot, ["run", "check"]);
    const zeroRegistry = await readFile(
      join(zero.repositoryRoot, "src/projects/project-registry.generated.ts"),
      "utf8",
    );
    if (!/projectRegistry\s*=\s*\[\]/.test(zeroRegistry)) {
      throw new Error("Fresh checkout Project registry is not empty.");
    }
    reportCase("A", "fresh checkout bootstraps zero Project core");

    const synthetic = await writeSyntheticProject(zero.repositoryRoot);
    await regenerateCurrentSet(zero.repositoryRoot);
    await runSourceSurface(zero.repositoryRoot);
    const compositions = await npm(zero.repositoryRoot, [
      "run",
      "compositions",
    ]);
    if (!compositions.stdout.includes(synthetic.compositionId)) {
      throw new Error("Synthetic Project is missing from compositions.");
    }
    reportCase("B", `added ${synthetic.storyId} from zero state`);

    await writeJson(
      join(
        zero.repositoryRoot,
        "public/projects",
        synthetic.storyId,
        ".matrix-sentinel",
      ),
      { purpose: "prove public Project artifacts remain removable" },
    );
    await removeTreeWithinMatrix(
      zero.matrixRoot,
      join(zero.repositoryRoot, "public/projects", synthetic.storyId),
    );
    await npm(zero.repositoryRoot, ["run", "check"]);
    reportCase("C", `removed public Project ${synthetic.storyId}`);

    await writeJson(join(zero.repositoryRoot, "out/.matrix-sentinel"), {
      purpose: "prove the isolated out tree is explicitly deleted",
    });
    await removeTreeWithinMatrix(
      zero.matrixRoot,
      join(zero.repositoryRoot, "out"),
    );
    await npm(zero.repositoryRoot, ["run", "check"]);
    await expectFailure("npm", ["run", "test:media"], zero.repositoryRoot);
    await expectFailure(
      "npm",
      ["run", "project:evidence:check", "--", "--project", synthetic.storyId],
      zero.repositoryRoot,
    );
    reportCase("D", "deleted out while explicit evidence remained fail-closed");

    await removeTreeWithinMatrix(
      zero.matrixRoot,
      join(zero.repositoryRoot, "src/projects", synthetic.storyId),
    );
    await regenerateCurrentSet(zero.repositoryRoot);
    await npm(zero.repositoryRoot, ["run", "check"]);
    const regeneratedZeroRegistry = await readFile(
      join(zero.repositoryRoot, "src/projects/project-registry.generated.ts"),
      "utf8",
    );
    if (!/projectRegistry\s*=\s*\[\]/.test(regeneratedZeroRegistry)) {
      throw new Error("Zero Project registry is not empty.");
    }
    reportCase("E", `removed src Project ${synthetic.storyId}`);

    const restored = await writeSyntheticProject(zero.repositoryRoot);
    await regenerateCurrentSet(zero.repositoryRoot);
    await npm(zero.repositoryRoot, ["run", "check:static"]);
    const restoredCompositions = await npm(zero.repositoryRoot, [
      "run",
      "compositions",
    ]);
    if (!restoredCompositions.stdout.includes(restored.compositionId)) {
      throw new Error(
        "Restored synthetic Project is missing from compositions.",
      );
    }
    reportCase("F", `restored ${restored.storyId} after deletion`);
  } finally {
    for (const matrixRoot of cleanups.reverse()) {
      await removeTreeWithinMatrix(matrixRoot, join(matrixRoot, "repository"));
      await rm(assertIsolatedMatrixRoot(matrixRoot), {
        recursive: true,
        force: true,
      });
    }
  }
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runProjectDeletionMatrix(process.cwd()).catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Deletion matrix failed."}\n`,
    );
    process.exitCode = 1;
  });
}
