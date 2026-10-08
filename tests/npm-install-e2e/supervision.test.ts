import assert from "node:assert/strict";
import test from "node:test";
import { auditSupervision } from "../../scripts/release/supervision";

const trace = () => {
  const rows: Record<string, unknown>[] = [];
  const say = (content: string) => rows.push({ role: "assistant", content });
  const call = (name: string, args: unknown, output: unknown) => {
    const id = `call-${rows.length}`;
    rows.push({
      role: "assistant",
      tool_calls: [{ id, function: { name, arguments: JSON.stringify(args) } }],
    });
    rows.push({
      role: "tool",
      tool_name: name,
      tool_call_id: id,
      content: JSON.stringify(output),
      timestamp: rows.length,
    });
  };
  say("继承首尾模板，共 10 秒；先检查环境，再制作正文。");
  call(
    "terminal",
    { command: "npm run project:create -- --project story" },
    { status: "project-created" },
  );
  call(
    "delegate_task",
    { tasks: [{ goal: "probe" }] },
    { status: "dispatched", mode: "background", delegation_id: "probe" },
  );
  say("正在验证子任务能力，完成后继续。");
  rows.push({
    role: "user",
    content: "[ASYNC DELEGATION BATCH COMPLETE — probe]\nNative result",
  });
  call(
    "terminal",
    { command: "npm run project:produce:inspect -- --project story" },
    { contractVersion: "production-inspection-v1" },
  );
  say("源文件就绪，预计两次旁白请求，无可复用制品；四并发制作。");
  call(
    "terminal",
    { command: "npm run project:produce:prepare -- --project story" },
    { status: "project-production-prepared" },
  );
  call(
    "delegate_task",
    { tasks: [{ goal: "own task" }] },
    { status: "dispatched", mode: "background", delegation_id: "workers" },
  );
  call(
    "terminal",
    {
      command: "npm run project:produce:continue -- --project story",
      background: true,
      notify: true,
    },
    {
      output: "Background process started",
      session_id: "proc_fixture",
      pid: 321,
      exit_code: 0,
      error: null,
      notify_on_complete: true,
    },
  );
  say("制作已启动，等待子任务和固定交付流程完成。");
  rows.push({
    role: "user",
    content: "[ASYNC DELEGATION BATCH COMPLETE — workers]\nNative result",
  });
  call(
    "process_manage",
    { action: "wait", session_id: "proc_fixture", timeout: 180 },
    {
      status: "exited",
      command: "npm run project:produce:continue -- --project story",
      exit_code: 0,
      output: JSON.stringify({ status: "project-production-complete" }),
    },
  );
  say("四文件已通过校验，视频完成。");
  return { rows, call };
};
const audit = (rows: unknown[], sessionSource = "tui") =>
  auditSupervision({
    host: "hermes",
    transcript: JSON.stringify(rows),
    sessionSource,
  });

