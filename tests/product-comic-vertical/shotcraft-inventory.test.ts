import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  computeShotcraftFingerprint,
  validateCoverageDocument,
  validateInventoryDocument,
  validateTask5Staging,
} from "../../scripts/project-tools/product-comic-vertical/shotcraft-inventory";

const digest = (character: string) => `sha256:${character.repeat(64)}`;
const repositoryRoot = join(import.meta.dirname, "../..");

const inventoryItem = (overrides: Record<string, unknown> = {}) => ({
  sourceRepository: "https://github.com/Vincentwei1021/video-shotcraft.git",
  sourceCommit: "d4915443232e89527fdc9d7e79f132ba411fc440",
  libraryRevision: "gallery-library-v3",
  category: "ui-entrance",
  cardName: "draw-svg-trace",
  cardPath: "references/shots/ui-entrance/draw-svg-trace.md",
  cardChecksum: digest("a"),
  recipeChecksum: digest("b"),
  parametersChecksum: digest("c"),
  pitfallsChecksum: digest("d"),
  styleKey: "draw-svg-trace",
  styleLabel: "draw-svg-trace",
  styleDescription: "Draws a product outline in three readable phases.",
  preview: {
    releaseAssetUrl:
      "https://github.com/Vincentwei1021/video-shotcraft/releases/download/gallery-media/draw-svg-trace.mp4",
    evidencePath: "gallery/media/draw-svg-trace.mp4",
    checksum: digest("e"),
    width: 1920,
    height: 1080,
    fpsNumerator: 30,
    fpsDenominator: 1,
    frames: 120,
    codec: "h264",
    completeDecode: true,
  },
  exactDemo: {
    status: "resolved",
    entryPath: "demos/ui-entrance/draw-svg-trace/DrawSvgTrace.tsx",
    closureRoot: "demos",
    relativeImports: ["demos/_fixtures/Fixtures.tsx"],
    barePackages: [
      { packageName: "react", exactVersion: "19.2.3" },
      { packageName: "remotion", exactVersion: "4.0.489" },
    ],
    localAssets: [],
    sourceFiles: [
      {
        path: "demos/ui-entrance/draw-svg-trace/DrawSvgTrace.tsx",
        checksum: digest("f"),
      },
      { path: "demos/_fixtures/Fixtures.tsx", checksum: digest("0") },
    ],
  },
  licenses: {
    sourceCode: { id: "Apache-2.0", status: "verified" },
    preview: { id: "upstream-demo-render-evidence-only", status: "verified" },
    media: { status: "not-used" },
    fonts: { status: "not-used" },
    audio: { status: "not-used" },
  },
  ...overrides,
});

const inventory = (items = [inventoryItem()]) => {
  const input = {
    schemaVersion: 1,
    generatorId: "m9-shotcraft-inventory-v1",
    expected: { cards: 1, styles: 1, previews: 1 },
    items,
  };
  return {
    ...input,
    inventoryFingerprint: computeShotcraftFingerprint("inventory", input),
  };
};

const coverage = (items: readonly unknown[]) => {
  const input = {
    schemaVersion: 1,
    inventoryFingerprint: inventory().inventoryFingerprint,
    expected: { cards: 1, styles: 1, previews: 1 },
    items,
  };
  return {
    ...input,
    coverageFingerprint: computeShotcraftFingerprint("coverage", input),
  };
};

const coverageItem = (overrides: Record<string, unknown> = {}) => ({
  cardName: "draw-svg-trace",
  styleKey: "draw-svg-trace",
  applicability: "strong",
  beatFunctions: ["product-reveal"],
  verticalRisk: "Landscape demo must be reblocked into one portrait panel.",
  decision: "selected-exact",
  reason:
    "The three-stage line reveal makes the product boundary legible without inventing a feature.",
  exactEligibility: true,
  selection: {
    meaningId: "product-reveal",
    frameWindow: { start: 10, endExclusive: 100 },
    recognizabilityTarget:
      "At normal speed the outline, fill and settled product card remain individually visible.",
  },
  ...overrides,
});

test("inventory fails closed on count, duplicate identity, preview and checksum drift", () => {
  assert.doesNotThrow(() => validateInventoryDocument(inventory()));
  assert.throws(() =>
    validateInventoryDocument(
      inventory([inventoryItem(), inventoryItem({ styleKey: "duplicate" })]),
    ),
  );
  assert.throws(() =>
    validateInventoryDocument(
      inventory([
        inventoryItem({ styleKey: "draw-svg-trace" }),
        inventoryItem(),
      ]),
    ),
  );
  assert.throws(() =>
    validateInventoryDocument(inventory([inventoryItem({ preview: null })])),
  );
  assert.throws(() =>
    validateInventoryDocument({
      ...inventory(),
      inventoryFingerprint: digest("9"),
    }),
  );
});

