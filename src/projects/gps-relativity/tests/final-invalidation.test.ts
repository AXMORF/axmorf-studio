import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { FinalPreviewEvidenceSchema } from "../../../contracts";
import { checksumExternalBytes } from "../../../../scripts/external-references/project-files";
import {
  M8_CONTACT_SHEET_PATH,
  M8_FINAL_PREVIEW_PATH,
  assertM8MasteringMeasurements,
  inspectM8FinalPreviewTechnical,
  validateM8FinalAssemblyReview,
  writeM8FinalPreviewEvidenceArtifact,
} from "../tools/verification/final-evidence";
import { freezeGpsM8Inputs } from "../tools/verification/final-inputs";

const rootDir = join(import.meta.dirname, "../../../..");
const evidencePath = join(
  rootDir,
  "src/projects/gps-relativity/generated/m8-final-preview-evidence.generated.json",
);
const reviewPath = join(
  rootDir,
  "src/projects/gps-relativity/reviews/m8-final-assembly-review.json",
);
const sha = (value: string) => `sha256:${value.repeat(64)}`;
const execFileAsync = promisify(execFile);

test("preview media measurements review and assembly drift invalidate evidence", async () => {
  const evidence = FinalPreviewEvidenceSchema.parse(
    JSON.parse(await readFile(evidencePath, "utf8")),
  );
  const mutations = [
    {
      ...evidence,
      media: {
        ...evidence.media,
        fullPreview: { ...evidence.media.fullPreview, checksum: sha("a") },
      },
    },
    {
      ...evidence,
      media: {
        ...evidence.media,
        contactSheet: { ...evidence.media.contactSheet, checksum: sha("b") },
      },
    },
    {
      ...evidence,
      media: {
        ...evidence.media,
        representativeStills: evidence.media.representativeStills.map(
          (still, index) =>
            index === 0 ? { ...still, checksum: sha("c") } : still,
        ),
      },
    },
    { ...evidence, reviewFingerprint: sha("d") },
    {
      ...evidence,
      technical: { ...evidence.technical, frameCount: 1730 },
    },
    {
      ...evidence,
      technical: { ...evidence.technical, integratedLoudnessLufs: -25 },
    },
    {
      ...evidence,
      technical: { ...evidence.technical, truePeakDbtp: -0.5 },
    },
    {
      ...evidence,
      technical: {
        ...evidence.technical,
        duckingEvidenceFingerprint: sha("e"),
      },
    },
    { ...evidence, finalAssemblyFingerprint: sha("f") },
    { ...evidence, resourceCatalogFingerprint: sha("0") },
  ];
  for (const mutation of mutations) {
    assert.throws(() => FinalPreviewEvidenceSchema.parse(mutation));
  }
});

test("single-byte MP4 still and contact-sheet drift changes every persisted checksum", async () => {
  const evidence = FinalPreviewEvidenceSchema.parse(
    JSON.parse(await readFile(evidencePath, "utf8")),
  );
  const paths = [
    [M8_FINAL_PREVIEW_PATH, evidence.media.fullPreview.checksum],
    [M8_CONTACT_SHEET_PATH, evidence.media.contactSheet.checksum],
    [
      evidence.media.representativeStills[0].relativePath,
      evidence.media.representativeStills[0].checksum,
    ],
  ] as const;
  for (const [relativePath, expectedChecksum] of paths) {
    const bytes = await readFile(join(rootDir, relativePath));
    bytes[Math.floor(bytes.length / 2)] =
      (bytes[Math.floor(bytes.length / 2)] ?? 0) ^ 0xff;
    assert.notEqual(checksumExternalBytes(bytes), expectedChecksum);
  }
});