test("TUI acceptance follows native batch completion and reports fixed delivery once", () => {
  assert.equal(audit(trace().rows).completedAsyncBatches, 2);
});
test("Hermes continuation must use a persistent native background process", () => {
  const { rows } = trace();
  for (const row of rows) {
    for (const call of (row.tool_calls ?? []) as Array<{
      function: { arguments: string };
    }>) {
      const args = JSON.parse(call.function.arguments);
      if (String(args.command).startsWith("npm run project:produce:continue")) {
        delete args.background;
        args.timeout = 600;
        call.function.arguments = JSON.stringify(args);
      }
    }
  }
  assert.throws(() => audit(rows), /native background process/u);
});
test("the native process alias cannot bypass continuation wait rules", () => {
  const { rows } = trace();
  for (const row of rows) {
    for (const call of (row.tool_calls ?? []) as Array<{
      function: { name: string; arguments: string };
    }>) {
      if (call.function.name === "process_manage") {
        call.function.name = "process";
        const args = JSON.parse(call.function.arguments);
        args.action = "poll";
        call.function.arguments = JSON.stringify(args);
      }
    }
  }
  assert.throws(() => audit(rows), /original handle/u);
});
test("synchronous oneshot evidence cannot certify the TUI notification lifecycle", () => {
  assert.throws(() => audit(trace().rows, "cli"), /real Hermes TUI/u);
});
test("Hermes may report in the same assistant message before executing its tools", () => {
  const { rows } = trace();
  for (const prefix of ["继承首尾模板", "源文件就绪"]) {
    const index = rows.findIndex((row) =>
      String(row.content).startsWith(prefix),
    );
    assert.equal(rows[index]!.role, "assistant");
    assert.ok(rows[index + 1]!.tool_calls);
    rows[index + 1]!.content = rows[index]!.content;
    rows.splice(index, 1);
  }
  assert.equal(audit(rows).reportedBeforePrepare, true);
});
test("a pending update after fixed delivery may yield for remaining native notifications", () => {
  const { rows } = trace();
  const notificationIndex = rows.findIndex((row) =>
    String(row.content).startsWith(
      "[ASYNC DELEGATION BATCH COMPLETE — workers]",
    ),
  );
  const notification = rows.splice(notificationIndex, 1)[0]!;
  assert.equal(notification.role, "user");
  rows.splice(
    rows.length - 1,
    0,
    { role: "assistant", content: "交付已验完，等待剩余原生通知后汇报。" },
    notification,
  );
  assert.equal(audit(rows).completedAsyncBatches, 2);
});
test("tool output does not substitute for a user-visible cost report", () => {
  const { rows } = trace();
  assert.throws(
    () =>
      audit(
        rows.filter(
          (row) =>
            row.content !==
            "源文件就绪，预计两次旁白请求，无可复用制品；四并发制作。",
        ),
      ),
    /inspect report/u,
  );
});
test("delayed child notifications after the final report fail supervision acceptance", () => {
  const { rows } = trace();
  const index = rows.findIndex((row) =>
    String(row.content).startsWith(
      "[ASYNC DELEGATION BATCH COMPLETE — workers]",
    ),
  );
  rows.push(...rows.splice(index, 1));
  assert.throws(() => audit(rows), /precedes native/u);
});
test("a shell tool cannot hide two continuation invocations in one call", () => {
  const { rows } = trace();
  const row = rows.find((value) =>
    String(JSON.stringify(value.tool_calls)).includes(
      "project:produce:continue",
    ),
  )!;
  const calls = row.tool_calls as Array<{ function: { arguments: string } }>;
  const input = JSON.parse(calls[0]!.function.arguments);
  input.command += "; " + input.command;
  calls[0]!.function.arguments = JSON.stringify(input);
  assert.throws(() => audit(rows), /exactly once/u);
});
test("Codex native code-mode execution distinguishes shell commands from search terms", () => {
  const { rows } = trace();
  const records = rows.flatMap<Record<string, unknown>>((row, index) => {
    if (row.tool_calls) {
      const calls = row.tool_calls as Array<{
        id: string;
        function: { name: string; arguments: string };
      }>;
      return calls.map((call) => {
        const input = JSON.parse(call.function.arguments);
        const command = input.command;
        return {
          type: "response_item",
          timestamp: index,
          payload:
            call.function.name === "process_manage"
              ? {
                  type: "function_call",
                  name: "write_stdin",
                  call_id: call.id,
                  arguments: JSON.stringify({
                    session_id: input.session_id,
                    chars: "",
                    yield_time_ms: 60000,
                  }),
                }
              : command
                ? {
                    type: "custom_tool_call",
                    name: "functions.exec",
                    call_id: call.id,
                    input: `text(await tools.exec_command(${JSON.stringify({ cmd: command })}));`,
                  }
                : {
                    type: "function_call",
                    name: call.function.name,
                    call_id: call.id,
                    arguments: call.function.arguments,
                  },
        };
      });
    }
    return [
      {
        type: "response_item",
        timestamp: index,
        payload:
          row.role === "tool"
            ? {
                type: "custom_tool_call_output",
                call_id: row.tool_call_id,
                output:
                  JSON.parse(String(row.content)).output ===
                  "Background process started"
                    ? JSON.stringify({ session_id: "proc_fixture", output: "" })
                    : row.content,
              }
            : {
                type: "message",
                role: row.role,
                content: [{ type: "output_text", text: row.content }],
              },
      },
    ];
  });
  records.push({
    type: "response_item",
    timestamp: 99,
    payload: {
      type: "custom_tool_call",
      name: "functions.exec",
      call_id: "search",
      input:
        'text(await tools.exec_command({cmd:"rg project:produce:continue scripts package.json"}));',
    },
  });
  // Codex completion does not use Hermes background batch messages.
  const transcript = records
    .map((record) =>
      JSON.stringify(record).replaceAll("background", "synchronous"),
    )
    .join("\n");
  assert.equal(
    auditSupervision({ host: "codex", transcript }).continuationCalls,
    1,
  );
});
for (const [name, args, message] of [
  ["terminal", { command: "sleep 30" }, /Shell sleep/u],
  ["delegate_task", { action: "list" }, /Child list/u],
  [
    "read_file",
    { path: "/private/delegation/live/batch/task-0.log" },
    /child transcripts/u,
  ],
  [
    "process_manage",
    { action: "poll", session_id: "proc_fixture" },
    /original handle/u,
  ],
  [
    "process_manage",
    { action: "wait", session_id: "proc_fixture", timeout: 1 },
    /long native/u,
  ],
] as const) {
  test(`supervision rejects ${name} ${JSON.stringify(args)}`, () => {
    const { rows, call } = trace();
    if (name === "process_manage" && args.action === "wait") {
      const wait = rows
        .flatMap(
          (row) =>
            (row.tool_calls ?? []) as Array<{
              function: { name: string; arguments: string };
            }>,
        )
        .find((call) => call.function.name === "process_manage")!;
      wait.function.arguments = JSON.stringify(args);
    } else {
      call(name, args, {});
    }
    assert.throws(() => audit(rows), message);
  });
}

