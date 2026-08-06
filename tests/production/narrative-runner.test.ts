import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import { readProductionRunStore } from "../../scripts/production/adapters/run-store";
import {
  runProductionNarrative,
  type NarrativeProductionDependencies,
} from "../../scripts/production/application/narrative";
import {
  createProductionFixture,
  FIXED_PRODUCTION_NOW,
  writeProductionJson,
} from "./fixture";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

const createFixture = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-production-narrative-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  return createProductionFixture(context, rootDir);
};

const createDependencies = (
  calls: string[],
): NarrativeProductionDependencies => ({
  generateNarration: async (request) => {
    calls.push("generate");
    assert.equal(request.resume, true);
    return {
      providerAttemptFingerprint: sha("1"),
      generationInputFingerprint: sha("2"),
    };
  },
  sealNarration: async (request) => {
    calls.push("seal");
    assert.equal(request.supersedeFingerprint, undefined);
    return {
      generationInputFingerprint: sha("2"),
      sealedNarrationFingerprint: sha("3"),
      semanticTimingFingerprint: sha("4"),
      completeAudioChecksum: sha("5"),
    };
  },
  checkNarration: async () => {
    calls.push("check-narration");
    return {
      generationInputFingerprint: sha("2"),
      sealedNarrationFingerprint: sha("3"),
      semanticTimingFingerprint: sha("4"),
      completeAudioChecksum: sha("5"),
    };
  },
  generateRegistry: async () => {
    calls.push("generate-registry");
  },
  checkRegistry: async () => {
    calls.push("check-registry");
    return {
      compositionId: "StoryExample",
      generatedRegistryChecksum: sha("6"),
      projectRegistryEntryFingerprint: sha("7"),
      narrativeBaselineFingerprint: sha("8"),
    };
  },
  listCompositions: async () => {
    calls.push("compositions");
  },
  renderBaseline: async () => {
    calls.push("render-baseline");
    return {
      transparentStillPath: "out/story-example/m3-transparent-frame-0.png",
      transparentStillChecksum: sha("9"),
      captionStillPath: "out/story-example/m3-caption-frame-15.png",
      captionStillChecksum: sha("a"),
      renderPath: "out/story-example/m3-narrative-baseline.mp4",
      renderChecksum: sha("b"),
    };
  },
  writeEvidence: async () => {
    calls.push("write-evidence");
    return { evidenceFingerprint: sha("c") };
  },
  checkEvidence: async () => {
    calls.push("check-evidence");
    return { evidenceFingerprint: sha("c") };
  },
  writeAutoCheck: async () => {
    calls.push("write-auto-check");
    return { reportFingerprint: sha("d") };
  },
  checkAutoCheck: async () => {
    calls.push("check-auto-check");
    return { reportFingerprint: sha("d") };
  },
});

const fullOrder = [
  "generate",
  "seal",
  "check-narration",
  "generate-registry",
  "check-registry",
  "compositions",
  "render-baseline",
  "write-evidence",
  "check-evidence",
  "write-auto-check",
  "check-auto-check",
] as const;

test("runs the fixed narrative chain and binds outputs only at baseline-ready", async (context) => {
  const fixture = await createFixture(context);
  const calls: string[] = [];
  const result = await runProductionNarrative({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    clock: () => FIXED_PRODUCTION_NOW,
    dependencies: createDependencies(calls),
  });

  assert.deepEqual(calls, fullOrder);
  assert.equal(result.status, "baseline-ready");
  assert.equal(result.noOp, false);
  const loaded = await readProductionRunStore({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
  });
  assert.deepEqual(
    loaded.events.map(({ type, stageId }) => `${type}:${stageId}`),
    [
      "stage-succeeded:production-start",
      "stage-started:narrative",
      "stage-succeeded:narrative",
    ],
  );
  assert.equal(loaded.state.outputArtifacts.length, 10);
});

