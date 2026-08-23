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
import type { ArtifactState } from "../../../src/contracts/production-inspection";
import type { ArtifactInspection } from "../domain/invalidation";
import type { ProductionLocations } from "../domain/production-locations";

type ArtifactStoreLocation = Readonly<{
  locations: ProductionLocations;
}>;

const checksum = (bytes: Uint8Array) => `sha256:${createHash("sha256").update(bytes).digest("hex")}` as Sha256Digest;

class ArtifactValidationError extends Error {
  public constructor(
    public readonly artifactState: Exclude<ArtifactState, "valid" | "missing">,
    message: string,
  ) {
    super(message);
  }
}

export const resolveArtifactPath = (input: ArtifactStoreLocation & {
  readonly storyId: string; readonly taskKind: string; readonly taskRevision: string;
}) => join(input.locations.artifactStoreRoot, StoryIdSchema.parse(input.storyId), ProducerTaskKindSchema.parse(input.taskKind), TaskRevisionSchema.parse(input.taskRevision));

const assertArtifactParents = async ({
  locations,
  task,
}: ArtifactStoreLocation & {
  readonly task: ProducerTaskSpec;
}) => {
  const storage = locations.artifactStoreRoot;
  const parents = [
    storage,
    join(storage, task.storyId),
    join(storage, task.storyId, task.taskKind),
  ];
  for (const parent of parents) {
    try {
      const metadata = await lstat(parent);
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw new ArtifactValidationError(
          "unsafe-path",
          "Artifact Store parent is unsafe.",
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
  }
};

const listFiles = async (root: string, directory = root): Promise<readonly string[]> => {
  const metadata = await lstat(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new ArtifactValidationError(
      "unsafe-path",
      "Artifact directory is unsafe.",
    );
  }
  const found: string[] = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
      throw new ArtifactValidationError(
        "unsafe-path",
        "Artifact contains a non-regular entry.",
      );
    }
    if (entry.isDirectory()) found.push(...await listFiles(root, path));
    else found.push(relative(root, path).split(sep).join("/"));
  }
  return found.sort();
};

const inspectArtifactAttestation = async (input: ArtifactStoreLocation & { readonly task: ProducerTaskSpec }): Promise<ArtifactAttestation | null> => {
  const { task } = input;
  const parsedTask = ProducerTaskSpecSchema.parse(task);
  await assertArtifactParents({ ...input, task: parsedTask });
  const root = resolveArtifactPath({ ...input, storyId: parsedTask.storyId, taskKind: parsedTask.taskKind, taskRevision: parsedTask.taskRevision });
  try {
    const metadata = await lstat(root);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new ArtifactValidationError(
        "unsafe-path",
        "Artifact root is unsafe.",
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  let rawAttestation: unknown;
  try {
    rawAttestation = JSON.parse(
      await readFile(join(root, "artifact-attestation.json"), "utf8"),
    );
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      throw new ArtifactValidationError(
        "manifest-invalid",
        "Artifact attestation manifest is invalid.",
      );
    }
    throw error;
  }
  const parsedAttestation = ArtifactAttestationSchema.safeParse(rawAttestation);
  if (!parsedAttestation.success) {
    throw new ArtifactValidationError(
      "manifest-invalid",
      "Artifact attestation manifest is invalid.",
    );
  }
  const attestation = parsedAttestation.data;
  if (attestation.taskRevision !== parsedTask.taskRevision || attestation.taskKind !== parsedTask.taskKind || attestation.storyId !== parsedTask.storyId) {
    throw new ArtifactValidationError(
      "identity-mismatch",
      "Artifact attestation is cross-bound.",
    );
  }
  if (
    attestation.semanticId !== parsedTask.semanticId ||
    attestation.validatorPolicyVersion !== parsedTask.validatorPolicyVersion ||
    serializeCanonicalJson(attestation.dependencyArtifacts) !==
      serializeCanonicalJson(parsedTask.dependencyArtifacts)
  ) {
    throw new ArtifactValidationError(
      "identity-mismatch",
      "Artifact attestation task binding is stale.",
    );
  }
  const actualFiles = await listFiles(root);
  const expectedFiles = ["artifact-attestation.json", ...attestation.outputManifest.map(({ logicalPath }) => `files/${logicalPath}`)].sort();
  if (actualFiles.length !== expectedFiles.length || actualFiles.some((path, index) => path !== expectedFiles[index])) {
    throw new ArtifactValidationError(
      "exact-set-drift",
      "Artifact exact file set is stale.",
    );
  }
  const declaredOutputs = [...parsedTask.declaredOutputSet].sort();
  const attestedOutputs = attestation.outputManifest.map(({ logicalPath }) => logicalPath);
  if (
    declaredOutputs.length !== attestedOutputs.length ||
    declaredOutputs.some((path, index) => path !== attestedOutputs[index])
  ) {
    throw new ArtifactValidationError(
      "exact-set-drift",
      "Artifact output manifest is not bound to the TaskSpec.",
    );
  }
  for (const output of attestation.outputManifest) {
    const path = join(root, "files", output.logicalPath);
    let metadata;
    try {
      metadata = await lstat(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new ArtifactValidationError(
          "exact-set-drift",
          "Artifact exact file set is stale.",
        );
      }
      throw error;
    }
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new ArtifactValidationError(
        "unsafe-path",
        "Artifact output is not a regular file.",
      );
    }
    const bytes = Uint8Array.from(await readFile(path));
    if (bytes.byteLength !== output.sizeBytes || checksum(bytes) !== output.checksum) {
      throw new ArtifactValidationError(
        "checksum-drift",
        "Artifact output checksum drifted.",
      );
    }
  }
  return attestation;
};

