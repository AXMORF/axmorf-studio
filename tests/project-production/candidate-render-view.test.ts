import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { mkdtemp } from "node:fs/promises";
import test from "node:test";

import { computeProjectRevisionCandidateId } from "../../packages/studio/src/contracts/project-revision";
import { buildResourceCatalog } from "../../scripts/catalog/domain";
import {
  prepareCandidateRenderView,
  replaceCandidateRenderView,
} from "../../scripts/project-production/application/prepare-delivery";
import { createProjectRevisionProductionScope } from "../../scripts/project-production/application/production-scope";
import { validProjectCreateInput } from "../fixtures/project-create";

const revisionInput = {
  schemaVersion: 1,
  contractVersion: "project-revision-input-v1",
  storyId: validProjectCreateInput.storyId,
  baseRevisionId: `revision-${"a".repeat(64)}`,
  baseDeliveryBuildId: `delivery-${"b".repeat(64)}`,
  patch: { brief: validProjectCreateInput.brief },
} as const;

const digest = (bytes: string) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;

const createAssetCatalog = ({
  localPath,
  bytes,
}: {
  readonly localPath: string;
  readonly bytes: string;
}) =>
  buildResourceCatalog([
    {
      schemaVersion: 1,
      id: "asset.candidate-render-proof",
      kind: "asset",
      status: "approved",
      title: "Candidate render proof",
      description: "Stable candidate render asset",
      useCases: ["scene visual"],
      tags: ["fixture"],
      authority: {
        kind: "repository-file",
        repositoryPath: localPath,
      },
      allowedUse: "runtime-approved",
      assetKind: "image",
      mediaRole: "scene-visual",
      localPath,
      checksum: digest(bytes),
      license: {
        id: "fixture-license",
        verificationStatus: "verified",
        sourceUrl: null,
        attributionRequired: false,
        attributionText: null,
        verifiedAt: "2026-08-30T00:00:00.000Z",
        sourceEvidenceFingerprint: digest("license"),
      },
      media: { sizeBytes: Buffer.byteLength(bytes) },
    },
  ]);

const createFixture = async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "axmorf-candidate-render-"));
  const scope = createProjectRevisionProductionScope({
    rootDir,
    storyId: revisionInput.storyId,
    candidateId: computeProjectRevisionCandidateId(revisionInput),
  });
  await mkdir(scope.isolatedRoot, { recursive: true });
  await mkdir(join(rootDir, "src/projects"), { recursive: true });
  await mkdir(join(scope.projectPublicRoot, scope.storyId), {
    recursive: true,
  });
  return { rootDir, scope } as const;
};

test("candidate render view loads shared CSS, copies catalog-bound bytes, and leaves live source unchanged", async (context) => {
  const { rootDir, scope } = await createFixture();
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const liveEntryPoint = join(rootDir, "src/index.ts");
  const liveRegistry = join(
    rootDir,
    "src/projects/project-registry.generated.ts",
  );
  const stylesheet = join(rootDir, "src/index.css");
  const assetBytes = "catalog-bound-image";
  const assetPath = join(rootDir, "public/assets/library/proof.png");
  const narrationPath = join(
    scope.projectPublicRoot,
    scope.storyId,
    "narration/master.wav",
  );
  await mkdir(dirname(assetPath), { recursive: true });
  await mkdir(dirname(narrationPath), { recursive: true });
  await writeFile(liveEntryPoint, "live-entry-sentinel\n");
  await writeFile(liveRegistry, "live-registry-sentinel\n");
  await writeFile(stylesheet, "* { box-sizing: border-box; }\n");
  await writeFile(assetPath, assetBytes);
  await writeFile(narrationPath, "candidate-narration");

  const renderView = await prepareCandidateRenderView({
    scope,
    resourceCatalog: createAssetCatalog({
      localPath: "public/assets/library/proof.png",
      bytes: assetBytes,
    }),
  });

  assert.equal(isAbsolute(renderView.entryPoint), true);
  assert.equal(isAbsolute(renderView.publicDir), true);
  const stylesheetImport = relative(dirname(renderView.entryPoint), stylesheet)
    .split(sep)
    .join("/");
  const entrypointBytes = await readFile(renderView.entryPoint, "utf8");
  const normalizedStylesheetImport = stylesheetImport.startsWith(".")
    ? stylesheetImport
    : `./${stylesheetImport}`;
  assert.equal(
    entrypointBytes.includes(
      `import ${JSON.stringify(normalizedStylesheetImport)};`,
    ),
    true,
  );
  assert.equal(
    await readFile(
      join(renderView.publicDir, "assets/library/proof.png"),
      "utf8",
    ),
    assetBytes,
  );
  assert.equal(
    await readFile(
      join(
        renderView.publicDir,
        "projects",
        scope.storyId,
        "narration/master.wav",
      ),
      "utf8",
    ),
    "candidate-narration",
  );
  assert.equal(await readFile(liveEntryPoint, "utf8"), "live-entry-sentinel\n");
  assert.equal(
    await readFile(liveRegistry, "utf8"),
    "live-registry-sentinel\n",
  );

  await writeFile(assetPath, "drifted-image");
  await assert.rejects(
    prepareCandidateRenderView({
      scope,
      resourceCatalog: createAssetCatalog({
        localPath: "public/assets/library/proof.png",
        bytes: assetBytes,
      }),
    }),
    /asset drifted from ResourceCatalog/u,
  );
  assert.equal(
    await readFile(
      join(renderView.publicDir, "assets/library/proof.png"),
      "utf8",
    ),
    assetBytes,
  );
  assert.equal(await readFile(liveEntryPoint, "utf8"), "live-entry-sentinel\n");
});

test("candidate render view rejects an output directory symlink", async (context) => {
  const { rootDir, scope } = await createFixture();
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const escaped = await mkdtemp(join(tmpdir(), "axmorf-render-escaped-"));
  context.after(() => rm(escaped, { recursive: true, force: true }));
  await symlink(escaped, scope.outputRoot);

  await assert.rejects(
    prepareCandidateRenderView({
      scope,
      resourceCatalog: buildResourceCatalog([]),
    }),
    /directory chain is unsafe/u,
  );
  assert.deepEqual(
    await readFile(join(escaped, "sentinel"), "utf8").catch(() => null),
    null,
  );
});

test("candidate render view reports both install and rollback failures", async () => {
  const installError = new Error("synthetic install failure");
  const rollbackError = new Error("synthetic rollback failure");
  let renameCall = 0;

  await assert.rejects(
    replaceCandidateRenderView({
      staging: "/fixture/staging",
      destination: "/fixture/render-public",
      backup: "/fixture/render-public-backup",
      filesystem: {
        rename: (async () => {
          renameCall += 1;
          if (renameCall === 2) throw installError;
          if (renameCall === 3) throw rollbackError;
        }) as typeof import("node:fs/promises").rename,
        rm: (async () =>
          undefined) as unknown as typeof import("node:fs/promises").rm,
      },
    }),
    (error) => {
      assert.equal(error instanceof AggregateError, true);
      assert.deepEqual((error as AggregateError).errors, [
        installError,
        rollbackError,
      ]);
      return true;
    },
  );
});