const uiTrace = (withEmptyTool = false) => {
  const { rows, call } = trace();
  if (withEmptyTool) {
    call("skills_list", {}, { skills: [] });
    rows.splice(1, 0, ...rows.splice(-2));
  }
  const rpc: Record<string, unknown>[] = [
    {
      jsonrpc: "2.0",
      id: "create",
      result: {
        session_id: "ui",
        stored_session_id: "stored",
        message_count: 0,
        messages: [],
        info: { cwd: "/workspace" },
      },
    },
  ];
  let seq = 0;
  const callArgs = new Map<string, unknown>();
  const event = (type: string, payload: unknown) =>
    rpc.push({
      jsonrpc: "2.0",
      method: "event",
      params: { type, session_id: "ui", seq: ++seq, payload },
    });
  for (const row of rows) {
    if (row.role === "assistant" && row.content) {
      const final = String(row.content).startsWith("四文件");
      event(final ? "message.complete" : "message.interim", {
        text: row.content,
      });
      if (!final) row.content = "";
    }
    for (const call of (row.tool_calls ?? []) as Array<{
      id: string;
      function: { name: string; arguments: string };
    }>) {
      callArgs.set(call.id, JSON.parse(call.function.arguments));
      event("tool.start", {
        tool_id: call.id,
        name: call.function.name,
        args: callArgs.get(call.id),
      });
    }
    if (row.role === "tool")
      event("tool.complete", {
        tool_id: row.tool_call_id,
        name: row.tool_name,
        args: callArgs.get(String(row.tool_call_id)),
        result: JSON.parse(String(row.content)),
      });
  }
  return { rows, rpc };
};
const auditUi = ({ rows, rpc }: ReturnType<typeof uiTrace>) =>
  auditSupervision({
    host: "hermes",
    transcript: JSON.stringify(rows),
    sessionSource: "tui",
    hermesUi: {
      rpc: rpc.map((row) => JSON.stringify(row)).join("\n"),
      sessionId: "stored",
      uiSessionId: "ui",
      workspace: "/workspace",
    },
  });