export const inspectArtifactState = async (input: ArtifactStoreLocation & {
  readonly task: ProducerTaskSpec;
}): Promise<ArtifactInspection> => {
  try {
    const attestation = await inspectArtifactAttestation(input);
    return attestation === null
      ? { artifactState: "missing", attestation: null }
      : { artifactState: "valid", attestation };
  } catch (error) {
    if (error instanceof ArtifactValidationError) {
      return { artifactState: error.artifactState, attestation: null };
    }
    throw error;
  }
};

export const inspectArtifact = async (input: ArtifactStoreLocation & {
  readonly task: ProducerTaskSpec;
}): Promise<ArtifactAttestation | null> => {
  const inspection = await inspectArtifactState(input);
  if (inspection.artifactState === "valid") return inspection.attestation;
  if (inspection.artifactState === "missing") return null;
  const messages: Record<Exclude<ArtifactState, "valid" | "missing">, string> = {
    "manifest-invalid": "Artifact attestation manifest is invalid.",
    "identity-mismatch": "Artifact attestation task binding is stale.",
    "exact-set-drift": "Artifact exact file set is stale.",
    "checksum-drift": "Artifact output checksum drifted.",
    "unsafe-path": "Artifact path is unsafe.",
  };
  throw new Error(messages[inspection.artifactState]);
};

export const commitTaskArtifact = async (input: ArtifactStoreLocation & {
  readonly task: ProducerTaskSpec; readonly workspace: string;
}) => {
  const { task, workspace } = input;
  const parsedTask = ProducerTaskSpecSchema.parse(task);
  await assertArtifactParents({ ...input, task: parsedTask });
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
  const target = resolveArtifactPath({ ...input, storyId: parsedTask.storyId, taskKind: parsedTask.taskKind, taskRevision: parsedTask.taskRevision });
  const existing = await inspectArtifact({ ...input, task: parsedTask }).catch((error) => {
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
      const raced = await inspectArtifact({ ...input, task: parsedTask }).catch(() => null);
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
  return { attestation: await inspectArtifact({ ...input, task: parsedTask }), reused: false as const };
};