test("each failed step records one safe failure and stops all later steps", async (context) => {
  for (const failedStep of fullOrder) {
    await context.test(failedStep, async (child) => {
      const fixture = await createFixture(child);
      const calls: string[] = [];
      const dependencies = createDependencies(calls);
      const original =
        dependencies[
          {
            generate: "generateNarration",
            seal: "sealNarration",
            "check-narration": "checkNarration",
            "generate-registry": "generateRegistry",
            "check-registry": "checkRegistry",
            compositions: "listCompositions",
            "render-baseline": "renderBaseline",
            "write-evidence": "writeEvidence",
            "check-evidence": "checkEvidence",
            "write-auto-check": "writeAutoCheck",
            "check-auto-check": "checkAutoCheck",
          }[failedStep] as keyof NarrativeProductionDependencies
        ];
      Object.assign(dependencies, {
        [{
          generate: "generateNarration",
          seal: "sealNarration",
          "check-narration": "checkNarration",
          "generate-registry": "generateRegistry",
          "check-registry": "checkRegistry",
          compositions: "listCompositions",
          "render-baseline": "renderBaseline",
          "write-evidence": "writeEvidence",
          "check-evidence": "checkEvidence",
          "write-auto-check": "writeAutoCheck",
          "check-auto-check": "checkAutoCheck",
        }[failedStep]]: async (...args: never[]) => {
          await (original as (...input: never[]) => Promise<unknown>)(...args);
          throw new Error("Bearer private-token at /tmp/private/stack.ts");
        },
      });

      await assert.rejects(() =>
        runProductionNarrative({
          rootDir: fixture.rootDir,
          runId: fixture.runId,
          clock: () => FIXED_PRODUCTION_NOW,
          dependencies,
        }),
      );
      assert.deepEqual(
        calls,
        fullOrder.slice(0, fullOrder.indexOf(failedStep) + 1),
      );
      const loaded = await readProductionRunStore({
        rootDir: fixture.rootDir,
        runId: fixture.runId,
      });
      assert.equal(loaded.state.state, "failed");
      assert.equal(loaded.events.at(-1)?.type, "stage-failed");
      assert.doesNotMatch(
        JSON.stringify(loaded.state.failure),
        /private-token|\/tmp\/|stack\.ts/u,
      );
    });
  }
});

test("repeating a current baseline is read-only and checks persisted identities", async (context) => {
  const fixture = await createFixture(context);
  const calls: string[] = [];
  const dependencies = createDependencies(calls);
  await runProductionNarrative({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    clock: () => FIXED_PRODUCTION_NOW,
    dependencies,
  });
  const statePath = join(
    fixture.rootDir,
    ".producer-runs",
    fixture.runId,
    "state.generated.json",
  );
  const before = await readFile(statePath);
  const beforeMtime = (await stat(statePath)).mtimeMs;
  calls.length = 0;

  const repeated = await runProductionNarrative({
    rootDir: fixture.rootDir,
    runId: fixture.runId,
    clock: () => new Date("2026-08-04T01:00:00.000Z"),
    dependencies,
  });
  assert.equal(repeated.noOp, true);
  assert.deepEqual(calls, [
    "check-narration",
    "check-registry",
    "compositions",
    "check-evidence",
    "check-auto-check",
  ]);
  assert.deepEqual(await readFile(statePath), before);
  assert.equal((await stat(statePath)).mtimeMs, beforeMtime);
});

test("stale requirements or StoryCheck fail inside the ledger before provider work", async (context) => {
  for (const target of ["render", "story-check"] as const) {
    await context.test(target, async (child) => {
      const fixture = await createFixture(child);
      if (target === "render") {
        await writeProductionJson(join(fixture.projectDir, "render.json"), {
          ...fixture.source.render,
          width: fixture.source.render.width + 2,
        });
      } else {
        await writeProductionJson(
          join(fixture.projectDir, "reviews/story-check.json"),
          {
            ...fixture.source.storyCheck,
            decision: "revise",
          },
        );
      }
      const calls: string[] = [];
      await assert.rejects(() =>
        runProductionNarrative({
          rootDir: fixture.rootDir,
          runId: fixture.runId,
          clock: () => FIXED_PRODUCTION_NOW,
          dependencies: createDependencies(calls),
        }),
      );
      assert.deepEqual(calls, []);
      const loaded = await readProductionRunStore({
        rootDir: fixture.rootDir,
        runId: fixture.runId,
      });
      assert.equal(loaded.state.state, "failed");
      assert.equal(loaded.events.at(-1)?.type, "stage-failed");
    });
  }
});

test("an over-budget chunk fails by chunkId before any provider dependency runs", async (context) => {
  const fixture = await createFixture(context);
  const overlongStory = {
    ...fixture.source.story,
    beats: fixture.source.story.beats.map((beat, index) =>
      index === 0
        ? {
            ...beat,
            ttsChunks: beat.ttsChunks.map((chunk) => ({
              ...chunk,
              ttsText: "中".repeat(37),
            })),
          }
        : beat,
    ),
  };
  await writeProductionJson(
    join(fixture.projectDir, "story.json"),
    overlongStory,
  );
  const calls: string[] = [];

  await assert.rejects(
    () =>
      runProductionNarrative({
        rootDir: fixture.rootDir,
        runId: fixture.runId,
        clock: () => FIXED_PRODUCTION_NOW,
        dependencies: createDependencies(calls),
      }),
    /opening-01.*74 half-units.*72 half-units/iu,
  );
  assert.deepEqual(calls, []);
});
