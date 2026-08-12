import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  buildResourceCatalog,
  renderResourceCatalogJson,
} from "../../scripts/catalog/domain";
import { loadProjectResourceDescriptors } from "../../scripts/catalog/project-files";
import {
  importProjectAsset,
  type ProjectAssetCatalogSync,
} from "../../scripts/project-assets/application/import";
import { ProjectAssetManifestSchema } from "../../src/contracts";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const checksum = (bytes: Uint8Array) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}` as const;

const receiptFor = (overrides: Record<string, unknown> = {}) => ({
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
  file: {
    relativePath: "original.png",
    mimeType: "image/png",
    width: 1,
    height: 1,
    sizeInBytes: PNG.byteLength,
    sha256: checksum(PNG).slice("sha256:".length),
  },
  acquiredAt: "2026-08-12T00:00:00.000Z",
  ...overrides,
});

const createFixture = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-project-asset-import-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const projectId = "story-example";
  const candidateDir = join(rootDir, "candidates", "pexels", "2014422");
  const receiptPath = join(candidateDir, "acquisition.json");
  await mkdir(join(rootDir, "src/projects", projectId), { recursive: true });
  await mkdir(candidateDir, { recursive: true });
  await writeFile(join(candidateDir, "original.png"), PNG);
  await writeFile(receiptPath, `${JSON.stringify(receiptFor())}\n`);
  const calls: string[] = [];
  const syncCatalog: ProjectAssetCatalogSync = async ({
    rootDir: fixtureRoot,
    projectId: fixtureProject,
    mode,
  }) => {
    calls.push(mode);
    const catalog = buildResourceCatalog(
      await loadProjectResourceDescriptors(fixtureRoot, fixtureProject),
    );
    const bytes = renderResourceCatalogJson(catalog);
    const paths = [
      join(fixtureRoot, "src/remotion/catalog/resource-catalog.generated.json"),
      join(
        fixtureRoot,
        "src/projects",
        fixtureProject,
        "generated/resource-catalog.generated.json",
      ),
    ];
    if (mode === "write") {
      for (const path of paths) {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, bytes);
      }
    } else {
      for (const path of paths)
        assert.equal(await readFile(path, "utf8"), bytes);
    }
    return catalog;
  };
  return { rootDir, projectId, candidateDir, receiptPath, syncCatalog, calls };
};

test("imports one verified Pexels image into Project ownership and repeats as read-only no-op", async (context) => {
  const fixture = await createFixture(context);
  const receiptBefore = await readFile(fixture.receiptPath);
  const sourceBefore = await readFile(
    join(fixture.candidateDir, "original.png"),
  );
  const first = await importProjectAsset({
    rootDir: fixture.rootDir,
    projectId: fixture.projectId,
    receiptPath: fixture.receiptPath,
    role: "scene-visual",
    syncCatalog: fixture.syncCatalog,
  });
  assert.equal(first.noOp, false);
  assert.deepEqual(fixture.calls, ["write", "check"]);
  assert.match(first.resourceId, /^asset\.pexels\.2014422\.scene-visual\./u);

  const manifestPath = join(
    fixture.rootDir,
    "src/projects/story-example/assets.manifest.json",
  );
  const manifestBytes = await readFile(manifestPath, "utf8");
  const manifest = ProjectAssetManifestSchema.parse(JSON.parse(manifestBytes));
  assert.equal(manifest.assets[0]?.localPath, first.publicPath);
  assert.equal(manifest.assets[0]?.assetKind, "image");
  assert.equal(manifest.assets[0]?.license.verificationStatus, "verified");
  assert.equal(manifest.externalAssets[0]?.acquisition.assetKind, "image");
  const projectCatalog = JSON.parse(
    await readFile(
      join(
        fixture.rootDir,
        "src/projects/story-example/generated/resource-catalog.generated.json",
      ),
      "utf8",
    ),
  ) as {
    catalogFingerprint: string;
    entries: readonly {
      descriptor: { id: string };
      descriptorFingerprint: string;
    }[];
  };
  assert.equal(projectCatalog.catalogFingerprint, first.catalogFingerprint);
  assert.equal(projectCatalog.entries[0]?.descriptor.id, first.resourceId);
  assert.match(
    projectCatalog.entries[0]?.descriptorFingerprint ?? "",
    /^sha256:[a-f0-9]{64}$/u,
  );
  assert.deepEqual(
    await readFile(join(fixture.rootDir, first.publicPath)),
    PNG,
  );
  assert.deepEqual(await readFile(fixture.receiptPath), receiptBefore);
  assert.deepEqual(
    await readFile(join(fixture.candidateDir, "original.png")),
    sourceBefore,
  );
  await assert.rejects(readdir(join(fixture.rootDir, "public/assets/library")));

  const before = new Map(
    await Promise.all(
      [manifestPath, join(fixture.rootDir, first.publicPath)].map(
        async (path) => [path, await readFile(path)] as const,
      ),
    ),
  );
  const second = await importProjectAsset({
    rootDir: fixture.rootDir,
    projectId: fixture.projectId,
    receiptPath: fixture.receiptPath,
    role: "scene-visual",
    syncCatalog: fixture.syncCatalog,
  });
  assert.equal(second.noOp, true);
  assert.deepEqual(fixture.calls, ["write", "check", "check"]);
  for (const [path, bytes] of before)
    assert.deepEqual(await readFile(path), bytes);
});

test("rejects receipt and image identity drift without publishing Project files", async () => {
  for (const [label, mutate] of [
    [
      "unknown field",
      (receipt: ReturnType<typeof receiptFor>) => ({
        ...receipt,
        unknown: true,
      }),
    ],
    [
      "version",
      (receipt: ReturnType<typeof receiptFor>) => ({
        ...receipt,
        schemaVersion: 2,
      }),
    ],
    [
      "kind",
      (receipt: ReturnType<typeof receiptFor>) => ({
        ...receipt,
        assetKind: "video",
      }),
    ],
    [
      "checksum",
      (receipt: ReturnType<typeof receiptFor>) => ({
        ...receipt,
        file: { ...receipt.file, sha256: "a".repeat(64) },
      }),
    ],
    [
      "size",
      (receipt: ReturnType<typeof receiptFor>) => ({
        ...receipt,
        file: { ...receipt.file, sizeInBytes: receipt.file.sizeInBytes + 1 },
      }),
    ],
    [
      "dimensions",
      (receipt: ReturnType<typeof receiptFor>) => ({
        ...receipt,
        file: { ...receipt.file, width: 2 },
      }),
    ],
    [
      "MIME",
      (receipt: ReturnType<typeof receiptFor>) => ({
        ...receipt,
        file: { ...receipt.file, mimeType: "image/jpeg" },
      }),
    ],
    [
      "extension",
      (receipt: ReturnType<typeof receiptFor>) => ({
        ...receipt,
        file: { ...receipt.file, relativePath: "original.jpg" },
      }),
    ],
    [
      "license",
      (receipt: ReturnType<typeof receiptFor>) => ({
        ...receipt,
        license: { ...receipt.license, name: "Other" },
      }),
    ],
    [
      "attribution",
      (receipt: ReturnType<typeof receiptFor>) => ({
        ...receipt,
        providerPolicy: { ...receipt.providerPolicy, attributionText: "" },
      }),
    ],
  ] as const) {
    await test(label, async (nested) => {
      const fixture = await createFixture(nested);
      await writeFile(
        fixture.receiptPath,
        `${JSON.stringify(mutate(receiptFor()))}\n`,
      );
      await assert.rejects(() =>
        importProjectAsset({
          rootDir: fixture.rootDir,
          projectId: fixture.projectId,
          receiptPath: fixture.receiptPath,
          role: "scene-visual",
          syncCatalog: fixture.syncCatalog,
        }),
      );
      await assert.rejects(
        readFile(
          join(
            fixture.rootDir,
            "src/projects/story-example/assets.manifest.json",
          ),
        ),
      );
    });
  }
});

test("rejects traversal absolute escape symlink non-regular source and post-freeze import", async (context) => {
  const traversal = await createFixture(context);
  await writeFile(
    traversal.receiptPath,
    `${JSON.stringify(receiptFor({ file: { ...receiptFor().file, relativePath: "../original.png" } }))}\n`,
  );
  await assert.rejects(() =>
    importProjectAsset({
      rootDir: traversal.rootDir,
      projectId: traversal.projectId,
      receiptPath: traversal.receiptPath,
      role: "scene-visual",
      syncCatalog: traversal.syncCatalog,
    }),
  );

  const absolute = await createFixture(context);
  await writeFile(
    absolute.receiptPath,
    `${JSON.stringify(receiptFor({ file: { ...receiptFor().file, relativePath: join(absolute.rootDir, "outside.png") } }))}\n`,
  );
  await assert.rejects(() =>
    importProjectAsset({
      rootDir: absolute.rootDir,
      projectId: absolute.projectId,
      receiptPath: absolute.receiptPath,
      role: "scene-visual",
      syncCatalog: absolute.syncCatalog,
    }),
  );

  const linked = await createFixture(context);
  await rm(join(linked.candidateDir, "original.png"));
  await symlink("/dev/null", join(linked.candidateDir, "original.png"));
  await assert.rejects(() =>
    importProjectAsset({
      rootDir: linked.rootDir,
      projectId: linked.projectId,
      receiptPath: linked.receiptPath,
      role: "scene-visual",
      syncCatalog: linked.syncCatalog,
    }),
  );

  const linkedReceipt = await createFixture(context);
  const receiptTarget = join(linkedReceipt.candidateDir, "receipt-target.json");
  await writeFile(receiptTarget, `${JSON.stringify(receiptFor())}\n`);
  await rm(linkedReceipt.receiptPath);
  await symlink(receiptTarget, linkedReceipt.receiptPath);
  await assert.rejects(() =>
    importProjectAsset({
      rootDir: linkedReceipt.rootDir,
      projectId: linkedReceipt.projectId,
      receiptPath: linkedReceipt.receiptPath,
      role: "scene-visual",
      syncCatalog: linkedReceipt.syncCatalog,
    }),
  );

  const linkedPublicParent = await createFixture(context);
  const outside = await mkdtemp(join(tmpdir(), "rsp-project-asset-outside-"));
  context.after(() => rm(outside, { recursive: true, force: true }));
  await mkdir(join(linkedPublicParent.rootDir, "public/projects"), {
    recursive: true,
  });
  await symlink(
    outside,
    join(linkedPublicParent.rootDir, "public/projects/story-example"),
    "dir",
  );
  await assert.rejects(() =>
    importProjectAsset({
      rootDir: linkedPublicParent.rootDir,
      projectId: linkedPublicParent.projectId,
      receiptPath: linkedPublicParent.receiptPath,
      role: "scene-visual",
      syncCatalog: linkedPublicParent.syncCatalog,
    }),
  );

  const directory = await createFixture(context);
  await rm(join(directory.candidateDir, "original.png"));
  await mkdir(join(directory.candidateDir, "original.png"));
  await assert.rejects(() =>
    importProjectAsset({
      rootDir: directory.rootDir,
      projectId: directory.projectId,
      receiptPath: directory.receiptPath,
      role: "scene-visual",
      syncCatalog: directory.syncCatalog,
    }),
  );

  const frozen = await createFixture(context);
  await mkdir(
    join(
      frozen.rootDir,
      "src/projects/story-example/production/scene-assignments",
    ),
    { recursive: true },
  );
  await writeFile(
    join(
      frozen.rootDir,
      "src/projects/story-example/production/scene-assignments/opening.generated.json",
    ),
    "{}",
  );
  await assert.rejects(
    () =>
      importProjectAsset({
        rootDir: frozen.rootDir,
        projectId: frozen.projectId,
        receiptPath: frozen.receiptPath,
        role: "scene-visual",
        syncCatalog: frozen.syncCatalog,
      }),
    /freeze|frozen/iu,
  );
});

test("same Resource ID receipt or file drift fails closed without overwrite", async (context) => {
  const fixture = await createFixture(context);
  const imported = await importProjectAsset({
    rootDir: fixture.rootDir,
    projectId: fixture.projectId,
    receiptPath: fixture.receiptPath,
    role: "scene-visual",
    syncCatalog: fixture.syncCatalog,
  });
  const publishedBefore = await readFile(
    join(fixture.rootDir, imported.publicPath),
  );
  await writeFile(
    fixture.receiptPath,
    `${JSON.stringify(
      receiptFor({
        providerPolicy: {
          attributionRequired: true,
          attributionText: "Photo by Drifted Photographer on Pexels",
        },
      }),
    )}\n`,
  );
  await assert.rejects(() =>
    importProjectAsset({
      rootDir: fixture.rootDir,
      projectId: fixture.projectId,
      receiptPath: fixture.receiptPath,
      role: "scene-visual",
      syncCatalog: fixture.syncCatalog,
    }),
  );
  assert.deepEqual(
    await readFile(join(fixture.rootDir, imported.publicPath)),
    publishedBefore,
  );

  const fileDrift = await createFixture(context);
  const fileImported = await importProjectAsset({
    rootDir: fileDrift.rootDir,
    projectId: fileDrift.projectId,
    receiptPath: fileDrift.receiptPath,
    role: "scene-visual",
    syncCatalog: fileDrift.syncCatalog,
  });
  const filePublishedBefore = await readFile(
    join(fileDrift.rootDir, fileImported.publicPath),
  );
  await writeFile(join(fileDrift.candidateDir, "original.png"), "drifted");
  await assert.rejects(() =>
    importProjectAsset({
      rootDir: fileDrift.rootDir,
      projectId: fileDrift.projectId,
      receiptPath: fileDrift.receiptPath,
      role: "scene-visual",
      syncCatalog: fileDrift.syncCatalog,
    }),
  );
  assert.deepEqual(
    await readFile(join(fileDrift.rootDir, fileImported.publicPath)),
    filePublishedBefore,
  );
});