test("inventory distinguishes library revision from commit and models demo resolution modes", () => {
  assert.throws(() =>
    validateInventoryDocument(
      inventory([
        inventoryItem({
          libraryRevision: "d4915443232e89527fdc9d7e79f132ba411fc440",
        }),
      ]),
    ),
  );
  for (const status of ["ambiguous", "missing", "special-template"] as const) {
    const exactDemo = {
      ...inventoryItem().exactDemo,
      status,
      entryPath:
        status === "missing" ? null : inventoryItem().exactDemo.entryPath,
    };
    assert.doesNotThrow(() =>
      validateInventoryDocument(inventory([inventoryItem({ exactDemo })])),
    );
  }
});

test("inventory rejects unsafe closure paths, unversioned packages and missing license records", () => {
  const base = inventoryItem().exactDemo;
  for (const exactDemo of [
    { ...base, relativeImports: ["https://example.invalid/x.tsx"] },
    { ...base, relativeImports: ["../escape.tsx"] },
    { ...base, relativeImports: ["demos/dynamic/${name}.tsx"] },
    {
      ...base,
      barePackages: [{ packageName: "react", exactVersion: "latest" }],
    },
  ]) {
    assert.throws(() =>
      validateInventoryDocument(inventory([inventoryItem({ exactDemo })])),
    );
  }
  const incompleteLicenses: Record<string, unknown> = {
    ...inventoryItem().licenses,
  };
  delete incompleteLicenses.audio;
  assert.throws(() =>
    validateInventoryDocument(
      inventory([inventoryItem({ licenses: incompleteLicenses })]),
    ),
  );
});

test("coverage requires complete decisions, substantive reasons and unique exact Scene binding", () => {
  assert.doesNotThrow(() =>
    validateCoverageDocument(coverage([coverageItem()]), inventory()),
  );
  for (const mutation of [
    coverageItem({ reason: "没用到" }),
    coverageItem({ decision: "undecided" }),
    coverageItem({ selection: null }),
    coverageItem({ exactEligibility: false }),
  ]) {
    assert.throws(() =>
      validateCoverageDocument(coverage([mutation]), inventory()),
    );
  }
  const second = inventoryItem({ styleKey: "second-style" });
  const twoInventory = inventory([inventoryItem(), second]);
  const rawCoverage = coverage([
    coverageItem(),
    coverageItem({ styleKey: "second-style" }),
  ]);
  assert.throws(() => validateCoverageDocument(rawCoverage, twoInventory));
});

test("selected exact staging proves every localized closure path exists as a regular file", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-m9-staging-"));
  try {
    const destination =
      "src/projects/product-comic-vertical/scenes/product-reveal/reference/DrawSvgTrace.tsx";
    await mkdir(
      join(
        rootDir,
        "src/projects/product-comic-vertical/scenes/product-reveal/reference",
      ),
      {
        recursive: true,
      },
    );
    await writeFile(
      join(rootDir, destination),
      "export const proof = true;\n",
      "utf8",
    );
    const stagingInput = {
      schemaVersion: 1,
      selectedExact: [
        {
          meaningId: "product-reveal",
          cardName: "draw-svg-trace",
          styleKey: "draw-svg-trace",
          destinations: [destination],
        },
      ],
    };
    const staging = {
      ...stagingInput,
      stagingFingerprint: computeShotcraftFingerprint(
        "task-5-staging",
        stagingInput,
      ),
    };
    await assert.doesNotReject(() =>
      validateTask5Staging({ rootDir, staging }),
    );
    await rm(join(rootDir, destination));
    await assert.rejects(() => validateTask5Staging({ rootDir, staging }));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("committed M9 inventory covers the frozen 104/161/161 corpus and exact selection closure", async () => {
  const referenceRoot = join(
    repositoryRoot,
    "src/projects/product-comic-vertical/references/video-shotcraft",
  );
  const [rawInventory, rawCoverage, receipt, staging] = await Promise.all([
    readFile(join(referenceRoot, "shot-inventory.generated.json"), "utf8"),
    readFile(join(referenceRoot, "shot-coverage.json"), "utf8"),
    readFile(join(referenceRoot, "upstream-receipt.generated.json"), "utf8"),
    readFile(
      join(
        repositoryRoot,
        "src/projects/product-comic-vertical/generated/task-5-staging.generated.json",
      ),
      "utf8",
    ),
  ]);
  const currentInventory = validateInventoryDocument(JSON.parse(rawInventory));
  const currentCoverage = validateCoverageDocument(
    JSON.parse(rawCoverage),
    currentInventory,
  );
  assert.deepEqual(currentInventory.expected, {
    cards: 104,
    previews: 161,
    styles: 161,
  });
  assert.equal(currentCoverage.items.length, 161);
  assert.equal(
    currentCoverage.items.filter((item) => item.decision === "selected-exact")
      .length,
    1,
  );
  const parsedReceipt = JSON.parse(receipt) as {
    previews: Record<string, unknown>;
  };
  assert.deepEqual(parsedReceipt.previews, {
    bytes: 99_920_525,
    codec: "h264",
    completeDecodeCount: 161,
    dimensions: { "1920x1080": 150, "960x540": 11 },
    durationSeconds: 744,
    fps: 30,
    frames: 22_320,
    maximumFrames: 200,
    minimumFrames: 43,
  });
  await assert.doesNotReject(() =>
    validateTask5Staging({
      rootDir: repositoryRoot,
      staging: JSON.parse(staging),
    }),
  );
});