test("TUI UI-only interim reports are bound to native calls without changing the DB transcript", () => {
  const input = uiTrace();
  const before = JSON.stringify(input.rows);
  assert.ok(auditUi(input).uiEvidence?.checksum.startsWith("sha256:"));
  assert.equal(JSON.stringify(input.rows), before);
});
test("TUI omission of empty start arguments still binds the original no-argument call", () => {
  const input = uiTrace(true);
  const start = input.rpc.find(
    (row) =>
      (row.params as { type?: string; payload?: { name?: string } })?.type ===
        "tool.start" &&
      (row.params as { payload?: { name?: string } }).payload?.name ===
        "skills_list",
  )!;
  const payload = (start.params as { payload: Record<string, unknown> })
    .payload;
  delete payload.args;
  const before = JSON.stringify(input.rows);
  assert.equal(auditUi(input).continuationCalls, 1);
  assert.equal(JSON.stringify(input.rows), before);
  for (const supplied of [null, [], { changed: true }]) {
    payload.args = supplied;
    assert.throws(() => auditUi(input), /TUI tool arguments differ/u);
  }
  delete payload.args;
  const call = input.rows
    .flatMap(
      (row) =>
        (row.tool_calls ?? []) as Array<{
          function: { name: string; arguments: string };
        }>,
    )
    .find((call) => call.function.name === "skills_list")!;
  for (const original of ['{"parameter":"value"}', "[]", "null"]) {
    call.function.arguments = original;
    assert.throws(() => auditUi(input), /TUI tool arguments differ/u);
  }
});
for (const mutation of [
  "session",
  "stored-session",
  "workspace",
  "final-report",
  "args",
  "result",
  "id",
  "missing-report",
  "missing-tool",
  "sequence",
] as const) {
  test(`native TUI supervision rejects ${mutation}`, () => {
    const input = uiTrace();
    const start = input.rpc.find(
      (row) => (row.params as { type?: string })?.type === "tool.start",
    )!.params as {
      session_id: string;
      seq: number;
      payload: Record<string, unknown>;
    };
    const creation = input.rpc[0]!.result as {
      stored_session_id: string;
      info: { cwd: string };
    };
    if (mutation === "stored-session") creation.stored_session_id = "other";
    if (mutation === "workspace") creation.info.cwd = "/other";
    if (mutation === "final-report")
      (
        input.rpc.find(
          (row) =>
            (row.params as { type?: string })?.type === "message.complete",
        )!.params as { payload: { text: string } }
      ).payload.text = "forged";
    if (mutation === "session") start.session_id = "other";
    if (mutation === "args") start.payload.args = { command: "forged" };
    if (mutation === "id") start.payload.tool_id = "forged";
    if (mutation === "sequence") start.seq = 999;
    if (mutation === "result")
      (
        input.rpc.find(
          (row) => (row.params as { type?: string })?.type === "tool.complete",
        )!.params as { payload: Record<string, unknown> }
      ).payload.result = { status: "forged" };
    if (mutation === "missing-report")
      input.rpc = input.rpc.filter(
        (row) => (row.params as { type?: string })?.type !== "message.interim",
      );
    if (mutation === "missing-tool")
      input.rpc = input.rpc.filter(
        (row) => (row.params as { type?: string })?.type !== "tool.start",
      );
    assert.throws(() => auditUi(input));
  });
}

test("TUI native tool_call bridge authenticates its actual UI name and inner arguments", () => {
  const input = uiTrace();
  const call = input.rows
    .flatMap(
      (row) =>
        (row.tool_calls ?? []) as Array<{
          function: { name: string; arguments: string };
        }>,
    )
    .find((call) => call.function.name === "process_manage")!;
  const inner = {
    name: call.function.name,
    arguments: JSON.parse(call.function.arguments),
  };
  call.function = { name: "tool_call", arguments: JSON.stringify(inner) };
  assert.equal(auditUi(input).continuationCalls, 1);
  call.function.arguments = JSON.stringify({ calls: [inner] });
  assert.equal(auditUi(input).continuationCalls, 1);
  inner.arguments.timeout = 1;
  call.function.arguments = JSON.stringify({ calls: [inner] });
  assert.throws(() => auditUi(input), /arguments differ from native DB/u);
});

