import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { loadExternalReferenceSnapshot } from "../../scripts/external-references/snapshot";
import { canonicalizeVideoShotcraftCard } from "../../scripts/external-references/adapters/video-shotcraft";
import { resolveVideoShotcraftReference } from "../../scripts/external-references/video-shotcraft-resolver";

const repositoryRoot = join(import.meta.dirname, "../..");
const fixtureRoot = join(
  repositoryRoot,
  "tests/fixtures/external-references/video-shotcraft/d4915443232e89527fdc9d7e79f132ba411fc440",
);

test("Shotcraft card and style key uniquely resolve exact card demo preview and closure root", async () => {
  const snapshot = await loadExternalReferenceSnapshot(fixtureRoot);
  const resolved = resolveVideoShotcraftReference(snapshot, {
    cardId: "draw-svg-trace",
    styleKey: "draw-svg-trace",
  });
  assert.equal(
    resolved.cardDocumentPath,
    "references/shots/ui-entrance/draw-svg-trace.md",
  );
  assert.equal(
    resolved.demoSourcePath,
    "demos/ui-entrance/draw-svg-trace/DrawSvgTrace.tsx",
  );
  assert.equal(resolved.previewPath, "gallery/media/draw-svg-trace.mp4");
  assert.equal(resolved.closureRoot, "demos/ui-entrance/draw-svg-trace");
  assert.ok(resolved.previewChecksum.startsWith("sha256:"));
  assert.throws(() =>
    resolveVideoShotcraftReference(snapshot, {
      cardId: "draw-svg-trace",
      styleKey: "wrong",
    }),
  );
});

test("generatedAt and media cache query do not enter immutable production identity", async () => {
  const source = JSON.parse(
    await readFile(
      join(fixtureRoot, "gallery/api/library.draw-svg-trace.json"),
      "utf8",
    ),
  ) as Record<string, unknown>;
  const changed = {
    ...source,
    generatedAt: "2099-01-01T00:00:00.000Z",
    cards: [
      {
        ...(source.cards as readonly Record<string, unknown>[])[0],
        styles: [
          {
            ...(
              (source.cards as readonly Record<string, unknown>[])[0]
                .styles as readonly Record<string, unknown>[]
            )[0],
            media: {
              url: "./media/draw-svg-trace.mp4?v=floating-value",
              type: "mp4",
            },
          },
        ],
      },
    ],
  };
  const original = await loadExternalReferenceSnapshot(fixtureRoot);
  const canonical = canonicalizeVideoShotcraftCard({
    library: changed,
    cardDocument: await readFile(
      join(fixtureRoot, original.index.cards[0].cardDocumentPath),
      "utf8",
    ),
    cardId: "draw-svg-trace",
    styleKey: "draw-svg-trace",
    cardDocumentChecksum: original.index.cards[0].cardDocumentChecksum,
    demoSourceChecksum: original.index.cards[0].demoSourceChecksum,
    previewChecksum: original.index.cards[0].previewChecksum,
  });
  assert.deepEqual(canonical, original.index.cards[0]);
});

test("adapter accepts an explicitly mapped non-fixture card and style", async () => {
  const original = await loadExternalReferenceSnapshot(fixtureRoot);
  const source = JSON.parse(
    await readFile(
      join(fixtureRoot, "gallery/api/library.draw-svg-trace.json"),
      "utf8",
    ),
  ) as Record<string, unknown>;
  const card = (source.cards as readonly Record<string, unknown>[])[0];
  const style = (card.styles as readonly Record<string, unknown>[])[0];
  const generalized = canonicalizeVideoShotcraftCard({
    library: {
      ...source,
      cards: [
        {
          ...card,
          name: "panel-reveal",
          category: "transition",
          styles: [
            {
              ...style,
              key: "vertical-comic",
              media: { url: "./media/vertical-comic.mp4", type: "mp4" },
            },
          ],
        },
      ],
    },
    cardDocument: await readFile(
      join(fixtureRoot, original.index.cards[0].cardDocumentPath),
      "utf8",
    ),
    cardId: "panel-reveal",
    styleKey: "vertical-comic",
    cardDocumentChecksum: original.index.cards[0].cardDocumentChecksum,
    demoSourceChecksum: original.index.cards[0].demoSourceChecksum,
    previewChecksum: original.index.cards[0].previewChecksum,
  });
  assert.equal(generalized.cardId, "panel-reveal");
  assert.equal(generalized.styleKey, "vertical-comic");
  assert.equal(generalized.category, "transition");
  assert.equal(generalized.previewPath, "gallery/media/vertical-comic.mp4");
});

test("resolver fails closed on duplicate entry missing preview authorization or inaccurate demo", async () => {
  const snapshot = await loadExternalReferenceSnapshot(fixtureRoot);
  assert.throws(() =>
    resolveVideoShotcraftReference(
      {
        ...snapshot,
        index: { cards: [snapshot.index.cards[0], snapshot.index.cards[0]] },
      },
      { cardId: "draw-svg-trace", styleKey: "draw-svg-trace" },
    ),
  );
  assert.throws(() =>
    resolveVideoShotcraftReference(
      {
        ...snapshot,
        previewMediaLicense: {
          ...snapshot.previewMediaLicense,
          verificationStatus: "unknown",
        },
      },
      { cardId: "draw-svg-trace", styleKey: "draw-svg-trace" },
    ),
  );
  assert.throws(() =>
    resolveVideoShotcraftReference(
      {
        ...snapshot,
        index: {
          cards: [{ ...snapshot.index.cards[0], exactDemoDeclared: false }],
        },
      },
      { cardId: "draw-svg-trace", styleKey: "draw-svg-trace" },
    ),
  );
});
