import assert from "node:assert/strict";
import {mkdtemp, mkdir, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";

import {ResourceCatalogSchema} from "../../src/contracts";
import {
  validateComicDesignSystem,
  validateProjectResourceOverlay,
} from "../../scripts/m9-product/comic-design-system";

const design = () => ({
  schemaVersion: 1,
  canvas: {width: 1080, height: 1920, safeInset: 72},
  palette: {
    ink: "#171717",
    paper: "#f7f1df",
    accent: "#f05b3d",
    support: "#3b78cc",
    muted: "#c9c0aa",
  },
  typography: {
    displayFamily: "system-ui",
    bodyFamily: "system-ui",
    minimumReadablePx: 36,
  },
  panels: {
    gutterPx: 24,
    borderPx: 6,
    radiusPx: 18,
    readingOrder: "top-to-bottom",
  },
  motion: {
    source: "remotion-frame-api",
    allowedPrimitives: ["interpolate", "spring", "Sequence"],
    cssAnimation: false,
    cssTransition: false,
  },
  captions: {
    owner: "CaptionLayer",
    band: {top: 1490, bottom: 1810},
    visualExclusionZone: {top: 1470, bottom: 1830},
  },
  grammar: {
    devices: ["panel", "gutter", "speed-line", "screentone", "impact-frame"],
    maxSimultaneousPanels: 3,
    automaticLayout: false,
    sceneDsl: false,
    automaticDirector: false,
  },
});
const repositoryRoot = join(import.meta.dirname, "../..");

test("comic system fixes portrait tokens and reserves the CaptionLayer band", () => {
  assert.doesNotThrow(() => validateComicDesignSystem(design()));
  assert.throws(() =>
    validateComicDesignSystem({...design(), palette: {...design().palette, accent: undefined}}),
  );
  assert.throws(() =>
    validateComicDesignSystem({
      ...design(),
      captions: {...design().captions, visualExclusionZone: {top: 1600, bottom: 1700}},
    }),
  );
});

test("comic system rejects layout DSL, automatic directing and CSS animation declarations", () => {
  for (const mutation of [
    {...design(), grammar: {...design().grammar, automaticLayout: true}},
    {...design(), grammar: {...design().grammar, sceneDsl: true}},
    {...design(), grammar: {...design().grammar, automaticDirector: true}},
    {...design(), motion: {...design().motion, cssAnimation: true}},
    {...design(), ["trans" + "ition"]: "opacity 300ms ease"},
  ]) {
    assert.throws(() => validateComicDesignSystem(mutation));
  }
});

test("project resource overlay binds regular product assets to checksum permission and Catalog identity", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-m9-resource-"));
  try {
    const localPath = "public/projects/product-comic-vertical/product-assets/proof.svg";
    await mkdir(join(rootDir, "public/projects/product-comic-vertical/product-assets"), {
      recursive: true,
    });
    await writeFile(join(rootDir, localPath), "<svg/>\n", "utf8");
    const overlay = {
      schemaVersion: 1,
      projectId: "product-comic-vertical",
      baseCatalogFingerprint: `sha256:${"a".repeat(64)}`,
      entries: [
        {
          id: "asset.product-comic-vertical.proof",
          kind: "asset",
          localPath,
          checksum:
            "sha256:cd1fafe3cc7f06f55ead3f0dce39300aca7a8911793e76fcdd327799c0709ac2",
          permission: "project-authored",
          license: {id: "LicenseRef-Project-Authored", status: "verified"},
          catalogIdentity: "asset.product-comic-vertical.proof",
        },
      ],
    };
    await assert.doesNotReject(() => validateProjectResourceOverlay({rootDir, overlay}));
    await assert.rejects(() =>
      validateProjectResourceOverlay({
        rootDir,
        overlay: {
          ...overlay,
          entries: [{...overlay.entries[0], checksum: `sha256:${"b".repeat(64)}`}],
        },
      }),
    );
  } finally {
    await rm(rootDir, {recursive: true, force: true});
  }
});

test("committed comic system and project authoring Catalog are current", async () => {
  const projectRoot = join(
    repositoryRoot,
    "src/projects/product-comic-vertical",
  );
  const [designBytes, overlayBytes, catalogBytes] = await Promise.all([
    readFile(join(projectRoot, "comic-design-system.json"), "utf8"),
    readFile(join(projectRoot, "resource-catalog.json"), "utf8"),
    readFile(join(projectRoot, "generated/resource-catalog.generated.json"), "utf8"),
  ]);
  assert.doesNotThrow(() => validateComicDesignSystem(JSON.parse(designBytes)));
  await assert.doesNotReject(() =>
    validateProjectResourceOverlay({
      rootDir: repositoryRoot,
      overlay: JSON.parse(overlayBytes),
    }),
  );
  const catalog = ResourceCatalogSchema.parse(JSON.parse(catalogBytes));
  assert.equal(
    catalog.entries.filter((entry) =>
      entry.descriptor.id.startsWith("reference.product-comic-vertical"),
    ).length,
    3,
  );
});
