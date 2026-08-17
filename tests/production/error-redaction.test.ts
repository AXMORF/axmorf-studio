import assert from "node:assert/strict";
import test from "node:test";

import { ProductionErrorSchema } from "../../src/contracts/production-run";
import {
  createExpectedProductionError,
  createUnexpectedProductionError,
} from "../../scripts/production/domain/errors";

const sha = (character: string) => `sha256:${character.repeat(64)}` as const;

const context = {
  stageId: "narrative",
  scope: "narrative",
  meaningId: null,
  commandId: "production-narrative",
  inputFingerprint: sha("a"),
} as const;

test("creates a strict fingerprinted expected ProductionError", () => {
  const error = createExpectedProductionError({
    ...context,
    code: "NARRATION_FAILED",
    summary: "Narration generation failed.",
    description: "The provider returned a retryable generation failure.",
    retryable: true,
    remediation: "Resume the same generation input.",
  });

  assert.equal(error.kind, "expected");
  assert.equal(error.redactionApplied, false);
  assert.doesNotThrow(() => ProductionErrorSchema.parse(error));
  assert.throws(() =>
    ProductionErrorSchema.parse({ ...error, token: "secret" }),
  );
  assert.throws(() =>
    ProductionErrorSchema.parse({ ...error, errorFingerprint: sha("f") }),
  );
});

test("redacts URLs, credentials, absolute paths, query tokens, and multiline stacks", () => {
  const raw = new Error(
    "Request https://private.example/api?token=super-secret failed with Bearer abc.def at /home/alice/project/file.ts\n" +
      "    at run (C:\\Users\\alice\\project\\runner.ts:12:4)\n" +
      "API_TOKEN=also-secret",
  );
  raw.stack = `${raw.message}\n    at /data/private/runner.ts:99:1`;

  const error = createUnexpectedProductionError({
    ...context,
    error: raw,
    summary: "Narrative runner failed unexpectedly.",
  });

  assert.equal(error.kind, "unexpected");
  assert.equal(error.code, "UNEXPECTED");
  assert.equal(error.redactionApplied, true);
  assert.match(error.description, /request|failed/i);
  assert.doesNotMatch(
    JSON.stringify(error),
    /super-secret|abc\.def|also-secret|private\.example|\/home\/|\/data\/|C:\\Users|\bstack\b/i,
  );
  assert.doesNotThrow(() => ProductionErrorSchema.parse(error));
});

test("rejects unsafe expected descriptions instead of persisting raw diagnostics", () => {
  for (const description of [
    "Bearer abcdef",
    "Read /home/alice/private.json",
    "Open C:\\Users\\alice\\private.json",
    "Call https://private.example?api_key=secret",
    "Error\n    at runner.ts:1:1",
  ]) {
    assert.throws(() =>
      createExpectedProductionError({
        ...context,
        code: "NARRATION_FAILED",
        summary: "Narration generation failed.",
        description,
        retryable: false,
        remediation: null,
      }),
    );
  }
});

test("keeps a bounded actionable unexpected description without raw object fields", () => {
  const error = createUnexpectedProductionError({
    ...context,
    error: {
      message: "ffmpeg exited with code 1 while decoding the preview.",
      endpoint: "https://private.example",
      token: "secret",
      arbitrary: "must not be copied",
    },
    summary: "Preview inspection failed unexpectedly.",
  });
  assert.match(error.description, /ffmpeg exited with code 1/i);
  assert.doesNotMatch(JSON.stringify(error), /endpoint|arbitrary|secret/i);
  assert.ok(error.description.length <= 1_200);
});

test("GlobalVisual errors are v2, scoped to scenes, and contain no Agent identity", () => {
  const error = createExpectedProductionError({
    stageId: "scenes",
    scope: "global-visual",
    meaningId: null,
    commandId: "production-finalize",
    inputFingerprint: sha("b"),
    code: "GLOBAL_VISUAL_RESULT_TIMEOUT",
    summary: "Global visual result monitoring failed.",
    description:
      "The frozen GlobalVisual result contract was not submitted before its deadline.",
    retryable: false,
    remediation: "Correct the owned artifact and start a new run.",
  });
  assert.equal(error.schemaVersion, 1);
  assert.equal(error.scope, "global-visual");
  assert.deepEqual(
    Object.keys(error).filter((key) =>
      /agent|task|thread|progress|heartbeat/iu.test(key),
    ),
    [],
  );
  assert.doesNotThrow(() => ProductionErrorSchema.parse(error));
});