for (const format of ["jpeg", "png"] as const)
  test(`TUI vision result binds native text and retains the ${format} image in raw UI evidence`, () => {
    const input = uiTrace();
    const callId = "vision-call";
    const visionArgs = { path: "/frame.png", question: "Review frame" };
    const text = "Visible frame review";
    const result = {
      _multimodal: true,
      content: [
        { type: "text", text },
        {
          type: "image_url",
          image_url: {
            url:
              format === "jpeg"
                ? "data:image/jpeg;base64,/9j/"
                : "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==",
          },
        },
      ],
    };
    const dbIndex = input.rows.findIndex((row) =>
      String(row.content).startsWith("四文件"),
    );
    input.rows.splice(
      dbIndex,
      0,
      {
        role: "assistant",
        tool_calls: [
          {
            id: callId,
            function: {
              name: "vision_analyze",
              arguments: JSON.stringify(visionArgs),
            },
          },
        ],
      },
      {
        role: "tool",
        timestamp: 1,
        tool_call_id: callId,
        tool_name: "vision_analyze",
        content: `${text}\n[screenshot]`,
      },
    );
    const uiIndex = input.rpc.findIndex(
      (row) =>
        (row.params as { type?: string } | undefined)?.type ===
        "message.complete",
    );
    input.rpc.splice(
      uiIndex,
      0,
      {
        jsonrpc: "2.0",
        method: "event",
        params: {
          type: "tool.start",
          session_id: "ui",
          payload: {
            tool_id: callId,
            name: "vision_analyze",
            args: visionArgs,
          },
        },
      },
      {
        jsonrpc: "2.0",
        method: "event",
        params: {
          type: "tool.complete",
          session_id: "ui",
          payload: {
            tool_id: callId,
            name: "vision_analyze",
            args: visionArgs,
            result,
          },
        },
      },
    );
    let sequence = 0;
    for (const row of input.rpc) {
      if (row.method === "event")
        (row.params as Record<string, unknown>).seq = ++sequence;
    }
    assert.equal(auditUi(input).continuationCalls, 1);
    const originalImage = result.content[1]!.image_url!.url;
    for (const invalid of [
      "data:image/png;base64,/9j/",
      "data:image/jpeg;base64,iVBORw0KGgo=",
      "data:image/gif;base64,R0lGODlhAQABAIAAAA==",
    ]) {
      result.content[1]!.image_url!.url = invalid;
      assert.throws(() => auditUi(input));
    }
    result.content[1]!.image_url!.url = originalImage;
    result.content[0]!.text = "Changed frame review";
    assert.throws(() => auditUi(input), /vision text differs/u);
  });

test("explicit inline supervision preserves reports and fixed continuation without delegation", () => {
  const rows = trace().rows.filter(
    (row) =>
      row.role !== "user" &&
      row.tool_name !== "delegate_task" &&
      !(
        row.tool_calls as Array<{ function: { name: string } }> | undefined
      )?.some((call) => call.function.name === "delegate_task"),
  );
  const inline = (records: unknown[]) =>
    auditSupervision({
      host: "hermes",
      sessionSource: "tui",
      executionMode: "inline",
      transcript: JSON.stringify(records),
    });
  assert.equal(inline(rows).asyncBatches, 0);
  assert.throws(() => audit(rows), /did not exercise background delegation/u);
  assert.throws(() => inline(trace().rows), /forbids all delegation/u);
  assert.throws(
    () =>
      inline(
        rows.filter((row) => !String(row.content).startsWith("源文件就绪")),
      ),
    /inspect report/u,
  );
  const changed = structuredClone(rows);
  for (const row of changed)
    for (const call of (row.tool_calls ?? []) as Array<{
      function: { arguments: string };
    }>) {
      const args = JSON.parse(call.function.arguments);
      if (String(args.command).startsWith("npm run project:produce:continue")) {
        delete args.background;
        call.function.arguments = JSON.stringify(args);
      }
    }
  assert.throws(() => inline(changed), /native background process/u);
});
