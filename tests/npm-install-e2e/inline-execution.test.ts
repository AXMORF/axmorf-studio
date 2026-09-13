import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { verifyReceipt } from "../../scripts/release/first-use";
import type { PackageContent } from "../../scripts/release/package-content";
import {
  auditInlineExecution,
  requiresHermesInline,
} from "../../scripts/release/inline-execution";

const fixture = () => {
  const rows: Record<string, unknown>[] = [];
  const add = (value: Record<string, unknown>) => {
    const id = `call-${rows.length}`;
    rows.push({
      role: "assistant",
      tool_calls: [{ id, function: { name: "terminal", arguments: "{}" } }],
    });
    rows.push({
      role: "tool",
      tool_call_id: id,
      content: JSON.stringify(value),
      timestamp: rows.length,
    });
  };
  add({
    status: "ready",
    mode: "inline",
    effectiveMaxConcurrency: 0,
    requestedMaxConcurrency: null,
    workerTransport: null,
    source: { mode: "user-prompt", maxConcurrency: null },
  });
  add({
    status: "project-production-prepared",
    storyId: "story",
    attemptId: "attempt",
    dirtyAgentTasks: Array.from({ length: 5 }, (_, i) => ({
      taskRevision: `task-${i}`,
    })),
  });
  for (let i = 0; i < 5; i++) {
    add({
      status: "task-worker-bound",
      taskRevision: `task-${i}`,
      attemptId: "attempt",
      storyId: "story",
      transport: "shared-workspace",
    });
    add({
      status: "producer-artifact-committed",
      artifact: { taskRevision: `task-${i}` },
      attemptRecorded: true,
    });
  }
  return rows;
};
const audit = (rows = fixture(), overrides = {}) =>
  auditInlineExecution({
    transcript: JSON.stringify(rows),
    storyId: "story",
    model: "gpt-5.6-terra",
    reasoningEffort: "medium",
    startedAt: "1970-01-01T00:00:00Z",
    endedAt: "1970-01-01T00:01:00Z",
    nativeChildren: [],
    delegations: [],
    ...overrides,
  });
const changeResult = (
  rows: Record<string, unknown>[],
  index: number,
  patch: Record<string, unknown>,
) => {
  rows[index]!.content = JSON.stringify({
    ...JSON.parse(String(rows[index]!.content)),
    ...patch,
  });
};
test("inline release scope is exact and does not alter other host/version gates", () => {
  assert.equal(requiresHermesInline("0.1.14", "hermes"), true);
  for (const version of ["0.1.13", "0.1.14-beta.1", "0.1.15"])
    assert.equal(requiresHermesInline(version, "hermes"), false);
  assert.equal(requiresHermesInline("0.1.14", "codex"), false);
});
test("five inline tasks bind and commit sequentially in one attempt", () => {
  assert.equal(audit().tasks.length, 5);
});
test("inline evidence rejects children, delegation, and another model", () => {
  for (const overrides of [
    { nativeChildren: [{}] },
    { delegations: [{}] },
    { model: "another-model" },
    { reasoningEffort: "high" },
  ])
    assert.throws(() => audit(fixture(), overrides));
  const rows = fixture();
  rows.push({
    role: "assistant",
    tool_calls: [
      {
        id: "delegate",
        function: {
          name: "tool_call",
          arguments: JSON.stringify({ name: "delegate_task", arguments: {} }),
        },
      },
    ],
  });
  assert.throws(() => audit(rows), /delegation calls/u);
});
test("inline evidence rejects implicit mode and stale or overlapping task bindings", () => {
  for (const [index, patch] of [
    [1, { source: { mode: "settings", maxConcurrency: null } }],
    [5, { attemptId: "another-attempt" }],
    [5, { storyId: "another-story" }],
    [5, { taskRevision: "unknown-task" }],
    [5, { transport: "controller-io" }],
    [
      7,
      {
        status: "task-worker-bound",
        taskRevision: "task-1",
        attemptId: "attempt",
        storyId: "story",
        transport: "shared-workspace",
      },
    ],
    [7, { attemptRecorded: false }],
    [7, { artifact: { taskRevision: "task-1" } }],
  ] as const) {
    const rows = fixture();
    changeResult(rows, index, patch);
    assert.throws(() => audit(rows));
  }
  assert.throws(() => audit(fixture().slice(0, -2)), /unfinished task/u);
  assert.throws(() => audit(fixture().slice(0, -4)));
});

