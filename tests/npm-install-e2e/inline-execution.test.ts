import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  verifyHistoricalReceipt,
  verifyPublicReceipt,
  verifyReceipt,
} from "../../scripts/release/first-use";
import {
  packageContent,
  sha256,
  type PackageContent,
} from "../../scripts/release/package-content";
import {
  auditInlineExecution,
  requiresHermesInline,
  requiresCodexInline,
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

const codexTranscript = (rows = fixture()) =>
  [
    {
      type: "session_meta",
      payload: { id: "fresh-root", cwd: "/workspace", source: "cli" },
    },
    { type: "turn_context", payload: { model: "gpt-6.1-sol", effort: "max" } },
    ...rows.map((row, index) => ({
      type: "response_item",
      timestamp: new Date((index + 1) * 1000).toISOString(),
      payload:
        row.role === "assistant"
          ? {
              type: "function_call",
              name: "functions.exec_command",
              call_id: (row.tool_calls as Array<{ id: string }>)[0]!.id,
              arguments: "{}",
            }
          : {
              type: "function_call_output",
              call_id: row.tool_call_id,
              output: row.content,
            },
    })),
  ]
    .map((row) => JSON.stringify(row))
    .join("\n");
const auditCodex = (transcript = codexTranscript(), overrides = {}) =>
  auditInlineExecution({
    host: "codex",
    transcript,
    storyId: "story",
    model: "gpt-6.1-sol",
    reasoningEffort: "max",
    startedAt: "1970-01-01T00:00:00Z",
    endedAt: "1970-01-01T00:01:00Z",
    nativeChildren: [],
    delegations: [],
    ...overrides,
  });

test("0.1.16 Codex serial scope binds native settings and marks parallel/Hermes unverified", () => {
  assert.equal(requiresCodexInline("0.1.16", "codex"), true);
  for (const version of ["0.1.15", "0.1.16-beta.1", "0.1.17"])
    assert.equal(requiresCodexInline(version, "codex"), false);
  assert.equal(requiresCodexInline("0.1.16", "hermes"), false);
  const result = auditCodex();
  assert.equal(result.tasks.length, 5);
  assert.ok("releaseScope" in result);
  assert.equal(result.releaseScope.parallelExecution, "unverified");
  assert.equal(result.releaseScope.hermes, "unverified");
  for (const overrides of [
    { model: "another-model" },
    { reasoningEffort: "high" },
    { nativeChildren: [{}] },
  ])
    assert.throws(() => auditCodex(undefined, overrides));
  assert.throws(
    () =>
      auditCodex(
        codexTranscript().replace(
          '"source":"cli"',
          '"source":{"subagent":{"thread_spawn":{}}}',
        ),
      ),
    /independent first-use root/u,
  );
  assert.throws(
    () =>
      auditCodex(
        codexTranscript().replace(
          '"source":"cli"',
          '"source":"cli","forked_from_id":"old"',
        ),
      ),
    /Forked history/u,
  );
  const overlap = fixture();
  changeResult(overlap, 7, {
    status: "task-worker-bound",
    taskRevision: "task-1",
    attemptId: "attempt",
    storyId: "story",
    transport: "shared-workspace",
  });
  assert.throws(() => auditCodex(codexTranscript(overlap)), /overlap/u);
});

test("0.1.16 native receipts retain four-way overlap and later admission gates", () => {
  const make = () => {
    const f = combined();
    f.value.hosts.splice(1);
    f.runtime.version = f.creator.version = "0.1.16";
    f.value.hosts[0].packages.runtime.version =
      f.value.hosts[0].packages.creator.version = "0.1.16";
    return f;
  };
  const check = (f: ReturnType<typeof make>) =>
    verifyReceipt(f.value, f.runtime, f.creator);
  assert.equal(check(make()).status, "first-use-release-gate-passed");
  for (const mutate of [
    (f: ReturnType<typeof make>) => {
      f.value.hosts[0].nativeExecution.fourWayBoundOverlapMs = 0;
    },
    (f: ReturnType<typeof make>) => {
      f.value.hosts[0].nativeExecution.peakBoundTasks = 3;
    },
    (f: ReturnType<typeof make>) => {
      f.value.hosts[0].nativeExecution.refillAdmissions = 0;
    },
    (f: ReturnType<typeof make>) => {
      delete f.value.hosts[0].nativeExecution;
    },
  ]) {
    const f = make();
    mutate(f);
    assert.throws(() => check(f));
  }
});

const codexSerialCombined = () => {
  const f = combined();
  f.value.hosts.splice(1);
  const host = f.value.hosts[0]!;
  delete host.nativeExecution;
  f.runtime.version = f.creator.version = "0.1.16";
  host.packages.runtime.version = host.packages.creator.version = "0.1.16";
  host.model = "gpt-6.1-sol";
  const start = Date.parse(host.startedAt);
  host.inlineExecution = {
    ...auditCodex(),
    tasks: auditCodex().tasks.map((task) => ({
      ...task,
      boundAt: task.boundAt + start,
      committedAt: task.committedAt + start,
    })),
  };
  return f;
};

const packReceiptCandidates = async (
  context: TestContext,
  f: ReturnType<typeof codexSerialCombined>,
) => {
  const root = await mkdtemp(join(tmpdir(), "axmorf-release-purpose-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const paths = {
    runtime: join(root, "runtime.tgz"),
    creator: join(root, "creator.tgz"),
  };
  for (const role of ["runtime", "creator"] as const) {
    const directory = join(root, role);
    await mkdir(join(directory, "package"), { recursive: true });
    await writeFile(
      join(directory, "package/package.json"),
      JSON.stringify({ name: f[role].name, version: f[role].version }),
    );
    execFileSync("tar", ["-czf", paths[role], "-C", directory, "package"]);
    f[role] = await packageContent(paths[role]);
    const { files, ...summary } = f[role];
    for (const host of f.value.hosts) {
      host.packages[role] = { ...summary, fileCount: files.length };
      if (role === "runtime") host.unchangedPackageFiles = files.length;
      host.creation[`${role}TarballChecksum`] = sha256(
        await readFile(paths[role]),
      );
    }
  }
  return paths;
};

const publicReceiptCreation = async (
  paths: Awaited<ReturnType<typeof packReceiptCandidates>>,
  f: ReturnType<typeof codexSerialCombined>,
) => {
  const packages = Object.fromEntries(
    await Promise.all(
      (["runtime", "creator"] as const).map(async (role) => {
        const { name, version } = f[role];
        const bytes = await readFile(paths[role]);
        return [
          role,
          {
            name,
            version,
            tarball: `https://registry.npmjs.org/${name}/-/${name.slice(name.lastIndexOf("/") + 1)}-${version}.tgz`,
            integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
          },
        ];
      }),
    ),
  );
  return {
    ...f.value.hosts[0]!.creation,
    method: "npm-create-public-registry",
    registry: "https://registry.npmjs.org",
    command: [
      "npm",
      "create",
      "--yes",
      "axmorf-studio@latest",
      "fresh",
      "--",
      "--yes",
    ],
    packages,
    workspaceLockChecksum: sha256("workspace-lock"),
    creatorLockChecksum: sha256("creator-lock"),
  };
};

test("current 0.1.16 candidate publication rejects historical serial authorization", () => {
  const f = codexSerialCombined();
  assert.throws(
    () => verifyReceipt(f.value, f.runtime, f.creator),
    /Current 0\.1\.16 publication requires native/u,
  );
});

test("current 0.1.16 public and CLI publication reject historical serial authorization", async (context) => {
  const f = codexSerialCombined();
  const paths = await packReceiptCandidates(context, f);
  const receiptPath = join(dirname(paths.runtime), "receipt.json");
  const candidateCreation = f.value.hosts[0]!.creation;
  f.value.hosts[0]!.creation = await publicReceiptCreation(paths, f);
  await assert.rejects(
    () => verifyPublicReceipt(f.value, paths.runtime, paths.creator),
    /Current 0\.1\.16 publication requires native/u,
  );
  for (const [operation, creation] of [
    ["verify", candidateCreation],
    ["verify-public", f.value.hosts[0]!.creation],
  ]) {
    f.value.hosts[0]!.creation = creation;
    await writeFile(receiptPath, JSON.stringify(f.value));
    assert.throws(
      () =>
        execFileSync(
          process.execPath,
          [
            "--import",
            "tsx",
            "scripts/release/first-use.ts",
            operation,
            paths.runtime,
            paths.creator,
            receiptPath,
          ],
          { stdio: "pipe" },
        ),
      /Current 0\.1\.16 publication requires native/u,
    );
    assert.throws(
      () =>
        execFileSync(
          process.execPath,
          [
            "--import",
            "tsx",
            "scripts/release/first-use.ts",
            operation,
            paths.runtime,
            paths.creator,
            receiptPath,
            "--allow-inline",
          ],
          { stdio: "pipe" },
        ),
      /Usage:/u,
    );
  }
});

test("historical serial diagnostics preserve exact scope, package and delivery checks without publication permission", async (context) => {
  const base = codexSerialCombined();
  const paths = await packReceiptCandidates(context, base);
  const make = () => structuredClone(base);
  const check = (f: ReturnType<typeof make>) =>
    verifyHistoricalReceipt(f.value, paths.runtime, paths.creator);
  const result = await check(make());
  assert.equal(result.status, "first-use-historical-receipt-verified");
  assert.equal(result.publicationEligible, false);
  const receiptPath = join(dirname(paths.runtime), "receipt.json");
  await writeFile(receiptPath, JSON.stringify(base.value));
  const diagnostic = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/release/first-use.ts",
        "verify-historical",
        paths.runtime,
        paths.creator,
        receiptPath,
      ],
      { encoding: "utf8" },
    ),
  );
  assert.equal(diagnostic.status, "first-use-historical-receipt-verified");
  assert.equal(diagnostic.publicationEligible, false);
  for (const mutate of [
    (f: ReturnType<typeof make>) => {
      delete f.value.hosts[0].inlineExecution;
    },
    (f: ReturnType<typeof make>) => {
      delete f.value.hosts[0].inlineExecution.releaseScope;
    },
    (f: ReturnType<typeof make>) => {
      f.value.hosts[0].inlineExecution.releaseScope.parallelExecution =
        "passed";
    },
    (f: ReturnType<typeof make>) => {
      f.value.hosts[0].nativeExecution =
        combined().value.hosts[0].nativeExecution;
    },
    (f: ReturnType<typeof make>) => {
      f.value.hosts[0].finalCheck.checks.pop();
    },
    (f: ReturnType<typeof make>) => {
      f.value.hosts[0].inlineExecution.tasks[1].boundAt =
        f.value.hosts[0].inlineExecution.tasks[0].boundAt;
    },
    (f: ReturnType<typeof make>) => {
      f.value.hosts[0].packages.runtime.fingerprint = sha256("other package");
    },
  ]) {
    const f = make();
    mutate(f);
    await assert.rejects(() => check(f));
  }
});

