import { createHash, randomUUID } from "node:crypto";
import { cp, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

import {
  ArtifactAttestationSchema,
  ProducerTaskKindSchema,
  ProducerTaskSpecSchema,
  StoryIdSchema,
  TaskRevisionSchema,
  buildArtifactAttestation,
  serializeCanonicalJson,
  type ArtifactAttestation,
  type ProducerTaskSpec,
  type Sha256Digest,
} from "../../../src/contracts";

const checksum = (bytes: Uint8Array) => `sha256:${createHash("sha256").update(bytes).digest("hex")}` as Sha256Digest;

export const resolveArtifactPath = ({ rootDir, storyId, taskKind, taskRevision }: {
  readonly rootDir: string; readonly storyId: string; readonly taskKind: string; readonly taskRevision: string;
}) => join(rootDir, ".producer-artifacts", StoryIdSchema.parse(storyId), ProducerTaskKindSchema.parse(taskKind), TaskRevisionSchema.parse(taskRevision));

const assertArtifactParents = async ({
  rootDir,
  task,
}: {
  readonly rootDir: string;
  readonly task: ProducerTaskSpec;
}) => {
  const parents = [
    join(rootDir, ".producer-artifacts"),
    join(rootDir, ".producer-artifacts", task.storyId),
    join(rootDir, ".producer-artifacts", task.storyId, task.taskKind),
  ];
  for (const parent of parents) {
    try {
      const metadata = await lstat(parent);
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw new Error("Artifact Store parent is unsafe.");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
  }
};

const listFiles = async (root: string, directory = root): Promise<readonly string[]> => {
  const metadata = await lstat(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error("Artifact directory is unsafe.");
  const found: string[] = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) throw new Error("Artifact contains a non-regular entry.");
    if (entry.isDirectory()) found.push(...await listFiles(root, path));
    else found.push(relative(root, path).split(sep).join("/"));
  }
  return found.sort();
};

export const inspectArtifact = async ({ rootDir, task }: { readonly rootDir: string; readonly task: ProducerTaskSpec }): Promise<ArtifactAttestation | null> => {
  const parsedTask = ProducerTaskSpecSchema.parse(task);
  await assertArtifactParents({ rootDir, task: parsedTask });
  const root = resolveArtifactPath({ rootDir, storyId: parsedTask.storyId, taskKind: parsedTask.taskKind, taskRevision: parsedTask.taskRevision });
  try {
    const metadata = await lstat(root);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error("Artifact root is unsafe.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const attestation = ArtifactAttestationSchema.parse(JSON.parse(await readFile(join(root, "artifact-attestation.json"), "utf8")));
  if (attestation.taskRevision !== parsedTask.taskRevision || attestation.taskKind !== parsedTask.taskKind || attestation.storyId !== parsedTask.storyId) {
    throw new Error("Artifact attestation is cross-bound.");
  }
  if (
    attestation.semanticId !== parsedTask.semanticId ||
    attestation.validatorPolicyVersion !== parsedTask.validatorPolicyVersion ||
    serializeCanonicalJson(attestation.dependencyArtifacts) !==
      serializeCanonicalJson(parsedTask.dependencyArtifacts)
  ) {
    throw new Error("Artifact attestation task binding is stale.");
  }
  const actualFiles = await listFiles(root);
  const expectedFiles = ["artifact-attestation.json", ...attestation.outputManifest.map(({ logicalPath }) => `files/${logicalPath}`)].sort();
  if (actualFiles.length !== expectedFiles.length || actualFiles.some((path, index) => path !== expectedFiles[index])) {
    throw new Error("Artifact exact file set is stale.");
  }
  const declaredOutputs = [...parsedTask.declaredOutputSet].sort();
  const attestedOutputs = attestation.outputManifest.map(({ logicalPath }) => logicalPath);
  if (
    declaredOutputs.length !== attestedOutputs.length ||
    declaredOutputs.some((path, index) => path !== attestedOutputs[index])
  ) {
    throw new Error("Artifact output manifest is not bound to the TaskSpec.");
  }
  for (const output of attestation.outputManifest) {
    const path = join(root, "files", output.logicalPath);
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("Artifact output is not a regular file.");
    const bytes = Uint8Array.from(await readFile(path));
    if (bytes.byteLength !== output.sizeBytes || checksum(bytes) !== output.checksum) throw new Error("Artifact output checksum drifted.");
  }
  return attestation;
};

export const commitTaskArtifact = async ({ rootDir, task, workspace }: {
  readonly rootDir: string; readonly task: ProducerTaskSpec; readonly workspace: string;
}) => {
  const parsedTask = ProducerTaskSpecSchema.parse(task);
  await assertArtifactParents({ rootDir, task: parsedTask });
  const workspaceFiles = (await listFiles(workspace)).filter((path) => path !== "task.json");
  const allowedInputs = new Set(parsedTask.declaredReadSet);
  const outputs = parsedTask.declaredOutputSet;
  const allowed = new Set([...allowedInputs, ...outputs]);
  if (workspaceFiles.some((path) => !allowed.has(path)) || outputs.some((path) => !workspaceFiles.includes(path))) {
    throw new Error("Task workspace contains missing or unknown files.");
  }
  const outputManifest = await Promise.all(outputs.map(async (logicalPath) => {
    const path = join(workspace, logicalPath);
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("Task output must be a regular file.");
    const bytes = Uint8Array.from(await readFile(path));
    return { logicalPath, checksum: checksum(bytes), sizeBytes: bytes.byteLength, kind: "file" as const };
  }));
  const attestation = buildArtifactAttestation({
    storyId: parsedTask.storyId,
    taskKind: parsedTask.taskKind,
    semanticId: parsedTask.semanticId,
    taskRevision: parsedTask.taskRevision,
    validatorPolicyVersion: parsedTask.validatorPolicyVersion,
    dependencyArtifacts: parsedTask.dependencyArtifacts,
    outputManifest,
  });
  const target = resolveArtifactPath({ rootDir, storyId: parsedTask.storyId, taskKind: parsedTask.taskKind, taskRevision: parsedTask.taskRevision });
  const existing = await inspectArtifact({ rootDir, task: parsedTask }).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  });
  if (existing !== null) {
    if (existing.artifactFingerprint === attestation.artifactFingerprint) return { attestation: existing, reused: true as const };
    throw new Error("Artifact identity has conflicting output bytes.");
  }
  const parent = dirname(target);
  await mkdir(parent, { recursive: true });
  const staging = join(parent, `.staging-${parsedTask.taskRevision}-${randomUUID()}`);
  try {
    await mkdir(join(staging, "files"), { recursive: true });
    for (const output of outputs) {
      const destination = join(staging, "files", output);
      await mkdir(dirname(destination), { recursive: true });
      await cp(join(workspace, output), destination, { errorOnExist: true, force: false });
    }
    await writeFile(join(staging, "artifact-attestation.json"), `${serializeCanonicalJson(attestation)}\n`, { flag: "wx" });
    try {
      await rename(staging, target);
    } catch (error) {
      const raced = await inspectArtifact({ rootDir, task: parsedTask }).catch(() => null);
      if (raced?.artifactFingerprint === attestation.artifactFingerprint) {
        return { attestation: raced, reused: true as const };
      }
      if (raced !== null) {
        throw new Error("Artifact identity has conflicting output bytes.", {
          cause: error,
        });
      }
      throw error;
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return { attestation: await inspectArtifact({ rootDir, task: parsedTask }), reused: false as const };
};
