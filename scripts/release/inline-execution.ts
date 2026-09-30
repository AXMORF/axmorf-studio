import assert from "node:assert/strict";
import { z } from "zod";
import { nativeTrace, unwrapHermesToolCall } from "./native-execution";

// This release's maintainer-approved matrix does not change product defaults
// or grant an inline exception to other versions or hosts.
export const requiresHermesInline = (version: string, host: string) =>
  version === "0.1.14" && host === "hermes";

const Text = z.string().min(1);
const Task = z
  .object({
    taskRevision: Text,
    boundAt: z.number().finite(),
    committedAt: z.number().finite(),
  })
  .strict();
export const InlineExecutionSchema = z
  .object({
    mode: z.literal("inline"),
    modeSource: z.literal("user-prompt"),
    model: z.literal("gpt-5.6-terra"),
    reasoningEffort: z.literal("medium"),
    effectiveMaxConcurrency: z.literal(0),
    workerTransport: z.null(),
    nativeChildCount: z.literal(0),
    delegationCalls: z.literal(0),
    dirtyTaskCount: z.number().int().min(5),
    attemptId: Text,
    tasks: z.array(Task).min(5),
  })
  .strict();

export function assertInlineExecution(
  execution: z.infer<typeof InlineExecutionSchema>,
  startedAt: string,
  endedAt: string,
) {
  assert.equal(execution.tasks.length, execution.dirtyTaskCount);
  assert.equal(
    new Set(execution.tasks.map((task) => task.taskRevision)).size,
    execution.dirtyTaskCount,
    "Inline tasks must have distinct identities",
  );
  let previous = Date.parse(startedAt);
  const ended = Date.parse(endedAt);
  assert.ok(
    Number.isFinite(previous) && Number.isFinite(ended) && ended > previous,
  );
  for (const task of execution.tasks) {
    assert.ok(
      task.boundAt >= previous &&
        task.committedAt >= task.boundAt &&
        task.committedAt <= ended,
      "Inline tasks must complete sequentially within the run",
    );
    previous = task.committedAt;
  }
}

export function auditInlineExecution(input: {
  transcript: string;
  storyId: string;
  startedAt: string;
  endedAt: string;
  model: string;
  reasoningEffort: unknown;
  nativeChildren: unknown;
  delegations: unknown;
}) {
  assert.deepEqual(
    input.nativeChildren,
    [],
    "Inline acceptance requires zero native children",
  );
  assert.deepEqual(
    input.delegations,
    [],
    "Inline acceptance requires zero native delegation rows",
  );
  const trace = nativeTrace("hermes", input.transcript);
  for (const call of trace.calls.values()) {
    const name =
      call.name === "tool_call"
        ? unwrapHermesToolCall(call.arguments).name
        : call.name;
    assert.notEqual(
      name,
      "delegate_task",
      "Inline acceptance forbids delegation calls",
    );
  }
  const outputs = trace.outputs
    .filter(({ name }) =>
      /(?:^|[._])(?:terminal|process|process_manage)$/u.test(name),
    )
    .flatMap(({ objects, timestamp }) =>
      objects.map((value) => ({ value, timestamp })),
    );
  const resolutions = outputs.filter(
    ({ value }) =>
      value.status === "ready" &&
      typeof value.effectiveMaxConcurrency === "number",
  );
  assert.equal(
    resolutions.length,
    1,
    "Expected one successful inline resolution",
  );
  const resolution = resolutions[0]!;
  assert.equal(resolution.value.mode, "inline");
  assert.deepEqual(resolution.value.source, {
    mode: "user-prompt",
    maxConcurrency: null,
  });
  assert.equal(resolution.value.requestedMaxConcurrency, null);
  assert.equal(resolution.value.effectiveMaxConcurrency, 0);
  assert.equal(resolution.value.workerTransport, null);
  const preparations = outputs.filter(
    ({ value }) => value.status === "project-production-prepared",
  );
  assert.equal(
    preparations.length,
    1,
    "Expected one production attempt in the fresh run",
  );
  const preparation = preparations[0]!;
  assert.ok(preparation.timestamp >= resolution.timestamp);
  assert.equal(preparation.value.storyId, input.storyId);
  const attemptId = Text.parse(preparation.value.attemptId);
  const dirty = z
    .array(z.object({ taskRevision: Text }).passthrough())
    .min(5)
    .parse(preparation.value.dirtyAgentTasks);
  const expected = new Set(dirty.map((task) => task.taskRevision));
  assert.equal(expected.size, dirty.length);
  const bound = new Map<string, { taskRevision: string; boundAt: number }>();
  const tasks: z.infer<typeof Task>[] = [];
  let active: string | null = null;
  for (const { value, timestamp } of outputs) {
    if (value.status === "task-worker-bound") {
      const revision = Text.parse(value.taskRevision);
      assert.ok(
        expected.has(revision),
        "Inline binding must belong to a prepared dirty task",
      );
      assert.equal(value.attemptId, attemptId);
      assert.equal(value.storyId, input.storyId);
      assert.equal(value.transport, "shared-workspace");
      assert.ok(timestamp >= preparation.timestamp);
      if (bound.has(revision)) {
        assert.equal(
          active,
          revision,
          "Inline executor cannot reopen a completed task",
        );
      } else {
        assert.equal(
          active,
          null,
          "Inline tasks overlap before the prior commit",
        );
        active = revision;
        bound.set(revision, { taskRevision: revision, boundAt: timestamp });
      }
    }
    if (
      ["producer-artifact-committed", "producer-artifact-current"].includes(
        String(value.status),
      )
    ) {
      const artifact = z
        .object({ taskRevision: Text })
        .passthrough()
        .parse(value.artifact);
      assert.equal(value.attemptRecorded, true);
      assert.equal(
        active,
        artifact.taskRevision,
        "Inline commit requires its active root binding",
      );
      const task = bound.get(artifact.taskRevision);
      assert.ok(task);
      tasks.push({ ...task, committedAt: timestamp });
      active = null;
    }
  }
  assert.equal(active, null, "Inline acceptance has an unfinished task");
  const result = InlineExecutionSchema.parse({
    mode: "inline",
    modeSource: "user-prompt",
    model: input.model,
    reasoningEffort: input.reasoningEffort,
    effectiveMaxConcurrency: 0,
    workerTransport: null,
    nativeChildCount: 0,
    delegationCalls: 0,
    attemptId,
    dirtyTaskCount: expected.size,
    tasks,
  });
  assertInlineExecution(result, input.startedAt, input.endedAt);
  return result;
}
