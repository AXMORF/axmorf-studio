import assert from "node:assert/strict";
import test from "node:test";

import {
  DESKTOP_NETWORK_POLICY,
  DoctorResponseSchema,
  RSP_PROTOCOL_VERSION,
  RspCommandRequestSchema,
} from "../../desktop/contracts/protocol";
import {
  RuntimePackManifestSchema,
  buildRuntimePackManifest,
  createRendererRuntimeFingerprint,
} from "../../desktop/contracts/runtime-pack";
import {
  DESKTOP_WORKSPACE_DIRECTORIES,
  LegacyWorkspaceV1ManifestSchema,
  WorkspaceManifestSchema,
  createWorkspaceManifest,
} from "../../desktop/contracts/workspace";

const workspaceId = "26f9827f-2b31-46cc-ae3d-ab5b73f004bf";
const hex = (value: string) => value.repeat(64);

const runtimePack = () => {
  const binaries = {
    ffmpeg: { relativePath: "bin/ffmpeg", version: "7.1", sha256: hex("a") },
    ffprobe: { relativePath: "bin/ffprobe", version: "7.1", sha256: hex("b") },
    node: { relativePath: "bin/node", version: "24.16.0", sha256: hex("c") },
    rendererBrowser: {
      relativePath: "browser/chrome-headless-shell",
      version: "149.0.7790.0",
      sha256: hex("d"),
    },
    rspClient: { relativePath: "bin/rsp", version: "1", sha256: hex("e") },
  } as const;
  return buildRuntimePackManifest({
    platform: "darwin",
    architecture: "arm64",
    remotionPackages: [
      { name: "@remotion/bundler", version: "4.0.489" },
      { name: "@remotion/effects", version: "4.0.489" },
      { name: "@remotion/renderer", version: "4.0.489" },
      { name: "@remotion/studio", version: "4.0.489" },
      { name: "@remotion/studio-shared", version: "4.0.489" },
      { name: "remotion", version: "4.0.489" },
    ],
    ...binaries,
    files: [
      ...Object.values(binaries).map(({ relativePath, sha256 }) => ({
        path: relativePath,
        sizeBytes: 1,
        sha256,
        executable: true,
      })),
      {
        path: "node_modules/@remotion/bundler/package.json",
        sizeBytes: 1,
        sha256: hex("1"),
        executable: false,
      },
      {
        path: "node_modules/@remotion/effects/package.json",
        sizeBytes: 1,
        sha256: hex("f"),
        executable: false,
      },
      {
        path: "node_modules/@remotion/renderer/package.json",
        sizeBytes: 1,
        sha256: hex("2"),
        executable: false,
      },
      {
        path: "node_modules/@remotion/studio/package.json",
        sizeBytes: 1,
        sha256: hex("3"),
        executable: false,
      },
      {
        path: "node_modules/@remotion/studio-shared/package.json",
        sizeBytes: 1,
        sha256: hex("4"),
        executable: false,
      },
      {
        path: "node_modules/remotion/package.json",
        sizeBytes: 1,
        sha256: hex("0"),
        executable: false,
      },
    ]
      .sort((left, right) => left.path.localeCompare(right.path)),
  });
};

test("Phase B doctor is workspace/embedded and removes Phase A fields", () => {
  const pack = runtimePack();
  const doctor = DoctorResponseSchema.parse({
    schemaVersion: 2,
    protocolVersion: RSP_PROTOCOL_VERSION,
    workspaceId,
    adapterMode: "workspace",
    runtimePackMode: "embedded",
    previewCatalog: {
      state: "ready",
      entryCount: 0,
      unavailableCount: 0,
      failureCode: null,
    },
    network: DESKTOP_NETWORK_POLICY,
    productionAvailable: true,
    deliveryAvailable: true,
    deliveryBlocker: null,
    distributionReady: false,
    runtimePackAvailable: true,
    runtimePack: {
      runtimePackId: pack.runtimePackId,
      architecture: pack.architecture,
    },
    provider: "not-configured",
    activeWork: null,
    process: { appPid: 41, enginePid: 42 },
    session: { active: true, expiresAt: "2026-08-23T12:00:00.000Z" },
  });
  assert.equal(doctor.adapterMode, "workspace");
  assert.doesNotMatch(JSON.stringify(doctor), /repositoryMode|host-node/iu);
  assert.throws(() =>
    DoctorResponseSchema.parse({ ...doctor, repositoryMode: "checkout" }),
  );
});

test("Runtime Pack is strict, checksum-bound, and owns Delivery runtime identity", () => {
  const pack = runtimePack();
  assert.match(pack.runtimePackId, /^runtime-pack-[a-f0-9]{64}$/u);
  assert.match(
    createRendererRuntimeFingerprint(pack),
    /^sha256:[a-f0-9]{64}$/u,
  );
  assert.throws(() =>
    RuntimePackManifestSchema.parse({
      ...pack,
      files: pack.files.map((file, index) =>
        index === 0 ? { ...file, sha256: hex("f") } : file,
      ),
    }),
  );
  assert.throws(() =>
    RuntimePackManifestSchema.parse({ ...pack, architecture: "x64" }),
  );
});

test("Workspace v2 is the only runtime schema and v1 is migration-only", () => {
  const manifest = createWorkspaceManifest(workspaceId);
  assert.equal(WorkspaceManifestSchema.parse(manifest).schemaVersion, 2);
  assert.ok(DESKTOP_WORKSPACE_DIRECTORIES.includes(".rsp/current/source"));
  assert.throws(() =>
    WorkspaceManifestSchema.parse({
      schemaVersion: 1,
      contractVersion: "desktop-workspace-v1",
      productId: "com.axmorf.studio",
      workspaceId,
      layoutVersion: 1,
      integrationVersion: 1,
      createdBy: "AXMORF Studio",
    }),
  );
  assert.equal(
    LegacyWorkspaceV1ManifestSchema.parse({
      schemaVersion: 1,
      contractVersion: "desktop-workspace-v1",
      productId: "com.axmorf.studio",
      workspaceId,
      layoutVersion: 1,
      integrationVersion: 1,
      createdBy: "AXMORF Studio",
    }).workspaceId,
    workspaceId,
  );
});

test("rsp-local-v2 requests are strict, scoped, and command-complete", () => {
  const request = {
    protocolVersion: RSP_PROTOCOL_VERSION,
    requestId: "request-1",
    workspaceId,
    command: "delivery-build",
    storyId: "story-one",
  } as const;
  assert.equal(
    RspCommandRequestSchema.parse(request).command,
    "delivery-build",
  );
  assert.throws(() =>
    RspCommandRequestSchema.parse({ ...request, extra: true }),
  );
  assert.throws(() =>
    RspCommandRequestSchema.parse({
      ...request,
      protocolVersion: "rsp-local-v1",
    }),
  );
});
