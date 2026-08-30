import assert from "node:assert/strict";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  buildReferenceFidelityEvidence,
  buildShotRecipeSelection,
} from "@axmorf/studio/contracts";
import {
  buildDependencyClosure,
  readExactDependencyAllowlist,
} from "../../scripts/external-references/dependency-closure";
import {
  generateReferenceFidelityReceipt,
  writeReferenceFidelityReceiptAtomic,
} from "../../scripts/external-references/fidelity";
import { localizeShotRecipeClosure } from "../../scripts/external-references/localize";
import { checksumExternalBytes } from "../../scripts/external-references/project-files";
import { loadExternalReferenceSnapshot } from "../../scripts/external-references/snapshot";

const repositoryRoot = join(import.meta.dirname, "../..");
const fixtureRoot = join(
  repositoryRoot,
  "tests/fixtures/external-references/video-shotcraft/d4915443232e89527fdc9d7e79f132ba411fc440",
);

const write = async (root: string, path: string, contents: string) => {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), contents, "utf8");
  return `sha256:${checksumExternalBytes(Buffer.from(contents)).slice(7)}`;
};

const prepare = async (temporaryRoot: string) => {
  const snapshot = await loadExternalReferenceSnapshot(fixtureRoot);
  const closure = await buildDependencyClosure({
    snapshotRoot: fixtureRoot,
    entryPath: snapshot.index.cards[0].demoSourcePath,
    allowlist: await readExactDependencyAllowlist(repositoryRoot),
  });
  const localization = await localizeShotRecipeClosure({
    repositoryRoot: temporaryRoot,
    snapshotRoot: fixtureRoot,
    snapshot,
    closure,
    projectId: "synthetic-proof",
    meaningId: "meaning-one",
    cardId: "draw-svg-trace",
  });
  const rendererPath =
    "src/projects/synthetic-proof/scenes/meaning-one/Renderer.tsx";
  const adaptedShotPath =
    "src/projects/synthetic-proof/scenes/meaning-one/shots/DrawSvgTraceShot.tsx";
  const rendererSource = `
    import {DrawSvgTraceShot} from "./shots/DrawSvgTraceShot";
    export const Renderer = ({sceneFrame}: {sceneFrame: number}) => {
      const shotFrame = sceneFrame - 8;
      return <DrawSvgTraceShot shotFrame={shotFrame} />;
    };
  `;
  const adaptedShotSource = `
    export const DrawSvgTraceShot = ({shotFrame}: {shotFrame: number}) =>
      <svg><rect strokeDashoffset={1 - shotFrame / 40} /></svg>;
  `;
  await write(temporaryRoot, rendererPath, rendererSource);
  await write(temporaryRoot, adaptedShotPath, adaptedShotSource);

  const evidenceFiles = [
    ["evidence/source-early.png", "source early"],
    ["evidence/adaptation-early.png", "adaptation early"],
    ["evidence/source-late.png", "source late"],
    ["evidence/adaptation-late.png", "adaptation late"],
    ["evidence/adaptation-preview.mp4", "adaptation normal speed preview"],
  ] as const;
  const checksums = new Map<string, string>();
  for (const [path, contents] of evidenceFiles) {
    checksums.set(path, await write(temporaryRoot, path, contents));
  }
  const card = snapshot.index.cards[0];
  await mkdir(join(temporaryRoot, "evidence"), { recursive: true });
  await cp(
    join(fixtureRoot, card.previewPath),
    join(temporaryRoot, "evidence/source-preview.mp4"),
  );
  checksums.set("evidence/source-preview.mp4", card.previewChecksum);
  const selection = buildShotRecipeSelection({
    taskInputFingerprint: `sha256:${"a".repeat(64)}`,
    selections: [
      {
        mode: "exact-demo-localized",
        sourceId: snapshot.sourceId,
        snapshotFingerprint: snapshot.snapshotFingerprint,
        cardId: card.cardId,
        styleKey: card.styleKey,
        cardFingerprint: card.cardFingerprint,
        styleFingerprint: card.styleFingerprint,
        cardDocumentChecksum: card.cardDocumentChecksum,
        demoSourceChecksum: card.demoSourceChecksum,
        previewChecksum: card.previewChecksum,
        closureFingerprint: closure.closureFingerprint,
        localizationFingerprint: localization.localizationFingerprint,
        adaptationMode: "adapted",
        selectionReason: "Use the visible tracing handoff in the proof.",
        requiredTraits: ["closed outline handoff", "visible moving pen"],
      },
    ],
  });
  const evidence = buildReferenceFidelityEvidence({
    selectionFingerprint: selection.selectionFingerprint,
    items: [
      {
        selectionIndex: 0,
        normalizedFps: 30,
        sourceDurationInFrames: 141,
        adaptationDurationInFrames: 120,
        sourcePreview: {
          artifactPath: "evidence/source-preview.mp4",
          checksum: checksums.get("evidence/source-preview.mp4"),
        },
        adaptationPreview: {
          artifactPath: "evidence/adaptation-preview.mp4",
          checksum: checksums.get("evidence/adaptation-preview.mp4"),
        },
        phasePairs: [
          {
            normalizedPhase: 0.2,
            sourceFrame: 28,
            adaptationFrame: 24,
            sourceEvidence: {
              artifactPath: "evidence/source-early.png",
              checksum: checksums.get("evidence/source-early.png"),
            },
            adaptationEvidence: {
              artifactPath: "evidence/adaptation-early.png",
              checksum: checksums.get("evidence/adaptation-early.png"),
            },
          },
          {
            normalizedPhase: 0.7,
            sourceFrame: 98,
            adaptationFrame: 84,
            sourceEvidence: {
              artifactPath: "evidence/source-late.png",
              checksum: checksums.get("evidence/source-late.png"),
            },
            adaptationEvidence: {
              artifactPath: "evidence/adaptation-late.png",
              checksum: checksums.get("evidence/adaptation-late.png"),
            },
          },
        ],
      },
    ],
  });
  return {
    snapshot,
    closure,
    localization,
    selection,
    evidence,
    rendererPath,
    rendererSource,
    adaptedShotPath,
    adaptedShotSource,
  };
};