test("historical public diagnostics retain registry integrity and the diagnostic CLI cannot publish", async (context) => {
  const base = codexSerialCombined();
  const paths = await packReceiptCandidates(context, base);
  base.value.hosts[0]!.creation = await publicReceiptCreation(paths, base);
  const check = (f = base) =>
    verifyHistoricalReceipt(f.value, paths.runtime, paths.creator);
  assert.equal((await check()).publicationEligible, false);
  const receiptPath = join(dirname(paths.runtime), "receipt.json");
  await writeFile(receiptPath, JSON.stringify(base.value));
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/release/first-use.ts",
        "verify-historical",
        paths.runtime,
        paths.creator,
        receiptPath,
      ],
      { encoding: "utf8" },
    ),
  );
  assert.equal(result.status, "first-use-historical-receipt-verified");
  assert.equal(result.publicationEligible, false);
  for (const mutate of [
    (f: typeof base) => {
      f.value.hosts[0].creation.packages.runtime.integrity = `sha512-${createHash("sha512").update("other package").digest("base64")}`;
    },
    (f: typeof base) => {
      f.value.hosts[0].creation.runtimeTarballChecksum =
        sha256("other tarball");
    },
    (f: typeof base) => {
      f.value.hosts[0].creation.packages.runtime.tarball =
        "https://example.com/package.tgz";
    },
  ]) {
    const f = structuredClone(base);
    mutate(f);
    await assert.rejects(() => check(f));
  }
});

