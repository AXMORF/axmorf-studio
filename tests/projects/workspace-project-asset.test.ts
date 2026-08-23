import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  ProjectAssetManifestSchema,
  buildProjectAssetManifest,
  serializeCanonicalJson,
} from "../../src/contracts";
import { createWorkspaceProductionLocations } from "../../scripts/project-production/application/production-locations";
import { importWorkspaceProjectAsset } from "../../scripts/projects/workspace-project-asset";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

const sha256 = (bytes: Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;

const acquisition = () =>
  ({
    schemaVersion: 1,
    acquisitionId: "pexels:2014422",
    provider: "pexels",
    providerAssetId: "2014422",
    sourcePageUrl: "https://www.pexels.com/photo/granite-2014422/",
    creator: {
      name: "Fixture Photographer",
      profileUrl: "https://www.pexels.com/@fixture-photographer",
    },
    license: {
      name: "Pexels License",
      url: "https://www.pexels.com/license/",
    },
    providerPolicy: {
      attributionRequired: true,
      attributionText: "Photo by Fixture Photographer on Pexels",
    },
    acquiredAt: "2026-08-12T00:00:00.000Z",
    file: {
      relativePath: "original.png",
      mimeType: "image/png",
      width: 1,
      height: 1,
      sizeInBytes: PNG.byteLength,
      sha256: sha256(PNG).slice("sha256:".length),
    },
  });

const fixture = async (context: TestContext) => {
  const root = await mkdtemp(join(tmpdir(), "workspace-project-asset-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, "workspace");
  const runtime = join(root, "runtime");
  const support = join(root, "support");
  const cache = join(root, "cache");
  await Promise.all([
    mkdir(join(workspace, "projects/story-example/generated"), {
      recursive: true,
    }),
    mkdir(join(workspace, "media/story-example"), { recursive: true }),
    mkdir(join(workspace, ".rsp/current/source"), { recursive: true }),
    mkdir(join(workspace, ".rsp/locks"), { recursive: true }),
    mkdir(support, { recursive: true }),
    mkdir(cache, { recursive: true }),
    cp(join(import.meta.dirname, "../../src"), join(runtime, "source/src"), {
      recursive: true,
    }),
    cp(
      join(
        import.meta.dirname,
        "../../desktop/resources/workspace-integration/assets",
      ),
      join(runtime, "shared-assets"),
      { recursive: true },
    ),
  ]);
  const manifest = buildProjectAssetManifest({
    projectId: "story-example",
    assets: [],
    externalAssets: [],
  });
  await writeFile(
    join(workspace, "projects/story-example/assets.manifest.json"),
    `${serializeCanonicalJson(manifest)}\n`,
  );
  return {
    workspace,
    locations: createWorkspaceProductionLocations({
      workspaceRoot: workspace,
      applicationSupportRoot: support,
      runtimeResources: runtime,
      cacheRoot: cache,
    }),
  };
};

test("Workspace asset import owns exact bytes evidence manifest and Catalog", async (context) => {
  const value = await fixture(context);
  const receipt = acquisition();
  const first = await importWorkspaceProjectAsset({
    locations: value.locations,
    projectId: "story-example",
    role: "scene-visual",
    receipt,
    candidateBase64: PNG.toString("base64"),
  });
  assert.equal(first.noOp, false);
  const mediaPath = join(
    value.workspace,
    "media/story-example/assets",
    first.publicPath.split("/").at(-1)!,
  );
  assert.deepEqual(await readFile(mediaPath), PNG);
  const manifestPath = join(
    value.workspace,
    "projects/story-example/assets.manifest.json",
  );
  const manifest = ProjectAssetManifestSchema.parse(
    JSON.parse(await readFile(manifestPath, "utf8")),
  );
  assert.equal(manifest.assets[0]?.id, first.resourceId);
  assert.equal(manifest.assets[0]?.localPath, first.publicPath);
  const evidenceRoot = join(
    value.workspace,
    "projects/story-example/sources/assets",
    first.resourceId,
  );
  await Promise.all([
    access(join(evidenceRoot, "provider-receipt.json")),
    access(join(evidenceRoot, "external-asset-acquisition.json")),
    access(
      join(
        value.workspace,
        "projects/story-example/generated/resource-catalog.generated.json",
      ),
    ),
    access(
      join(value.workspace, ".rsp/current/resource-catalog.generated.json"),
    ),
  ]);
  const providerReceiptBytes = await readFile(
    join(evidenceRoot, "provider-receipt.json"),
  );
  const acquisitionBytes = await readFile(
    join(evidenceRoot, "external-asset-acquisition.json"),
  );
  assert.deepEqual(
    JSON.parse(providerReceiptBytes.toString("utf8")),
    receipt,
  );
  assert.equal(
    JSON.parse(providerReceiptBytes.toString("utf8")).provenanceFingerprint,
    undefined,
  );
  assert.equal(
    JSON.parse(acquisitionBytes.toString("utf8")).provenanceFingerprint,
    manifest.externalAssets[0]?.acquisition.provenanceFingerprint,
  );
  assert.notDeepEqual(providerReceiptBytes, acquisitionBytes);
  assert.equal(
    manifest.externalAssets[0]?.evidence.providerReceiptChecksum,
    sha256(providerReceiptBytes),
  );
  const before = await readFile(manifestPath);
  const current = await importWorkspaceProjectAsset({
    locations: value.locations,
    projectId: "story-example",
    role: "scene-visual",
    receipt,
    candidateBase64: PNG.toString("base64"),
  });
  assert.equal(current.noOp, true);
  assert.deepEqual(await readFile(manifestPath), before);
  await assert.rejects(access(join(value.workspace, "public/projects")));
});

test("Workspace asset import rejects noncanonical base64 and byte drift before mutation", async (context) => {
  const value = await fixture(context);
  await assert.rejects(
    importWorkspaceProjectAsset({
      locations: value.locations,
      projectId: "story-example",
      role: "global-visual",
      receipt: acquisition(),
      candidateBase64: `${PNG.toString("base64")}\n`,
    }),
    /canonical base64/u,
  );
  const drifted = Buffer.from(PNG);
  drifted[drifted.length - 1] ^= 1;
  await assert.rejects(
    importWorkspaceProjectAsset({
      locations: value.locations,
      projectId: "story-example",
      role: "global-visual",
      receipt: acquisition(),
      candidateBase64: drifted.toString("base64"),
    }),
    /identity is stale/u,
  );
  const manifest = ProjectAssetManifestSchema.parse(
    JSON.parse(
      await readFile(
        join(value.workspace, "projects/story-example/assets.manifest.json"),
        "utf8",
      ),
    ),
  );
  assert.equal(manifest.assets.length, 0);
  await assert.rejects(
    access(join(value.workspace, "media/story-example/assets")),
  );
});

test("Workspace asset import rolls back Project bytes when Catalog validation fails", async (context) => {
  const value = await fixture(context);
  const manifestPath = join(
    value.workspace,
    "projects/story-example/assets.manifest.json",
  );
  const manifestBefore = await readFile(manifestPath);
  const outside = join(dirname(value.workspace), "outside-project");
  await mkdir(outside);
  await symlink(outside, join(value.workspace, "projects/linked-project"));
  await assert.rejects(
    importWorkspaceProjectAsset({
      locations: value.locations,
      projectId: "story-example",
      role: "scene-visual",
      receipt: acquisition(),
      candidateBase64: PNG.toString("base64"),
    }),
    /symbolic/u,
  );
  assert.deepEqual(await readFile(manifestPath), manifestBefore);
  await assert.rejects(
    access(join(value.workspace, "media/story-example/assets")),
  );
  await assert.rejects(
    access(join(value.workspace, "projects/story-example/sources/assets")),
  );
});

test("Workspace asset import rejects a symlinked Workspace ancestor without external writes", async (context) => {
  const value = await fixture(context);
  const outsideWorkspace = join(dirname(value.workspace), "outside-workspace");
  await rename(value.workspace, outsideWorkspace);
  await writeFile(
    join(outsideWorkspace, "media/story-example/sentinel"),
    "external-media\n",
  );
  await symlink(outsideWorkspace, value.workspace);

  await assert.rejects(
    importWorkspaceProjectAsset({
      locations: value.locations,
      projectId: "story-example",
      role: "scene-visual",
      receipt: acquisition(),
      candidateBase64: PNG.toString("base64"),
    }),
    /ownership chain|canonical|symbolic/u,
  );
  assert.equal(
    await readFile(
      join(outsideWorkspace, "media/story-example/sentinel"),
      "utf8",
    ),
    "external-media\n",
  );
  await assert.rejects(
    access(join(outsideWorkspace, "media/story-example/assets")),
  );
});
