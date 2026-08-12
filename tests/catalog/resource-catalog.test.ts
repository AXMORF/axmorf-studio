import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { ResourceCatalogSchema } from "../../src/contracts/resource-catalog";
import { capabilityDescriptorDeclarations } from "../../src/remotion/catalog/capability-descriptors";
import { styleDescriptorDeclarations } from "../../src/remotion/catalog/style-descriptors";
import {
  buildResourceCatalog,
  deriveCatalogWithoutProjectOwnedDescriptors,
  queryResourceCatalog,
  renderResourceCatalogJson,
} from "../../scripts/catalog/domain";
import {
  loadCatalogAuthorityDescriptors,
  loadProjectResourceDescriptors,
  validateAssetDescriptorFiles,
  validateCapabilityDescriptorExports,
} from "../../scripts/catalog/project-files";
import {
  generateProjectResourceCatalog,
  generateResourceCatalog,
} from "../../scripts/catalog/generate";

const repositoryRoot = join(import.meta.dirname, "../..");

test("historical catalogs can drop one Project's owned descriptors generically", () => {
  const sharedDescriptor = styleDescriptorDeclarations[0]!;
  const projectDescriptor = {
    ...styleDescriptorDeclarations[1]!,
    id: "style.alpha-story",
    styleProfileId: "alpha-story",
    authority: {
      kind: "repository-file" as const,
      repositoryPath: "src/projects/alpha-story/visual-style.json",
    },
  };
  const catalog = buildResourceCatalog([sharedDescriptor, projectDescriptor]);
  const shared = deriveCatalogWithoutProjectOwnedDescriptors(
    catalog,
    "alpha-story",
  );
  assert.deepEqual(
    shared.entries.map(({ descriptor }) => descriptor.id),
    [sharedDescriptor.id],
  );
});

test("Catalog generation is byte-stable and descriptor order is canonical", async () => {
  const descriptors = await loadCatalogAuthorityDescriptors(repositoryRoot);
  const first = buildResourceCatalog(descriptors);
  const second = buildResourceCatalog([...descriptors].reverse());
  assert.deepEqual(first, second);
  assert.equal(
    renderResourceCatalogJson(first),
    renderResourceCatalogJson(second),
  );
  assert.deepEqual(
    first.entries.map((entry) => entry.descriptor.id),
    [...first.entries.map((entry) => entry.descriptor.id)].sort((left, right) =>
      left.localeCompare(right),
    ),
  );
  assert.equal(
    ResourceCatalogSchema.parse(first).catalogFingerprint,
    first.catalogFingerprint,
  );
});

test("Project resource discovery is removable and never scans orphan public files", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-project-catalog-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const projectId = "alpha-story";
  const manifestPath = `src/projects/${projectId}/resource-catalog.json`;
  const localPath = `public/projects/${projectId}/proof.svg`;
  await mkdir(dirname(join(rootDir, manifestPath)), { recursive: true });
  await mkdir(dirname(join(rootDir, localPath)), { recursive: true });
  await writeFile(join(rootDir, localPath), "<svg/>");
  await writeFile(
    join(rootDir, manifestPath),
    JSON.stringify({
      schemaVersion: 1,
      projectId,
      descriptors: [
        {
          schemaVersion: 1,
          id: "asset.alpha-story-proof",
          kind: "asset",
          status: "approved",
          title: "Alpha proof",
          description: "Project-local removable proof asset",
          useCases: ["project proof"],
          tags: ["alpha-story"],
          authority: { kind: "repository-file", repositoryPath: manifestPath },
          allowedUse: "runtime-approved",
          assetKind: "svg",
          mediaRole: "scene-visual",
          localPath,
          checksum:
            "sha256:d4dc56669143034f31aa309635d4113d9ad76a02b1739da22c965ed2049be9e6",
          license: {
            id: "Project-Authored",
            verificationStatus: "verified",
            sourceUrl: null,
            attributionRequired: false,
            attributionText: null,
            verifiedAt: "2026-08-02T00:00:00.000Z",
            sourceEvidenceFingerprint: `sha256:${"a".repeat(64)}`,
          },
        },
      ],
    }),
  );
  await mkdir(join(rootDir, "public/projects/orphan-story"), {
    recursive: true,
  });
  await writeFile(
    join(rootDir, "public/projects/orphan-story/unlisted.svg"),
    "<svg/>",
  );

  assert.deepEqual(
    (await loadProjectResourceDescriptors(rootDir)).map(({ id }) => id),
    ["asset.alpha-story-proof"],
  );
  await rm(join(rootDir, "src/projects", projectId), { recursive: true });
  assert.deepEqual(await loadProjectResourceDescriptors(rootDir), []);
});

test("shared asset manifest contains no Project-owned public paths", async () => {
  const shared = JSON.parse(
    await readFile(
      join(repositoryRoot, "src/remotion/catalog/assets.manifest.json"),
      "utf8",
    ),
  ) as { assets: readonly { localPath: string }[] };
  assert.ok(
    shared.assets.every(
      ({ localPath }) => !localPath.startsWith("public/projects/"),
    ),
  );
});