test("probe and decode reject truncate frame-count missing-audio and channel-rate drift", async () => {
  const frozen = await freezeGpsM8Inputs({ rootDir, mode: "check" });
  const source = join(rootDir, M8_FINAL_PREVIEW_PATH);
  const mutations: readonly {
    readonly name: string;
    readonly mutate: (fixtureRoot: string) => Promise<void>;
  }[] = [
    {
      name: "truncated media body",
      mutate: async (fixtureRoot) => {
        const bytes = await readFile(source);
        await writeFile(
          join(fixtureRoot, M8_FINAL_PREVIEW_PATH),
          Uint8Array.from(
            Array.from(bytes.subarray(0, Math.floor(bytes.length / 2))),
          ),
        );
      },
    },
    {
      name: "wrong frame count",
      mutate: async (fixtureRoot) => {
        await execFileAsync("ffmpeg", [
          "-v",
          "error",
          "-i",
          source,
          "-t",
          "1",
          "-c",
          "copy",
          join(fixtureRoot, M8_FINAL_PREVIEW_PATH),
        ]);
      },
    },
    {
      name: "missing audio stream",
      mutate: async (fixtureRoot) => {
        await execFileAsync("ffmpeg", [
          "-v",
          "error",
          "-i",
          source,
          "-c",
          "copy",
          "-an",
          join(fixtureRoot, M8_FINAL_PREVIEW_PATH),
        ]);
      },
    },
    {
      name: "wrong channel and sample rate",
      mutate: async (fixtureRoot) => {
        await execFileAsync("ffmpeg", [
          "-v",
          "error",
          "-i",
          source,
          "-c:v",
          "copy",
          "-ac",
          "1",
          "-ar",
          "44100",
          "-c:a",
          "aac",
          join(fixtureRoot, M8_FINAL_PREVIEW_PATH),
        ]);
      },
    },
  ];
  for (const { name, mutate } of mutations) {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "gps-m8-media-invalid-"));
    try {
      await mkdir(join(fixtureRoot, M8_FINAL_PREVIEW_PATH, ".."), {
        recursive: true,
      });
      await mutate(fixtureRoot);
      await assert.rejects(
        () => inspectM8FinalPreviewTechnical({ rootDir: fixtureRoot, frozen }),
        () => true,
        name,
      );
    } finally {
      await rm(fixtureRoot, { recursive: true });
    }
  }
});

test("mastering gate rejects non-finite loudness peak and every threshold breach", () => {
  const current = {
    integratedLoudnessLufs: -17.7,
    truePeakDbtp: -2.9,
    samplePeakDbfs: -2.9,
    integratedLoudnessMinLufs: -24,
    integratedLoudnessMaxLufs: -16,
    truePeakCeilingDbtp: -1,
  };
  assert.doesNotThrow(() => assertM8MasteringMeasurements(current));
  for (const mutation of [
    { ...current, integratedLoudnessLufs: -24.1 },
    { ...current, integratedLoudnessLufs: -15.9 },
    { ...current, truePeakDbtp: -0.9 },
    { ...current, samplePeakDbfs: -0.9 },
    { ...current, integratedLoudnessLufs: Number.NaN },
  ]) {
    assert.throws(() => assertM8MasteringMeasurements(mutation));
  }
});

test("review fails closed on missing group old preview and incomplete normal-speed playback", async () => {
  const raw = JSON.parse(await readFile(reviewPath, "utf8"));
  for (const mutation of [
    Object.fromEntries(
      Object.entries(raw).filter(([key]) => key !== "globalSound"),
    ),
    { ...raw, previewChecksum: sha("1") },
    { ...raw, finalAssemblyFingerprint: sha("2") },
    { ...raw, resourceCatalogFingerprint: sha("3") },
    { ...raw, m7EvidenceFingerprint: sha("4") },
    {
      ...raw,
      normalSpeed: { ...raw.normalSpeed, completedFullPlayback: false },
    },
    { ...raw, aggregateStatus: "fail" },
  ]) {
    await assert.rejects(() =>
      validateM8FinalAssemblyReview({ rootDir, rawReview: mutation }),
    );
  }
});

test("failed evidence write preserves the last current artifact bytes", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "gps-m8-evidence-write-"));
  const destination = join(fixtureRoot, "evidence.json");
  const current = FinalPreviewEvidenceSchema.parse(
    JSON.parse(await readFile(evidencePath, "utf8")),
  );
  await writeM8FinalPreviewEvidenceArtifact({ destination, evidence: current });
  const before = await readFile(destination);
  const mtime = (await stat(destination)).mtimeMs;
  await assert.rejects(() =>
    writeM8FinalPreviewEvidenceArtifact({
      destination,
      evidence: { ...current, reviewFingerprint: sha("5") },
    }),
  );
  assert.deepEqual(await readFile(destination), before);
  assert.equal((await stat(destination)).mtimeMs, mtime);
});
