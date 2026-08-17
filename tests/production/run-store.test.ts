import assert from "node:assert/strict";
import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createProductionRunManifest } from "../../src/contracts/production-run";
import {
  acquireProductionRunLock,
  appendProductionRunEvent,
  getProductionRunPaths,
  initializeProductionRunStore,
  readProductionRunStore,
} from "../../scripts/production/adapters/run-store";
import { createProductionStageEvent } from "../../scripts/production/domain/events";
import type { AtomicTextFileWriter } from "../../scripts/shared/atomic-file";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;
const occurredAt = "2026-08-04T00:00:00.000Z";

const createRun = () =>
  createProductionRunManifest({
    runId: "story-example-run-001",
    storyId: "story-example",
    requirementsPath: "src/projects/story-example/production/requirements.json",
    requirementsFingerprint: sha("a"),
    createdAt: occurredAt,
  });

const createStartEvent = (
  run: ReturnType<typeof createRun>,
  stateFingerprint: string,
) =>
  createProductionStageEvent({
    type: "stage-succeeded",
    runId: run.runId,
    storyId: run.storyId,
    sequence: 1,
    eventId: "production-start-succeeded-1",
    stageId: "production-start",
    attempt: 1,
    occurredAt,
    commandId: "production-start",
    previousStateFingerprint: stateFingerprint,
    inputFingerprints: [
      { artifactId: "requirements", fingerprint: run.requirementsFingerprint },
    ],
    outputArtifacts: [
      {
        artifactId: "run-manifest",
        repositoryPath: `.producer-runs/${run.runId}/run.json`,
        fingerprint: run.runFingerprint,
      },
    ],
  });

test("initializes an immutable run and appends one canonical event byte-stably", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-production-store-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const run = createRun();
  const initialized = await initializeProductionRunStore({ rootDir, run });
  const event = createStartEvent(run, initialized.state.stateFingerprint);

  const first = await appendProductionRunEvent({
    rootDir,
    runId: run.runId,
    event,
  });
  assert.equal(first.written, true);
  const paths = getProductionRunPaths({ rootDir, runId: run.runId });
  assert.equal(paths.artifacts, join(paths.root, "artifacts"));
  const eventPath = join(
    paths.events,
    "000001-production-start-succeeded-1.json",
  );
  const eventBytes = await readFile(eventPath);
  const stateBytes = await readFile(paths.state);
  const eventMtime = (await stat(eventPath)).mtimeMs;
  const stateMtime = (await stat(paths.state)).mtimeMs;

  const repeated = await appendProductionRunEvent({
    rootDir,
    runId: run.runId,
    event,
  });
  assert.equal(repeated.written, false);
  assert.deepEqual(await readFile(eventPath), eventBytes);
  assert.deepEqual(await readFile(paths.state), stateBytes);
  assert.equal((await stat(eventPath)).mtimeMs, eventMtime);
  assert.equal((await stat(paths.state)).mtimeMs, stateMtime);

  const loaded = await readProductionRunStore({ rootDir, runId: run.runId });
  assert.equal(loaded.state.lastSequence, 1);
  await assert.rejects(() => initializeProductionRunStore({ rootDir, run }));
});

test("rejects conflicting events, sequence gaps, malformed JSON, and hand-edited state", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-production-drift-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const run = createRun();
  const initialized = await initializeProductionRunStore({ rootDir, run });
  const event = createStartEvent(run, initialized.state.stateFingerprint);
  await appendProductionRunEvent({ rootDir, runId: run.runId, event });
  const paths = getProductionRunPaths({ rootDir, runId: run.runId });
  if (event.type !== "stage-succeeded") {
    throw new Error("Test fixture must create a succeeded start event.");
  }

  await assert.rejects(() =>
    appendProductionRunEvent({
      rootDir,
      runId: run.runId,
      event: createProductionStageEvent({
        ...event,
        outputArtifacts: [
          {
            ...event.outputArtifacts[0],
            fingerprint: sha("f"),
          },
        ],
      }),
    }),
  );

  await writeFile(paths.state, `${await readFile(paths.state, "utf8")} `);
  await assert.rejects(
    () => readProductionRunStore({ rootDir, runId: run.runId }),
    /state projection drift/i,
  );

  await writeFile(paths.state, "{malformed");
  await assert.rejects(() =>
    readProductionRunStore({ rootDir, runId: run.runId }),
  );
});

test("uses one writer lock and releases only its own lock", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-production-lock-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const run = createRun();
  await initializeProductionRunStore({ rootDir, run });

  const first = await acquireProductionRunLock({
    rootDir,
    runId: run.runId,
    ownerId: "writer-one",
    acquiredAt: occurredAt,
  });
  await assert.rejects(
    () =>
      acquireProductionRunLock({
        rootDir,
        runId: run.runId,
        ownerId: "writer-two",
        acquiredAt: occurredAt,
      }),
    /lock|writer/i,
  );
  await first.release();
  const second = await acquireProductionRunLock({
    rootDir,
    runId: run.runId,
    ownerId: "writer-two",
    acquiredAt: occurredAt,
  });
  await second.release();
});

test("an atomic event write failure leaves no half event and preserves current state", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-production-atomic-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const run = createRun();
  const initialized = await initializeProductionRunStore({ rootDir, run });
  const paths = getProductionRunPaths({ rootDir, runId: run.runId });
  const beforeState = await readFile(paths.state);
  const event = createStartEvent(run, initialized.state.stateFingerprint);
  const failWriter: AtomicTextFileWriter = async ({ destination }) => {
    throw new Error(
      `Injected atomic failure for ${destination.split("/").at(-1)}.`,
    );
  };

  await assert.rejects(() =>
    appendProductionRunEvent({
      rootDir,
      runId: run.runId,
      event,
      writeAtomic: failWriter,
    }),
  );
  await assert.rejects(() =>
    access(join(paths.events, "000001-production-start-succeeded-1.json")),
  );
  assert.deepEqual(await readFile(paths.state), beforeState);
});

test("production runtime has no Agent SDK, task, thread, progress, or heartbeat dependency", async () => {
  const productionRoot = join(import.meta.dirname, "../../scripts/production");
  const entries = await readdir(productionRoot, { recursive: true });
  const sourceFiles = entries.filter((entry) => entry.endsWith(".ts"));
  const sources = await Promise.all(
    sourceFiles.map((entry) => readFile(join(productionRoot, entry), "utf8")),
  );
  assert.doesNotMatch(
    sources.join("\n"),
    /(?:@openai\/codex|agents-sdk|app-server|agentId|taskId|threadId|heartbeatAt|progressPercent)/u,
  );
});