test("fidelity receipt binds Renderer frame flow localized bytes licenses and mechanical evidence", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "rsp-fidelity-"));
  try {
    const input = await prepare(temporaryRoot);
    const receipt = await generateReferenceFidelityReceipt({
      repositoryRoot: temporaryRoot,
      ...input,
    });
    assert.equal(receipt.status, "pass");
    assert.equal(receipt.items[0].rendererBinding.frameProp, "shotFrame");
    assert.equal(receipt.items[0].localizedSourceChecksums.length, 2);
    const destination = join(temporaryRoot, "evidence/receipt.json");
    await writeReferenceFidelityReceiptAtomic({ destination, receipt });
    const before = await readFile(destination, "utf8");
    await assert.rejects(() =>
      writeReferenceFidelityReceiptAtomic({
        destination,
        receipt: { ...receipt, receiptFingerprint: `sha256:${"0".repeat(64)}` },
      }),
    );
    assert.equal(await readFile(destination, "utf8"), before);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("metadata-only orphan static or stale evidence cannot produce fidelity pass", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "rsp-fidelity-fail-"));
  try {
    const input = await prepare(temporaryRoot);
    for (const rendererSource of [
      `import {DrawSvgTraceShot} from "./shots/DrawSvgTraceShot"; export const Renderer=({sceneFrame}:{sceneFrame:number}) => <div data-frame={sceneFrame} />;`,
      `import {DrawSvgTraceShot} from "./shots/DrawSvgTraceShot"; export const Renderer=() => <DrawSvgTraceShot shotFrame={0} />;`,
    ]) {
      await writeFile(
        join(temporaryRoot, input.rendererPath),
        rendererSource,
        "utf8",
      );
      await assert.rejects(() =>
        generateReferenceFidelityReceipt({
          repositoryRoot: temporaryRoot,
          ...input,
          rendererSource,
        }),
      );
    }
    await writeFile(
      join(temporaryRoot, input.rendererPath),
      input.rendererSource,
      "utf8",
    );
    const staticShot = `export const DrawSvgTraceShot=({shotFrame}:{shotFrame:number}) => <div>static</div>;`;
    await writeFile(
      join(temporaryRoot, input.adaptedShotPath),
      staticShot,
      "utf8",
    );
    await assert.rejects(() =>
      generateReferenceFidelityReceipt({
        repositoryRoot: temporaryRoot,
        ...input,
        adaptedShotSource: staticShot,
      }),
    );
    await writeFile(
      join(temporaryRoot, input.adaptedShotPath),
      input.adaptedShotSource,
      "utf8",
    );
    await writeFile(
      join(temporaryRoot, "evidence/adaptation-late.png"),
      "changed",
      "utf8",
    );
    await assert.rejects(() =>
      generateReferenceFidelityReceipt({
        repositoryRoot: temporaryRoot,
        ...input,
      }),
    );
    await assert.rejects(() =>
      stat(join(temporaryRoot, "evidence/receipt.json")),
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