test("historical diagnostics reject mixed creation methods and cannot extend the serial exception to future versions", async (context) => {
  const mixed = combined();
  const paths = await packReceiptCandidates(context, mixed);
  mixed.value.hosts[1]!.creation = await publicReceiptCreation(paths, mixed);
  await assert.rejects(
    () => verifyHistoricalReceipt(mixed.value, paths.runtime, paths.creator),
    /same exact creation method/u,
  );

  const future = codexSerialCombined();
  future.runtime.version = future.creator.version = "0.1.17";
  const hermes = structuredClone(future.value.hosts[0]);
  hermes.host = "hermes";
  hermes.sessionId = "future-hermes";
  hermes.sessionChecksum = future.value.hosts[0].runChecksum;
  future.value.hosts.push(hermes);
  const futurePaths = await packReceiptCandidates(context, future);
  await assert.rejects(
    () =>
      verifyHistoricalReceipt(
        future.value,
        futurePaths.runtime,
        futurePaths.creator,
      ),
    /Inline exception does not apply/u,
  );
});

test("current 0.1.16 public native verification retains four-way and later-admission requirements", async (context) => {
  const f = combined();
  f.value.hosts.splice(1);
  f.runtime.version = f.creator.version = "0.1.16";
  const paths = await packReceiptCandidates(context, f);
  f.value.hosts[0]!.creation = await publicReceiptCreation(paths, f);
  assert.equal(
    (await verifyPublicReceipt(f.value, paths.runtime, paths.creator)).status,
    "first-use-public-registry-passed",
  );
  for (const mutate of [
    (changed: typeof f) => {
      changed.value.hosts[0].nativeExecution.fourWayBoundOverlapMs = 0;
    },
    (changed: typeof f) => {
      changed.value.hosts[0].nativeExecution.peakBoundTasks = 3;
    },
    (changed: typeof f) => {
      changed.value.hosts[0].nativeExecution.refillAdmissions = 0;
    },
  ]) {
    const changed = structuredClone(f);
    mutate(changed);
    await assert.rejects(() =>
      verifyPublicReceipt(changed.value, paths.runtime, paths.creator),
    );
  }
});