const combined = () => {
  const codex = JSON.parse(
    readFileSync(
      new URL(
        "../../docs/evidence/v0.1.14-codex-terra-receipt.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const hermes = structuredClone(codex);
  hermes.host = "hermes";
  hermes.sessionId = "hermes-inline-session";
  hermes.sessionChecksum = codex.runChecksum;
  delete hermes.nativeExecution;
  const start = Date.parse(hermes.startedAt);
  hermes.inlineExecution = {
    ...audit(),
    tasks: audit().tasks.map((task) => ({
      ...task,
      boundAt: task.boundAt + start,
      committedAt: task.committedAt + start,
    })),
  };
  hermes.supervision = {
    ...codex.supervision,
    source: "tui",
    uiEvidence: {
      checksum: codex.runChecksum,
      sessionId: "ui-session",
      toolCalls: hermes.transcriptAudit.toolCalls,
      visibleReports: 3,
    },
  };
  const content = (summary: {
    fileCount: number;
    name: string;
    version: string;
    fingerprint: string;
  }): PackageContent => {
    const { fileCount, ...rest } = summary;
    return {
      ...rest,
      files: Array.from({ length: fileCount }, (_, i) => ({
        path: `file-${i}`,
        checksum: codex.runChecksum,
        executable: false,
      })),
    };
  };
  return {
    value: { schemaVersion: 1, hosts: [codex, hermes] },
    runtime: content(codex.packages.runtime),
    creator: content(codex.packages.creator),
  };
};
test("combined release gate accepts only the approved host matrix and retains common checks", () => {
  const check = (fixture: ReturnType<typeof combined>) =>
    verifyReceipt(fixture.value, fixture.runtime, fixture.creator);
  assert.equal(check(combined()).status, "first-use-release-gate-passed");
  for (const mutate of [
    (f: ReturnType<typeof combined>) => {
      delete f.value.hosts[1].inlineExecution;
    },
    (f: ReturnType<typeof combined>) => {
      f.value.hosts[1].nativeExecution = f.value.hosts[0].nativeExecution;
    },
    (f: ReturnType<typeof combined>) => {
      delete f.value.hosts[0].nativeExecution;
    },
    (f: ReturnType<typeof combined>) => {
      f.value.hosts[0].nativeExecution.peakBoundTasks = 3;
    },
    (f: ReturnType<typeof combined>) => {
      f.value.hosts[1].supervision.asyncBatches = 1;
      f.value.hosts[1].supervision.completedAsyncBatches = 1;
    },
    (f: ReturnType<typeof combined>) => {
      delete f.value.hosts[1].supervision.uiEvidence;
    },
    (f: ReturnType<typeof combined>) => {
      f.value.hosts[1].finalCheck.checks.pop();
    },
    (f: ReturnType<typeof combined>) => {
      f.value.hosts[1].inlineExecution.tasks[1].boundAt =
        f.value.hosts[1].inlineExecution.tasks[0].boundAt;
    },
    (f: ReturnType<typeof combined>) => {
      f.value.hosts[1].model = "another-model";
    },
    (f: ReturnType<typeof combined>) => {
      f.value.hosts[0].inlineExecution = f.value.hosts[1].inlineExecution;
    },
  ]) {
    const f = combined();
    mutate(f);
    assert.throws(() => check(f));
  }
  for (const version of ["0.1.13", "0.1.15"]) {
    const f = combined();
    f.runtime.version = version;
    f.creator.version = version;
    for (const host of f.value.hosts) {
      host.packages.runtime.version = version;
      host.packages.creator.version = version;
    }
    assert.throws(() => check(f));
  }
});