test("all six current style profiles and approved capability exports are current", async () => {
  assert.equal(styleDescriptorDeclarations.length, 6);
  assert.deepEqual(
    styleDescriptorDeclarations
      .map((descriptor) => descriptor.styleProfileId)
      .sort(),
    [
      "cinematic-3d",
      "comic-anime",
      "documentary-media",
      "editorial-tech",
      "hand-drawn-explainer",
      "retro-terminal",
    ],
  );
  assert.ok(capabilityDescriptorDeclarations.length >= 8);
  await assert.doesNotReject(() =>
    validateCapabilityDescriptorExports(repositoryRoot, [
      ...styleDescriptorDeclarations,
      ...capabilityDescriptorDeclarations,
    ]),
  );
  await assert.rejects(() =>
    validateCapabilityDescriptorExports(repositoryRoot, [
      { ...capabilityDescriptorDeclarations[0], exportName: "MissingExport" },
    ]),
  );
});

test("Catalog query filters fixed kind tag and locale-independent text in stable order", async () => {
  const catalog = buildResourceCatalog(
    await loadCatalogAuthorityDescriptors(repositoryRoot),
  );
  const results = queryResourceCatalog(catalog, {
    kind: "style-profile",
    tag: null,
    text: "CINEMATIC",
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].descriptor.id, "style.cinematic-3d");
  assert.deepEqual(
    queryResourceCatalog(catalog, { kind: "asset", tag: null, text: "none" }),
    [],
  );
});

test("asset files fail closed on missing checksum escape and symlink", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-catalog-"));
  try {
    const localPath = "public/assets/library/proof.svg";
    await mkdir(dirname(join(rootDir, localPath)), { recursive: true });
    await writeFile(join(rootDir, localPath), "<svg/>", "utf8");
    const base = {
      schemaVersion: 1,
      id: "asset.proof",
      kind: "asset",
      status: "approved",
      title: "Proof",
      description: "Proof visual",
      useCases: ["scene proof"],
      tags: ["proof"],
      authority: {
        kind: "repository-file",
        repositoryPath: "src/remotion/catalog/assets.manifest.json",
      },
      allowedUse: "runtime-approved",
      assetKind: "svg",
      mediaRole: "scene-visual",
      localPath,
      checksum:
        "sha256:d4dc56669143034f31aa309635d4113d9ad76a02b1739da22c965ed2049be9e6",
      license: {
        id: "LicenseRef-Project-Authored",
        verificationStatus: "verified",
        sourceUrl: null,
        attributionRequired: false,
        attributionText: null,
        verifiedAt: "2026-08-02T00:00:00.000Z",
        sourceEvidenceFingerprint: `sha256:${"a".repeat(64)}`,
      },
    } as const;
    await assert.doesNotReject(() =>
      validateAssetDescriptorFiles(rootDir, [base]),
    );
    await assert.rejects(() =>
      validateAssetDescriptorFiles(rootDir, [
        { ...base, checksum: `sha256:${"b".repeat(64)}` },
      ]),
    );
    await rm(join(rootDir, localPath));
    await symlink("/dev/null", join(rootDir, localPath));
    await assert.rejects(() => validateAssetDescriptorFiles(rootDir, [base]));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("generate then check preserves isolated bytes and rejects drift", async (context) => {
  await generateResourceCatalog({ rootDir: repositoryRoot, mode: "check" });
  const descriptors = await loadCatalogAuthorityDescriptors(repositoryRoot);
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-catalog-generate-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const loadDescriptors = async () => descriptors;
  await generateResourceCatalog({
    rootDir,
    mode: "write",
    loadDescriptors,
  });
  const destination = join(
    rootDir,
    "src/remotion/catalog/resource-catalog.generated.json",
  );
  const before = await readFile(destination, "utf8");
  await generateResourceCatalog({ rootDir, mode: "check", loadDescriptors });
  await writeFile(destination, `${before} `, "utf8");
  await assert.rejects(() =>
    generateResourceCatalog({ rootDir, mode: "check", loadDescriptors }),
  );
  await writeFile(destination, before, "utf8");
});

test("Project Catalog generation writes code-led snapshots and checks drift", async (context) => {
  const descriptors = await loadCatalogAuthorityDescriptors(repositoryRoot);
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-project-catalog-generate-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const loadDescriptors = async () => descriptors;
  const generated = await generateProjectResourceCatalog({
    rootDir,
    projectId: "code-led-story",
    mode: "write",
    loadDescriptors,
  });
  const before = await readFile(generated.destination, "utf8");
  const beforeMtime = (await stat(generated.destination)).mtimeMs;

  await generateProjectResourceCatalog({
    rootDir,
    projectId: "code-led-story",
    mode: "check",
    loadDescriptors,
  });
  await generateProjectResourceCatalog({
    rootDir,
    projectId: "code-led-story",
    mode: "write",
    loadDescriptors,
  });
  assert.equal(await readFile(generated.destination, "utf8"), before);
  assert.equal((await stat(generated.destination)).mtimeMs, beforeMtime);

  await writeFile(generated.destination, `${before} `);
  await assert.rejects(
    () =>
      generateProjectResourceCatalog({
        rootDir,
        projectId: "code-led-story",
        mode: "check",
        loadDescriptors,
      }),
    /Project ResourceCatalog drift: generated bytes are stale\./u,
  );
});
