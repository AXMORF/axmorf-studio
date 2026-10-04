import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertFourWayExecution,
  authenticateCodexCommands,
  auditProductionAttempts,
  auditNativeExecution,
  nativeTrace,
  shellCommands,
  NativeExecutionSchema,
} from "../../scripts/release/native-execution";
import {
  auditSupervision,
  SupervisionSchema,
} from "../../scripts/release/supervision";
import {
  auditTranscript,
  assertFinalAttemptDelivery,
  HostReceiptSchema,
  verifyReceipt,
} from "../../scripts/release/first-use";
import {
  fingerprint,
  sha256,
  type PackageContent,
} from "../../scripts/release/package-content";
import { DeliveryBuildIdSchema } from "../../packages/studio/src/contracts/delivery-build";
import { ProductionRevisionIdSchema } from "../../packages/studio/src/contracts/production-revision";
import { StoryIdSchema } from "../../packages/studio/src/contracts/primitives";

type Row = {
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
};
const at = (second: number) =>
  new Date(Date.parse("2026-10-02T00:00:00Z") + second * 1_000).toISOString();
const text = (rows: Row[]) => rows.map((row) => JSON.stringify(row)).join("\n");
const tool = (
  id: string,
  second: number,
  output: unknown,
  command?: string,
): Row[] => [
  {
    type: "response_item",
    timestamp: at(second),
    payload: {
      type: "custom_tool_call",
      name: command ? "functions.exec" : "spawn_agent",
      call_id: id,
      input: command
        ? `text(await tools.exec_command(${JSON.stringify({ cmd: command })}));`
        : "{}",
    },
  },
  {
    type: "response_item",
    timestamp: at(second),
    payload: {
      type: "custom_tool_call_output",
      call_id: id,
      output: JSON.stringify(output),
    },
  },
];
const processWait = (
  id: string,
  second: number,
  sessionId: number,
  output: unknown,
): Row[] => {
  const rows = tool(id, second, {
    chunk_id: id,
    wall_time_seconds: 1,
    exit_code: 0,
    output: JSON.stringify(output),
  });
  rows[0]!.payload.name = "functions.exec";
  rows[0]!.payload.input = `const r = await tools.write_stdin({session_id:${sessionId},chars:"",yield_time_ms:60000});text(JSON.stringify(r));`;
  return rows;
};
const nativeTool = (
  id: string,
  second: number,
  name: string,
  arguments_: Record<string, unknown>,
  output: unknown,
): Row[] => [
  {
    type: "response_item",
    timestamp: at(second),
    payload: {
      type: "function_call",
      name,
      call_id: id,
      arguments: JSON.stringify(arguments_),
    },
  },
  {
    type: "response_item",
    timestamp: at(second),
    payload: {
      type: "function_call_output",
      call_id: id,
      output,
    },
  },
];
const say = (second: number, content: string): Row => ({
  type: "response_item",
  timestamp: at(second),
  payload: {
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text: content }],
  },
});
const resolution = {
  status: "ready",
  mode: "subagents",
  workerTransport: "shared-workspace",
  source: { mode: "builtin-default", maxConcurrency: "builtin-default" },
  requestedMaxConcurrency: 4,
  effectiveMaxConcurrency: 4,
};

async function fixture(context: {
  after: (callback: () => Promise<unknown>) => void;
}) {
  const workspace = await mkdtemp(join(tmpdir(), "axmorf-native-revisions-"));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  const prompt = "请制作一条中文视频，并检查成片与两张封面后交付。";
  const firstTasks = Array.from({ length: 5 }, (_, index) => ({
    taskRevision: `task-${index}`,
  }));
  const secondTasks = [{ taskRevision: "revised-cover" }];
  const continuation = (attempt: string, revision: string, candidate = "") =>
    `npm run project:produce:continue -- --project story --revision ${revision} --attempt ${attempt}${candidate ? ` --candidate ${candidate}` : ""}`;
  const rows: Row[] = [
    {
      type: "session_meta",
      timestamp: at(0),
      payload: { id: "parent", cwd: workspace },
    },
    {
      type: "response_item",
      timestamp: at(0),
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: prompt }],
        internal_chat_message_metadata_passthrough: {
          content_item_kinds: ["user.text"],
        },
      },
    },
    say(0, "首尾沿用模板，先检查环境与生产估算。"),
    ...tool(
      "create",
      0,
      {
        status: "project-created",
        storyId: "story",
        creationIdentity: "creation-one",
      },
      "npm run project:create -- --project story --input create.json",
    ),
    ...tool(
      "resolve-first",
      5,
      resolution,
      "npm run project:execution:resolve -- --runtime-capacity 4",
    ),
    ...tool(
      "inspect-first",
      6,
      {
        contractVersion: "production-inspection-v1",
        storyId: "story",
        currentRevisionId: "revision-one",
      },
      "npm run project:produce:inspect -- --project story",
    ),
    say(7, "源文件就绪，无可复用制品，预计五个原创任务，四并发制作。"),
    ...tool(
      "prepare-first",
      10,
      {
        status: "project-production-prepared",
        storyId: "story",
        attemptId: "attempt-one",
        revisionId: "revision-one",
        dirtyAgentTasks: firstTasks,
        continuationCommand: continuation("attempt-one", "revision-one"),
      },
      "npm run project:produce:prepare -- --project story",
    ),
    ...tool(
      "continue-first",
      21,
      { session_id: 101, output: "" },
      continuation("attempt-one", "revision-one"),
    ),
    ...processWait("fixed-first", 95, 101, {
      status: "project-production-complete",
      revisionId: "revision-one",
      attemptRecorded: true,
      delivery: { deliveryBuildId: "delivery-one" },
    }),
    say(96, "四文件已验完，关键帧中封面文字重叠，需要公开修订。"),
    ...tool(
      "revision-context",
      100,
      {
        status: "project-revision-context",
        storyId: "story",
        baseRevisionId: "revision-one",
        baseDeliveryBuildId: "delivery-one",
      },
      "npm run project:revise:context -- --project story",
    ),
    ...tool(
      "revision-valid",
      103,
      {
        status: "project-revision-valid",
        storyId: "story",
        candidateId: "candidate-two",
        baseRevisionId: "revision-one",
        baseDeliveryBuildId: "delivery-one",
      },
      "npm run project:revise:validate -- --input revision.json",
    ),
    ...tool(
      "revision-created",
      104,
      {
        status: "project-revision-candidate-created",
        storyId: "story",
        candidateId: "candidate-two",
        baseRevisionId: "revision-one",
        baseDeliveryBuildId: "delivery-one",
      },
      "npm run project:revise -- --input revision.json",
    ),
    ...tool(
      "resolve-second",
      110,
      resolution,
      "npm run project:execution:resolve -- --runtime-capacity 4",
    ),
    ...tool(
      "inspect-second",
      111,
      {
        contractVersion: "production-inspection-v1",
        storyId: "story",
        currentRevisionId: "revision-two",
      },
      "npm run project:produce:inspect -- --project story --candidate candidate-two",
    ),
    say(112, "候选方案已检查，只需重做封面，其他有效制品复用。"),
    ...tool(
      "prepare-second",
      115,
      {
        status: "project-production-prepared",
        storyId: "story",
        attemptId: "attempt-two",
        revisionId: "revision-two",
        dirtyAgentTasks: secondTasks,
        continuationCommand: continuation(
          "attempt-two",
          "revision-two",
          "candidate-two",
        ),
      },
      "npm run project:produce:prepare -- --project story --candidate candidate-two",
    ),
    ...tool(
      "continue-second",
      121,
      { session_id: 102, output: "" },
      continuation("attempt-two", "revision-two", "candidate-two"),
    ),
    ...processWait("fixed-second", 146, 102, {
      status: "project-revision-complete",
      storyId: "story",
      candidateId: "candidate-two",
      base: { revisionId: "revision-one", deliveryBuildId: "delivery-one" },
      expected: {
        revisionId: "revision-two",
        deliveryBuildId: "delivery-two",
      },
      production: {
        status: "project-production-complete",
        attemptId: "attempt-two",
        state: "succeeded",
        deliveryStatus: "verified",
        revisionId: "revision-two",
        deliveryBuildId: "delivery-two",
      },
      promotion: { status: "project-revision-promoted" },
    }),
    say(149, "修订后的四文件已经重新验证并交付。"),
  ];
  const intervals = [
    [1, 3, null, null],
    [20, 60, "attempt-one", "task-0"],
    [20, 65, "attempt-one", "task-1"],
    [20, 70, "attempt-one", "task-2"],
    [20, 75, "attempt-one", "task-3"],
    [61, 90, "attempt-one", "task-4"],
    [105, 107, null, null],
    [120, 140, "attempt-two", "revised-cover"],
  ] as const;
  const nativeChildren = [];
  for (const [
    index,
    [start, end, attemptId, taskRevision],
  ] of intervals.entries()) {
    const id = `child-${index}`;
    rows.push(...tool(`spawn-${index}`, start, { task_name: `/root/${id}` }));
    const child: Row[] = [
      {
        type: "session_meta",
        timestamp: at(start),
        payload: {
          id,
          cwd: workspace,
          source: {
            subagent: {
              thread_spawn: {
                parent_thread_id: "parent",
                depth: 1,
                agent_path: `/root/${id}`,
              },
            },
          },
        },
      },
      ...tool(
        `child-bind-${index}`,
        start + 1,
        taskRevision === null
          ? { status: index === 6 ? "probe-failed" : "probe-complete" }
          : {
              status: "task-worker-bound",
              storyId: "story",
              attemptId,
              taskRevision,
              transport: "shared-workspace",
            },
        taskRevision === null
          ? "node -e 'process.exit(0)'"
          : "npm run project:task:bind -- --assignment 1",
      ),
      ...(taskRevision === null
        ? []
        : tool(
            `child-commit-${index}`,
            end - 1,
            {
              status: "producer-artifact-committed",
              attemptRecorded: true,
              artifact: { taskRevision },
            },
            "npm run project:task:commit -- --assignment 1",
          )),
      {
        type: "event_msg",
        timestamp: at(end),
        payload: { type: "task_complete" },
      },
    ];
    const transcriptFile = join(workspace, `${id}.jsonl`);
    await writeFile(transcriptFile, text(child));
    nativeChildren.push({ transcriptFile });
  }
  rows.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const input = {
    host: "codex" as const,
    transcript: text(rows),
    sessionId: "parent",
    workspace,
    startedAt: at(0),
    endedAt: at(150),
    storyId: "story",
    nativeChildren,
  };
  return { input, rows, prompt };
}
const changeResult = (
  rows: Row[],
  callId: string,
  change: (value: Record<string, unknown>) => void,
) => {
  const row = rows.find(
    (row) => row.payload.call_id === callId && row.payload.output !== undefined,
  )!;
  const value = JSON.parse(String(row.payload.output));
  if (typeof value.output === "string" && value.exit_code === 0) {
    const commandResult = JSON.parse(value.output);
    change(commandResult);
    value.output = JSON.stringify(commandResult);
  } else change(value);
  row.payload.output = JSON.stringify(value);
};
const removeCall = (rows: Row[], callId: string) =>
  rows.filter((row) => row.payload.call_id !== callId);

// Native results can arrive through the original code cell and then the
// original command process; keep the real return time and call identity.
const deferResult = (
  rows: Row[],
  callId: string,
  sessionId: number,
  options: { direct?: boolean; launchCell?: string; waitCell?: string } = {},
) => {
  const launch = rows.find(
    (row) => row.payload.call_id === callId && row.payload.output === undefined,
  )!;
  const result = rows.find(
    (row) => row.payload.call_id === callId && row.payload.output !== undefined,
  )!;
  const original = JSON.parse(String(result.payload.output));
  const second = (Date.parse(launch.timestamp) - Date.parse(at(0))) / 1000;
  const wrapped = (value: unknown) => [
    {
      type: "input_text",
      text: "Script completed\nWall time 1 seconds\nOutput:\n",
    },
    { type: "input_text", text: JSON.stringify(value) },
  ];
  const pending = options.direct
    ? `Chunk ID: pending\nWall time: 1 seconds\nProcess running with session ID ${sessionId}\nFinal output:\n`
    : wrapped({
        chunk_id: "pending",
        wall_time_seconds: 1,
        session_id: sessionId,
        output: "",
      });
  if (options.direct) {
    const input = String(launch.payload.input);
    const command = /"cmd":"([^"]+)"/u.exec(input)![1]!;
    launch.payload.type = "function_call";
    launch.payload.name = "functions.exec_command";
    launch.payload.arguments = JSON.stringify({
      cmd: command,
      yield_time_ms: 1000,
    });
    delete launch.payload.input;
    result.payload.type = "function_call_output";
  }
  result.payload.output = options.launchCell
    ? `Script running with cell ID ${options.launchCell}\nWall time 30 seconds\nOutput:\n`
    : pending;
  if (options.launchCell)
    rows.push(
      ...nativeTool(
        `${callId}-cell`,
        second + 0.2,
        "functions.wait",
        { cell_id: options.launchCell, yield_time_ms: 60000 },
        pending,
      ),
    );
  const waited = options.direct
    ? nativeTool(
        `${callId}-process`,
        second + 0.4,
        "functions.write_stdin",
        { session_id: sessionId, chars: "", yield_time_ms: 60000 },
        `Chunk ID: done\nWall time: 1 seconds\nProcess exited with code 0\nFinal output:\n${JSON.stringify(original)}`,
      )
    : processWait(`${callId}-process`, second + 0.4, sessionId, original);
  if (options.waitCell) {
    const finished = waited[1]!.payload.output;
    waited[1]!.payload.output = `Script running with cell ID ${options.waitCell}\nWall time 30 seconds\nOutput:\n`;
    rows.push(
      ...nativeTool(
        `${callId}-wait-cell`,
        second + 0.6,
        "functions.wait",
        { cell_id: options.waitCell, yield_time_ms: 60000 },
        wrapped(JSON.parse(String(finished))),
      ),
    );
  }
  rows.push(...waited);
  rows.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
};

async function uiFixture(
  context: Parameters<typeof fixture>[0],
  single = false,
) {
  const { input, rows } = await fixture(context);
  const original = new Map<string, unknown>();
  const ui: Array<Record<string, unknown>> = [];
  for (const call of rows.filter((row) => row.payload.input !== undefined)) {
    const command = shellCommands(String(call.payload.name), {
      code: call.payload.input,
    })[0];
    if (!command) continue;
    call.payload.input = `text(await tools.exec_command(${JSON.stringify({ cmd: command, workdir: input.workspace })}));`;
    call.payload.internal_chat_message_metadata_passthrough = {
      turn_id: "root-turn",
    };
    const result = rows.find(
      (row) =>
        row.payload.call_id === call.payload.call_id &&
        row.payload.output !== undefined,
    )!;
    if (!String(result.payload.output).startsWith("{")) continue;
    const value = JSON.parse(String(result.payload.output));
    original.set(String(call.payload.call_id), value);
    const seconds = (Date.parse(call.timestamp) - Date.parse(at(0))) / 1000;
    if (
      value.session_id === undefined &&
      !["prepare-first", "prepare-second"].includes(
        String(call.payload.call_id),
      )
    )
      result.timestamp = at(seconds + 0.4);
    const id = `exec-${call.payload.call_id}`;
    const processId =
      call.payload.call_id === "prepare-first"
        ? "17172"
        : call.payload.call_id === "prepare-second"
          ? "23481"
          : call.payload.call_id === "continue-first"
            ? "101"
            : call.payload.call_id === "continue-second"
              ? "102"
              : `other-${id}`;
    const fixedResult = ["continue-first", "continue-second"].includes(
      String(call.payload.call_id),
    )
      ? rows.find(
          (row) =>
            row.payload.call_id ===
              (call.payload.call_id === "continue-first"
                ? "fixed-first"
                : "fixed-second") && row.payload.output !== undefined,
        )
      : undefined;
    const aggregatedOutput = fixedResult
      ? String(value.output) +
        String(JSON.parse(String(fixedResult.payload.output)).output)
      : value.session_id === undefined
        ? `${JSON.stringify(value)}\n`
        : "";
    const item = {
      type: "commandExecution",
      id,
      command: `/bin/zsh -lc '${command}'`,
      cwd: input.workspace,
      processId,
      status: "inProgress",
      aggregatedOutput: null,
      exitCode: null,
    };
    const params = { threadId: "parent", turnId: "root-turn" };
    ui.push(
      {
        method: "item/started",
        params: {
          ...params,
          item: { ...item },
          startedAtMs: Date.parse(at(seconds + 0.1)),
        },
      },
      {
        method: "item/commandExecution/outputDelta",
        params: { ...params, itemId: id, delta: aggregatedOutput },
      },
      {
        method: "item/completed",
        params: {
          ...params,
          item: { ...item, status: "completed", exitCode: 0, aggregatedOutput },
          completedAtMs: fixedResult
            ? Date.parse(fixedResult.timestamp) - 100
            : Date.parse(at(seconds + 0.3)),
        },
      },
    );
  }
  deferResult(rows, "prepare-first", 17172);
  deferResult(rows, "prepare-second", 23481, {
    launchCell: "67",
    waitCell: "68",
  });
  for (const callId of ["prepare-first-process", "prepare-second-wait-cell"]) {
    const result = rows.find(
      (row) =>
        row.payload.call_id === callId && row.payload.output !== undefined,
    )!;
    const wrapper =
      typeof result.payload.output === "string"
        ? JSON.parse(result.payload.output)
        : JSON.parse(
            (result.payload.output as Array<{ text: string }>)[1]!.text,
          );
    const full = `${wrapper.output}\n`;
    const begin = full.indexOf('"dirtyAgentTasks"') + 3;
    const end = full.indexOf('"continuationCommand"');
    wrapper.output = `${full.slice(0, begin)}…1705 tokens truncated…${full.slice(end)}`;
    result.payload.output = JSON.stringify(wrapper);
  }
  const completeRows = single
    ? rows.filter((row) => Date.parse(row.timestamp) < Date.parse(at(100)))
    : rows;
  const completeUi = single
    ? ui.filter(
        (row) =>
          !String(
            (row.params as { item?: { id?: string }; itemId?: string }).item
              ?.id ?? (row.params as { itemId?: string }).itemId,
          ).match(/(?:second|revision)/u),
      )
    : ui;
  return {
    input: {
      ...input,
      transcript: text(completeRows),
      nativeChildren: single
        ? input.nativeChildren.slice(0, 6)
        : input.nativeChildren,
      endedAt: single ? at(99) : input.endedAt,
    },
    ui: completeUi,
    original,
  };
}

test("read-only code-mode summaries retain their text without acquiring native command authority", async (context) => {
  const { input, ui: commands } = await uiFixture(context);
  const ui = [
    {
      method: "turn/started",
      params: {
        threadId: "parent",
        turn: {
          id: "root-turn",
          status: "inProgress",
          startedAt: Date.parse(at(0)) / 1000,
        },
      },
    },
    ...commands,
    {
      method: "turn/completed",
      params: {
        threadId: "parent",
        turn: {
          id: "root-turn",
          status: "completed",
          startedAt: Date.parse(at(0)) / 1000,
          completedAt: Date.parse(at(300)) / 1000,
        },
      },
    },
  ];
  const rows = input.transcript
    .split("\n")
    .map((line) => JSON.parse(line) as Row);
  const printed = (value: unknown) => [
    { type: "input_text", text: "Script completed\nOutput:\n" },
    { type: "input_text", text: JSON.stringify(value) },
  ];
  const summary = tool("prepare-summary", 11, {
    status: "project-production-prepared",
    attemptId: "attempt-one",
  });
  summary[0]!.payload.name = "functions.exec";
  summary[0]!.payload.input =
    'const p=load("prepareStructured");text({status:p.status,attemptId:p.attemptId});store("summary",p);';
  summary[0]!.payload.internal_chat_message_metadata_passthrough = {
    turn_id: "root-turn",
  };
  summary[1]!.timestamp = at(11.5);
  summary[1]!.payload.internal_chat_message_metadata_passthrough = {
    turn_id: "root-turn",
  };
  summary[1]!.payload.output = printed(
    JSON.parse(String(summary[1]!.payload.output)),
  );
  rows.push(...summary);
  rows.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const authenticate = (records = rows, rpc = ui) =>
    authenticateCodexCommands(nativeTrace("codex", text(records)), {
      rpc: rpc.map((row) => JSON.stringify(row)).join("\n"),
      sessionId: "parent",
      workspace: input.workspace,
    }).trace;
  const authenticated = authenticate();
  assert.deepEqual(
    authenticated.records,
    nativeTrace("codex", text(rows)).records,
  );
  assert.deepEqual(
    authenticated.outputs.find((row) => row.callId === "prepare-summary")!
      .objects,
    [],
  );
  assert.equal(auditProductionAttempts(authenticated)!.length, 2);
  for (const [label, source] of [
    [
      "serialized native output fields are sliced before JSON parsing",
      `const r=load("createContextResult");
const c=JSON.parse(r.output.slice(r.output.indexOf('{"status"')));
store("createContext",c);text({status:c.status});`,
    ],
    [
      "separate data-map callbacks keep their repeated parameter names local",
      `const r=load("createContextResult");
const c=JSON.parse(r.output.slice(r.output.indexOf('{"status"')));
text({sounds:c.soundResources.map(x=>({id:x.descriptor.id})),capabilities:c.capabilities.map(x=>({id:x.descriptor.id}))});`,
    ],
    [
      "stored output chunks are joined and sliced before JSON parsing",
      `const chunks=load("prepareChunks");
const all=chunks.map(x=>x.output).join("");
const prep=JSON.parse(all.slice(all.indexOf('{"status":"project-production-prepared"')));
store("prepared",prep);text({status:prep.status,attemptId:prep.attemptId});
for(let i=0;i<prep.dirtyAgentTasks.length;i++)text({assignment:i+1,workerPrompt:prep.dirtyAgentTasks[i].workerPrompts.sharedWorkspace});`,
    ],
    [
      "the native clock is called with its exact empty input",
      "text(await tools.clock__curr_time({}));",
    ],
    [
      "image batches destructure only data in their map parameter",
      `const base="/workspace/out/";
const items=[["opening","frame-0004.png"],["result","frame-0019.png"]];
const rs=await Promise.allSettled(items.map(async([label,file])=>({label,r:await tools.view_image({path:base+file})})));
for(let i=0;i<rs.length;i++){const v=rs[i];if(v.status==="fulfilled"){text(v.value.label);image(v.value.r.image_url);}else text({i,error:String(v.reason)});}`,
    ],
  ]) {
    await context.test(label!, () => {
      const changed = structuredClone(rows);
      changed.find(
        (row) => row.payload.call_id === "prepare-summary",
      )!.payload.input = source;
      const proved = authenticate(changed);
      assert.deepEqual(
        proved.records,
        nativeTrace("codex", text(changed)).records,
      );
      assert.deepEqual(
        proved.outputs.find((row) => row.callId === "prepare-summary")!.objects,
        [],
      );
      assert.equal(auditProductionAttempts(proved)!.length, 2);
    });
  }
  const overlapping = structuredClone(rows);
  for (const row of overlapping.filter(
    (row) => row.payload.call_id === "prepare-summary",
  ))
    row.timestamp = at(row.payload.output === undefined ? 30 : 30.5);
  const activeUi = structuredClone(ui);
  const continued = activeUi.filter(
    (row) =>
      ((row.params as { item?: { id?: string } }).item?.id ??
        (row.params as { itemId?: string }).itemId) === "exec-continue-first",
  );
  const completed = continued.find((row) => row.method === "item/completed")!;
  const terminal = JSON.parse(
    String(
      rows.find(
        (row) =>
          row.payload.call_id === "fixed-first" &&
          row.payload.output !== undefined,
      )!.payload.output,
    ),
  );
  for (const row of continued) {
    const params = row.params as Record<string, unknown>;
    if (params.item) (params.item as Record<string, unknown>).processId = "101";
    if (row.method === "item/completed") {
      params.completedAtMs = Date.parse(at(94.9));
      (params.item as Record<string, unknown>).aggregatedOutput =
        terminal.output;
    }
    if (row.method === "item/commandExecution/outputDelta")
      params.delta = terminal.output;
  }
  assert.equal(
    auditProductionAttempts(authenticate(overlapping, activeUi))!.length,
    2,
  );
  const preToolFailure = tool("failed-authoring-before-process", 1, {});
  preToolFailure[0]!.payload.name = "functions.exec";
  preToolFailure[0]!.payload.input = `const raw=load("context").value.output;
const context=JSON.parse(raw);
const input=structuredClone(context.example);
let result=await tools.exec_command({cmd:context.nextCommand});
text(result);
while(result.session_id!==undefined){result=await tools.write_stdin({session_id:result.session_id,chars:""});text(result);}`;
  for (const row of preToolFailure)
    row.payload.internal_chat_message_metadata_passthrough = {
      turn_id: "root-turn",
    };
  preToolFailure[1]!.timestamp = at(1.1);
  preToolFailure[1]!.payload.output = [
    {
      type: "input_text",
      text: "Script failed\nWall time 0.0 seconds\nOutput:\n",
    },
    {
      type: "input_text",
      text: "Script error:\nReferenceError: structuredClone is not defined\n    at exec_main.mjs:3:13",
    },
  ];
  const withFailure = [...overlapping, ...preToolFailure].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );
  assert.equal(
    auditProductionAttempts(authenticate(withFailure, activeUi))!.length,
    2,
  );
  const defaultCwd = structuredClone(withFailure);
  const continuation = defaultCwd.find(
    (row) =>
      row.payload.call_id === "continue-first" &&
      row.payload.input !== undefined,
  )!;
  const commandText = shellCommands(String(continuation.payload.name), {
    code: continuation.payload.input,
  })[0]!;
  const defaultSource = `let r=await tools.exec_command({cmd:${JSON.stringify(commandText)},yield_time_ms:1000});
text(r);
while(r.session_id!==undefined){r=await tools.write_stdin({session_id:r.session_id,chars:"",yield_time_ms:60000});text(r);}`;
  continuation.payload.input = defaultSource;
  const pending = defaultCwd.find(
    (row) =>
      row.payload.call_id === "continue-first" &&
      row.payload.output !== undefined,
  )!;
  pending.payload.output = [
    {
      type: "input_text",
      text: "Script running with cell ID continued-cell\nWall time 30 seconds\nOutput:\n",
    },
    {
      type: "input_text",
      text: JSON.stringify({ session_id: 101, output: "" }),
    },
  ];
  const wait = defaultCwd.find(
    (row) =>
      row.payload.call_id === "fixed-first" && row.payload.input !== undefined,
  )!;
  wait.payload.type = "function_call";
  wait.payload.name = "functions.wait";
  wait.payload.arguments = JSON.stringify({
    cell_id: "continued-cell",
    yield_time_ms: 60000,
  });
  delete wait.payload.input;
  defaultCwd.find(
    (row) =>
      row.payload.call_id === "fixed-first" && row.payload.output !== undefined,
  )!.payload.output = printed(terminal);
  const defaultUi = structuredClone(activeUi);
  (
    defaultUi.find(
      (row) =>
        row.method === "item/started" &&
        (row.params as { item?: { id?: string } }).item?.id ===
          "exec-continue-first",
    )!.params as { item: Record<string, unknown> }
  ).item.processId = null;
  assert.equal(
    auditProductionAttempts(authenticate(defaultCwd, defaultUi))!.length,
    2,
  );
  const dynamicCwd = structuredClone(defaultCwd);
  dynamicCwd.find(
    (row) =>
      row.payload.call_id === "continue-first" &&
      row.payload.input !== undefined,
  )!.payload.input = defaultSource.replace(
    "yield_time_ms:1000",
    'workdir:load("cwd"),yield_time_ms:1000',
  );
  assert.throws(() => authenticate(dynamicCwd, activeUi));
  const plainCwd = structuredClone(withFailure);
  plainCwd.find(
    (row) =>
      row.payload.call_id === "continue-first" &&
      row.payload.input !== undefined,
  )!.payload.input =
    `text(await tools.exec_command({cmd:${JSON.stringify(commandText)},yield_time_ms:1000}));`;
  assert.throws(
    () => authenticate(plainCwd, activeUi),
    /original prior process launch/u,
  );
  const reviewRows = structuredClone(withFailure);
  const reviewUi = structuredClone(activeUi);
  const reviewCommand =
    "npm run project:scene:review -- --project story --motion";
  const reviewStdout = `${JSON.stringify({ status: "scene-review-ready", projectId: "story" })}\n`;
  reviewRows.find(
    (row) =>
      row.payload.call_id === "continue-first" &&
      row.payload.input !== undefined,
  )!.payload.input =
    `text(await tools.exec_command(${JSON.stringify({ cmd: reviewCommand, workdir: input.workspace })}));`;
  const reviewTerminal = reviewRows.find(
    (row) =>
      row.payload.call_id === "fixed-first" && row.payload.output !== undefined,
  )!;
  reviewTerminal.payload.output = JSON.stringify({
    ...terminal,
    output: reviewStdout,
  });
  for (const row of reviewUi) {
    const params = row.params as {
      item?: Record<string, unknown>;
      itemId?: string;
      delta?: string;
    };
    if (params.item?.id === "exec-continue-first") {
      params.item.command = reviewCommand;
      if (row.method === "item/completed")
        params.item.aggregatedOutput = reviewStdout;
    }
    if (params.itemId === "exec-continue-first") params.delta = reviewStdout;
  }
  assert.doesNotThrow(() => authenticate(reviewRows, reviewUi));
  const borrowed = structuredClone(
    reviewUi.filter(
      (row) =>
        ((row.params as { item?: { id?: string }; itemId?: string }).item?.id ??
          (row.params as { itemId?: string }).itemId) === "exec-continue-first",
    ),
  );
  for (const row of borrowed) {
    const params = row.params as {
      item?: Record<string, unknown>;
      itemId?: string;
    };
    if (params.item) params.item.id = "borrowed-original-review-process";
    if (params.itemId) params.itemId = "borrowed-original-review-process";
  }
  assert.throws(
    () =>
      authenticate(reviewRows, [
        ...reviewUi.slice(0, -1),
        ...borrowed,
        reviewUi.at(-1)!,
      ]),
    /unique original.*process/u,
  );
  for (const field of ["processId", "command", "cwd", "aggregatedOutput"]) {
    const alteredUi = structuredClone(activeUi);
    const item = (
      alteredUi.find(
        (row) =>
          row.method === "item/completed" &&
          (row.params as { item?: { id?: string } }).item?.id ===
            "exec-continue-first",
      )!.params as { item: Record<string, unknown> }
    ).item;
    item[field] = "tampered";
    assert.throws(() => authenticate(overlapping, alteredUi));
  }
  assert.ok(completed);
  const fullCopy = structuredClone(rows);
  fullCopy.find(
    (row) =>
      row.payload.call_id === "prepare-summary" &&
      row.payload.output !== undefined,
  )!.payload.output = printed({
    status: "project-production-prepared",
    storyId: "story",
    attemptId: "attempt-one",
    revisionId: "revision-one",
    dirtyAgentTasks: [{ taskRevision: "fake-task" }],
  });
  assert.equal(auditProductionAttempts(authenticate(fullCopy))!.length, 2);
  const withoutReceipt = fullCopy.filter(
    (row) => !String(row.payload.call_id).startsWith("prepare-first"),
  );
  assert.throws(
    () => authenticate(withoutReceipt),
    /unaccounted public mutation/u,
  );
  const malformedNative = structuredClone(rows);
  const nativeReceipt = malformedNative.find(
    (row) =>
      row.payload.call_id === "prepare-first-process" &&
      row.payload.output !== undefined,
  )!;
  const wrapper = JSON.parse(String(nativeReceipt.payload.output));
  wrapper.output = JSON.stringify({
    status: "project-production-prepared",
    attemptId: "attempt-one",
  });
  nativeReceipt.payload.output = JSON.stringify(wrapper);
  assert.throws(
    () => authenticate(malformedNative),
    /retain every produced attempt|Native stdout differs from its complete original UI process/u,
  );
  for (const source of [
    'const t=tools; text(await t.exec_command({cmd:"npm run project:produce:prepare -- --project story"}));',
    'text(await tools["exec_command"]({cmd:"npm run project:produce:prepare -- --project story"}));',
    'const f=load("exec");text(await f());',
    'text(await globalThis["tools"].exec_command({cmd:"npm run project:produce:prepare -- --project story"}));',
    'eval(load("code"));',
    'await import(load("module"));',
    'const text=load("helper");text(load("summary"));',
    'const Ctor=load("exec");new Ctor();',
    'const f=load("exec");f`opaque`; ',
    'const p=load("summary");p.status="project-production-prepared";text(p);',
    'const p=load("summary");p.status++;text(p);',
    'const p=load("summary");--p["status"];text(p);',
    'const p=load("summary");for(p.status of ["forged"]){}text(p);',
    'const p=load("summary");for(p.status in {forged:1}){}text(p);',
    'const p=load("summary");for([p.status] of [["forged"]]){}text(p);',
    'let s="";s=load("hidden");text(s.slice(0));',
    'const s={slice:load("hidden")};text(s.slice(0));',
    "const s={slice:(start)=>String(start)};text(s.slice(0));",
    'const s={get slice(){return load("hidden")}};text(s.slice(0));',
    'const s=load("hidden");text(s.slice(0));',
    'const s={output:{slice:load("hidden")}};text(s.output.slice(0));',
    'const s={output:{indexOf:load("hidden")}};text(s.output.indexOf("x"));',
    'const s={indexOf:load("hidden")};text(s.indexOf("x"));',
    'const s={join:load("hidden")};text(s.join(""));',
    'text(String({toString:()=>load("hidden")()}));',
    'const s="";text(s.slice(load("hidden")()));',
    'const s="";text(s.indexOf(load("hidden")()));',
    'const s="";text(s["slice"](0));',
    'const s="";text(s.constructor("opaque"));',
    'const chunks={map:load("hidden")};text(chunks.map(x=>x));',
    'const chunks=load("data");text(chunks.map(load("callback")));',
    'const chunks=load("data");text(chunks.map(x=>x.output()));',
    'const chunks=load("data");text(chunks.map(x=>{store("hidden",x);return x;}));',
    'const chunks=load("data");text(chunks.map(x=>({toString:()=>load("hidden")()})).join(""));',
    'const chunks=load("data");text(chunks.map(([tools])=>tools.clock__curr_time({})));',
    'const chunks=load("data");text(chunks.map(({text})=>text("opaque")));',
    'const String=load("hidden");text(String("opaque").slice(0));',
    'const JSON=load("hidden");text(JSON.parse("{}"));',
    'text(JSON.parse("{}",(key,value)=>load("hidden")()));',
    "text(await tools.clock__curr_time());",
    'text(await tools.clock__curr_time({},load("extra")));',
    'text(await tools.clock__curr_time({...load("args")}));',
    'text(await tools.clock__curr_time({command:load("hidden")}));',
    "const clock=tools.clock__curr_time;text(await clock({}));",
    'text(await tools["clock__curr_time"]({}));',
    "text(await tools.clock__sleep({duration_ms:1}));",
    "text(await tools.mcp__codex_app__get_usage_limits({}));",
  ]) {
    const changed = structuredClone(rows);
    changed.find(
      (row) => row.payload.call_id === "prepare-summary",
    )!.payload.input = source;
    assert.throws(
      () => authenticate(changed),
      /read-only native diagnostic|retain every produced attempt|unchanged literal forwarding/u,
      source,
    );
  }
  const command = structuredClone(
    ui.find((row) => row.method === "item/started")!,
  );
  const params = command.params as Record<string, unknown>;
  params.startedAtMs = Date.parse(at(11.1));
  const originalItem = params.item as Record<string, unknown>;
  originalItem.id = "unaccounted-summary-process";
  originalItem.processId = "summary-process";
  for (const turnId of ["root-turn", "different-turn"]) {
    params.turnId = turnId;
    const finished = structuredClone(command);
    finished.method = "item/completed";
    const endParams = finished.params as Record<string, unknown>;
    delete endParams.startedAtMs;
    endParams.completedAtMs = Date.parse(at(11.4));
    Object.assign(endParams.item as Record<string, unknown>, {
      status: "completed",
      exitCode: 0,
      aggregatedOutput: "",
    });
    const changed = [...ui.slice(0, -1), command, finished, ui.at(-1)!];
    assert.throws(
      () => authenticate(rows, changed),
      /diagnostic.*native command/u,
    );
  }
  for (const recordIndex of [0, 1]) {
    const changed = structuredClone(rows);
    const row = changed.filter(
      (row) => row.payload.call_id === "prepare-summary",
    )[recordIndex]!;
    row.payload.internal_chat_message_metadata_passthrough = {
      turn_id: "forged-turn",
    };
    assert.throws(() => authenticate(changed), /diagnostic.*Root turn/u);
  }
  const tampered = authenticate();
  tampered.outputs.find((row) => row.callId === "prepare-summary")!.objects = [
    {
      status: "project-production-prepared",
      attemptId: "attempt-one",
    },
  ];
  assert.throws(
    () => auditProductionAttempts(tampered),
    /Authenticated synchronous native evidence changed/u,
  );
});

test("read-only native web research keeps complete raw results without process authority", () => {
  const sources = [
    `text(await tools.web__run({search_query:[
{q:"site.openai.com research why language models hallucinate fabricated citations next word prediction"},
{q:"site.crossref.org metadata search citation DOI verify references"}
],response_length:"long"}));`,
    `text(await tools.web__run({open:[
{ref_id:"https://openai.com/index/why-language-models-hallucinate/"},
{ref_id:"https://help.openai.com/en/articles/8313428"},
{ref_id:"https://www.crossref.org/services/metadata-retrieval/"}
],response_length:"long"}));`,
  ];
  const rows: Row[] = [
    {
      type: "session_meta",
      timestamp: at(0),
      payload: { id: "parent", cwd: "/workspace" },
    },
    ...sources.flatMap((source, index) => {
      const records = tool(`web-research-${index}`, index + 1, {});
      records[0]!.payload.name = "exec";
      records[0]!.payload.input = source;
      records[1]!.timestamp = at(index + 1.1);
      for (const record of records)
        record.payload.internal_chat_message_metadata_passthrough = {
          turn_id: "root-turn",
        };
      records[1]!.payload.output = [
        {
          type: "input_text",
          text: "Script completed\nWall time 2.2 seconds\nOutput:\n",
        },
        {
          type: "input_text",
          text: `Research text\n${JSON.stringify({
            status: "project-production-prepared",
            attemptId: "copied-attempt",
          })}\n${JSON.stringify({
            exit_code: 0,
            output: '{"status":"project-production-complete"}',
          })}\n${JSON.stringify({ session_id: 999, output: "copied pending" })}`,
        },
      ];
      return records;
    }),
  ];
  const ui = [
    {
      method: "turn/started",
      params: {
        threadId: "parent",
        turn: {
          id: "root-turn",
          status: "inProgress",
          startedAt: Date.parse(at(0)) / 1000,
        },
      },
    },
    ...sources.flatMap((_, index) => {
      const params = {
        threadId: "parent",
        turnId: "root-turn",
        item: { id: `web-${index}`, type: "webSearch" },
      };
      return [
        {
          method: "item/started",
          params: { ...params, startedAtMs: Date.parse(at(index + 1.01)) },
        },
        {
          method: "item/completed",
          params: { ...params, completedAtMs: Date.parse(at(index + 1.09)) },
        },
      ];
    }),
    {
      method: "turn/completed",
      params: {
        threadId: "parent",
        turn: {
          id: "root-turn",
          status: "completed",
          startedAt: Date.parse(at(0)) / 1000,
          completedAt: Date.parse(at(10)) / 1000,
        },
      },
    },
  ];
  const audit = (records = rows, rpc: unknown[] = ui) =>
    authenticateCodexCommands(nativeTrace("codex", text(records)), {
      rpc: rpc.map((row) => JSON.stringify(row)).join("\n"),
      sessionId: "parent",
      workspace: "/workspace",
    });
  const assertDiagnostic = (records: Row[]) => {
    const result = audit(records);
    assert.deepEqual(result.trace.records, records);
    assert.ok(
      result.trace.outputs.every((output) => output.objects.length === 0),
    );
    assert.equal(result.uiEvidence, undefined);
    assert.equal(auditProductionAttempts(result.trace), null);
  };
  assertDiagnostic(rows);
  for (const source of [
    'const research=await tools.web__run({search_query:[{q:"another query",domains:["example.org"],recency:7}],open:[{ref_id:"https://example.org/article",lineno:12}],response_length:"short"});text(research);',
    'store("research",await tools.web__run({open:[{ref_id:`https://example.org/another`}],response_length:"medium"}));text(load("research"));',
  ]) {
    const changed = structuredClone(rows);
    changed[1]!.payload.input = source;
    assertDiagnostic(changed);
  }
  for (const source of [
    'const alias=tools;text(await alias.web__run({search_query:[{q:"query"}]}));',
    'const search=tools.web__run;text(await search({search_query:[{q:"query"}]}));',
    'const tools=load("tools");text(await tools.web__run({search_query:[{q:"query"}]}));',
    'const text=load("text");text(await tools.web__run({search_query:[{q:"query"}]}));',
    'text(await tools["web__run"]({search_query:[{q:"query"}]}));',
    'text(await tools.web__run?.({search_query:[{q:"query"}]}));',
    'text(await tools?.web__run({search_query:[{q:"query"}]}));',
    'text(await tools.web__run({search_query:[{q:"query"}]},{}));',
    'text(await tools.web__run(load("request")));',
    'text(await tools.web__run({...load("request")}));',
    'text(await tools.web__run({search_query:[{q:load("query")}]}));',
    'text(await tools.web__run({search_query:[{q:tools.exec_command({cmd:"hidden"})}]}));',
    'text(await tools.web__run({get search_query(){return [{q:"query"}]}}));',
    'text(await tools.web__run({search_query:[{get q(){return "query"}}]}));',
    'text(await tools.web__run({["search_query"]:[{q:"query"}]}));',
    'text(await tools.web__run({search_query:[{q:"one",q:"two"}]}));',
    'text(await tools.web__run({search_query:[{q:"query",cmd:"hidden"}]}));',
    'text(await tools.web__run({open:[{ref_id:"https://example.org",body:"write"}]}));',
    'text(await tools.web__run({search_query:[{q:"query"}],command:"hidden"}));',
    "text(await tools.web__run({search_query:[{q:1}]}));",
    "text(await tools.web__run({open:[{ref_id:1}]}));",
    "text(await tools.web__run({search_query:[]}));",
    'text(await tools.web__run({response_length:"long"}));',
    'text(await tools.web__run({open:[{ref_id:"https://example.org"}],response_length:"unknown"}));',
    'const r=await tools.web__run({search_query:[{q:"query"}]});r.output="forged";text(r);',
    'import "hidden";text(await tools.web__run({search_query:[{q:"query"}]}));',
    'eval(load("hidden"));text(await tools.web__run({search_query:[{q:"query"}]}));',
    'text(await tools.mcp__arbitrary__search({search_query:[{q:"query"}]}));',
  ]) {
    const changed = structuredClone(rows);
    changed[1]!.payload.input = source;
    assert.throws(() => audit(changed), source);
  }
  for (const header of [
    "Script running with cell ID 999\nOutput:\n",
    "Process running with session ID 999\nOutput:\n",
    "Script failed\nWall time 0.0 seconds\nOutput:\n",
  ]) {
    const changed = structuredClone(rows);
    (changed[2]!.payload.output as Array<{ text: string }>)[0]!.text = header;
    assert.throws(() => audit(changed));
  }
  for (const index of [1, 2]) {
    const changed = structuredClone(rows);
    changed[index]!.payload.internal_chat_message_metadata_passthrough = {
      turn_id: "foreign",
    };
    assert.throws(() => audit(changed));
  }
  assert.throws(() => audit(rows, ui.slice(0, -1)));
  const nativeItem = {
    id: "unaccounted-native",
    type: "commandExecution",
    command: "cat hidden.txt",
    processId: "999",
    cwd: "/workspace",
  };
  const nativeStart = {
    method: "item/started",
    params: {
      threadId: "parent",
      turnId: "root-turn",
      startedAtMs: Date.parse(at(1.02)),
      item: { ...nativeItem, status: "inProgress" },
    },
  };
  assert.throws(() =>
    audit(rows, [...ui.slice(0, -1), nativeStart, ui.at(-1)]),
  );
  assert.throws(() =>
    audit(rows, [
      ...ui.slice(0, -1),
      nativeStart,
      {
        method: "item/completed",
        params: {
          threadId: "parent",
          turnId: "root-turn",
          completedAtMs: Date.parse(at(1.08)),
          item: {
            ...nativeItem,
            status: "completed",
            exitCode: 0,
            aggregatedOutput: "hidden",
          },
        },
      },
      ui.at(-1),
    ]),
  );
});

test("direct native Output headers retain their complete stdout and original terminal", () => {
  const stdout = "---\nname: axmorf-video\n---\n# AXMORF Studio Video\n";
  const header =
    "Chunk ID: f8eab3\nWall time: 0.0000 seconds\nProcess exited with code 0\nOriginal token count: 2440\nOutput:\n";
  const records = nativeTool(
    "direct-skill-read",
    1,
    "exec_command",
    {
      cmd: "cat .agents/skills/axmorf-video/SKILL.md",
      max_output_tokens: 30000,
      yield_time_ms: 10000,
    },
    header + stdout,
  );
  records[1]!.timestamp = at(1.1);
  for (const row of records)
    row.payload.internal_chat_message_metadata_passthrough = {
      turn_id: "root-turn",
    };
  const rows: Row[] = [
    {
      type: "session_meta",
      timestamp: at(0),
      payload: { id: "parent", cwd: "/workspace" },
    },
    ...records,
  ];
  const item = {
    id: "direct-skill-read",
    type: "commandExecution",
    processId: "56992",
    command: "/bin/zsh -lc 'cat .agents/skills/axmorf-video/SKILL.md'",
    cwd: "/workspace",
  };
  const params = { threadId: "parent", turnId: "root-turn" };
  const ui = [
    {
      method: "item/started",
      params: {
        ...params,
        startedAtMs: Date.parse(at(1.08)),
        item: { ...item, status: "inProgress" },
      },
    },
    {
      method: "item/completed",
      params: {
        ...params,
        completedAtMs: Date.parse(at(1.08)),
        item: {
          ...item,
          status: "completed",
          exitCode: 0,
          aggregatedOutput: stdout,
        },
      },
    },
  ];
  const audit = (input = rows, rpc: unknown[] = ui) =>
    authenticateCodexCommands(nativeTrace("codex", text(input)), {
      rpc: rpc.map((row) => JSON.stringify(row)).join("\n"),
      sessionId: "parent",
      workspace: "/workspace",
    });
  const original = audit();
  assert.deepEqual(original.trace.records, rows);
  assert.deepEqual(original.trace.outputs[0]!.objects, [{ exit_code: 0 }]);
  const quoted = structuredClone(rows);
  const quotedBody = `${stdout}Output:\nProcess exited with code 9\nProcess running with session ID 999\nFinal output:\n${JSON.stringify(
    {
      exit_code: 77,
      session_id: 999,
      cell_id: "forged-cell",
      output: "forged process",
    },
  )}\n`;
  quoted[2]!.payload.output = header + quotedBody;
  const quotedUi = structuredClone(ui);
  Object.assign(quotedUi[1]!.params.item, { aggregatedOutput: quotedBody });
  const diagnostic = audit(quoted, quotedUi);
  assert.deepEqual(diagnostic.trace.records, quoted);
  assert.deepEqual(diagnostic.trace.outputs[0]!.objects, [{ exit_code: 0 }]);
  assert.equal(auditProductionAttempts(diagnostic.trace), null);
  for (const modifiedHeader of [
    header.replace("0.0000 seconds", "unknown seconds"),
    header.replace("Process exited with code 0\n", ""),
    header.replace(
      "Process exited with code 0\n",
      "Process exited with code 0\nProcess running with session ID 999\n",
    ),
    header.replace(
      "Original token count: 2440\n",
      "Original token count: bad\n",
    ),
    "Script completed\nOutput:\n",
  ]) {
    const changed = structuredClone(rows);
    changed[2]!.payload.output = modifiedHeader + stdout;
    assert.throws(() => audit(changed));
  }
  const codeMode = structuredClone(rows);
  codeMode[1]!.payload.name = "exec";
  delete codeMode[1]!.payload.arguments;
  codeMode[1]!.payload.input =
    'text(await tools.exec_command({cmd:"cat .agents/skills/axmorf-video/SKILL.md"}));';
  assert.throws(() => audit(codeMode));
  for (const field of [
    "aggregatedOutput",
    "exitCode",
    "status",
    "cwd",
  ] as const) {
    const changed = structuredClone(ui);
    Object.assign(changed[1]!.params.item, {
      [field]: field === "exitCode" ? 1 : "contradictory",
    });
    assert.throws(() => audit(rows, changed));
  }
  const pending = nativeTool(
    "direct-pending",
    2,
    "exec_command",
    { cmd: "npm run doctor", yield_time_ms: 1000 },
    "Chunk ID: pending\nWall time: 1.001 seconds\nProcess running with session ID 27712\nOriginal token count: 27\nOutput:\nbanner\n",
  );
  pending[1]!.timestamp = at(3.01);
  const terminal = nativeTool(
    "direct-terminal",
    4,
    "write_stdin",
    { session_id: 27712, chars: "", yield_time_ms: 60000 },
    "Chunk ID: terminal\nWall time: 0.0001 seconds\nProcess exited with code 1\nOriginal token count: 27\nOutput:\ndoctor failed\n",
  );
  terminal[1]!.timestamp = at(4.1);
  for (const row of [...pending, ...terminal])
    row.payload.internal_chat_message_metadata_passthrough = {
      turn_id: "root-turn",
    };
  const doctor = {
    id: "doctor-process",
    type: "commandExecution",
    processId: "27712",
    command: "/bin/zsh -lc 'npm run doctor'",
    cwd: "/workspace",
  };
  const fullUi = [
    ...ui,
    {
      method: "item/started",
      params: {
        ...params,
        startedAtMs: Date.parse(at(2.01)),
        item: { ...doctor, status: "inProgress" },
      },
    },
    {
      method: "item/completed",
      params: {
        ...params,
        completedAtMs: Date.parse(at(3.5)),
        item: {
          ...doctor,
          status: "failed",
          exitCode: 1,
          aggregatedOutput: "banner\ndoctor failed\n",
        },
      },
    },
  ];
  const fullRows = [...rows, ...pending, ...terminal];
  const completed = audit(fullRows, fullUi);
  assert.deepEqual(completed.trace.records, fullRows);
  assert.deepEqual(completed.trace.outputs[1]!.objects, []);
  assert.deepEqual(completed.trace.outputs[2]!.objects, [{ exit_code: 1 }]);
  const unknownWait = structuredClone(fullRows);
  unknownWait[5]!.payload.arguments = JSON.stringify({
    session_id: 999,
    chars: "",
    yield_time_ms: 60000,
  });
  assert.throws(() => audit(unknownWait, fullUi));
});

test("indexed native batch results keep an adjacent completed command separate from a pending process", () => {
  const source = `const results = await Promise.allSettled([
  tools.exec_command({cmd:"npm run doctor",workdir:"/workspace"}),
  tools.exec_command({cmd:"cat execution-capabilities.md",workdir:"/workspace"})
]);
for (let i=0;i<results.length;i++) text({index:i,result:results[i]});`;
  const launch = tool(
    "independent-batch",
    1,
    "Script running with cell ID independent-cell\nWall time 30 seconds\nOutput:\n",
  );
  launch[0]!.payload.name = "functions.exec";
  launch[0]!.payload.input = source;
  launch[1]!.payload.output =
    "Script running with cell ID independent-cell\nWall time 30 seconds\nOutput:\n";
  const returned = [
    { type: "input_text", text: "Script completed\nOutput:\n" },
    ...[
      { session_id: 14226, output: "doctor is running" },
      { exit_code: 0, output: "complete documentation" },
    ].map((value, index) => ({
      type: "input_text",
      text: JSON.stringify({ index, result: { status: "fulfilled", value } }),
    })),
  ];
  const rows: Row[] = [
    {
      type: "session_meta",
      timestamp: at(0),
      payload: { id: "parent", cwd: "/workspace" },
    },
    ...launch,
    ...nativeTool(
      "batch-return",
      2,
      "functions.wait",
      { cell_id: "independent-cell" },
      returned,
    ),
    ...nativeTool(
      "doctor-return",
      3,
      "functions.write_stdin",
      { session_id: 14226, chars: "" },
      JSON.stringify({ exit_code: 0, output: "doctor completed" }),
    ),
  ];
  const audit = (value: Row[]) =>
    authenticateCodexCommands(nativeTrace("codex", text(value)), {
      rpc: "{}",
      sessionId: "parent",
      workspace: "/workspace",
    });
  assert.equal(audit(rows).trace.outputs.length, 3);
  const passiveSource = `${source}\nstore("batch-results",results);`;
  for (const input of [
    passiveSource,
    passiveSource.replace(
      "text({index:i,result:results[i]});",
      '{store("item-"+i,results[i]);text({index:i,result:results[i]});}',
    ),
  ]) {
    const passive = structuredClone(rows);
    passive[1]!.payload.input = input;
    assert.deepEqual(audit(passive).trace.outputs, audit(rows).trace.outputs);
  }
  for (const invalid of [
    `const store=foreign;\n${passiveSource}`,
    `store=foreign;\n${passiveSource}`,
    `Reflect.set(globalThis,"store",foreign);\n${passiveSource}`,
    passiveSource.replace(
      'store("batch-results",results)',
      'store(load("key"),results)',
    ),
    passiveSource.replace(
      'store("batch-results",results)',
      'store("batch-results",results=another)',
    ),
    passiveSource.replace(
      'store("batch-results",results)',
      'store("batch-results",results.reverse())',
    ),
    passiveSource.replace(
      'store("batch-results",results)',
      'store("batch-results",another)',
    ),
    passiveSource.replace(
      'store("batch-results",results)',
      'const alias=results;store("batch-results",alias)',
    ),
    passiveSource.replace(
      'store("batch-results",results)',
      'results[0]=another;store("batch-results",results)',
    ),
    passiveSource.replace("index:i", "index:0"),
    passiveSource.replace('cmd:"npm run doctor"', 'cmd:load("command")'),
    `${passiveSource}\nresults[0]=another;`,
  ]) {
    const changed = structuredClone(rows);
    changed[1]!.payload.input = invalid;
    assert.throws(() => audit(changed));
  }
  const unrelated = structuredClone(rows);
  const unrelatedBlocks = unrelated[4]!.payload.output as Array<{
    text: string;
  }>;
  const unrelatedEnvelope = JSON.parse(unrelatedBlocks[2]!.text);
  unrelatedEnvelope.result.value.output = JSON.stringify({
    status: "project-production-complete",
    attemptId: "foreign",
  });
  unrelatedBlocks[2]!.text = JSON.stringify(unrelatedEnvelope);
  assert.ok(
    !audit(unrelated).trace.outputs[1]!.objects.some(
      (value) => value.status === "project-production-complete",
    ),
  );
  for (const change of [
    (value: Row[]) => {
      const blocks = value[4]!.payload.output as Array<{ text: string }>;
      const envelope = JSON.parse(blocks[1]!.text);
      envelope.result.value.exit_code = 0;
      blocks[1]!.text = JSON.stringify(envelope);
    },
    (value: Row[]) => {
      const blocks = value[4]!.payload.output as Array<{ text: string }>;
      blocks.push(structuredClone(blocks[1]!));
    },
    (value: Row[]) => {
      value[1]!.payload.input = source.replace(
        "tools.exec_command",
        "foreign.exec_command",
      );
    },
    (value: Row[]) => {
      value[1]!.payload.input = source.replace(
        "result:results[i]",
        "result:another[i]",
      );
    },
    (value: Row[]) => {
      value[1]!.payload.input = `const tools = foreign;\n${source}`;
    },
    (value: Row[]) => {
      value[1]!.payload.input = source.replace(
        'cmd:"npm run doctor"',
        'cmd:"other",cmd:"npm run doctor"',
      );
    },
    (value: Row[]) => {
      const blocks = value[4]!.payload.output as Array<{ text: string }>;
      const envelope = JSON.parse(blocks[2]!.text);
      envelope.index = 0;
      blocks[2]!.text = JSON.stringify(envelope);
    },
    (value: Row[]) => {
      const blocks = value[4]!.payload.output as Array<{ text: string }>;
      const envelope = JSON.parse(blocks[2]!.text);
      delete envelope.result.value.exit_code;
      envelope.result.value.session_id = 14226;
      blocks[2]!.text = JSON.stringify(envelope);
    },
    (value: Row[]) => {
      value[1]!.payload.input = source.replace(
        "cat execution-capabilities.md",
        "npm run project:produce:prepare -- --project story",
      );
    },
  ]) {
    const changed = structuredClone(rows);
    change(changed);
    assert.throws(() => audit(changed));
  }
});

test("indexed native forwarding retains a separate read-only tool directory summary", () => {
  const batch = `const results=await Promise.allSettled([
tools.exec_command({cmd:"npm run doctor",workdir:"/workspace"}),
tools.exec_command({cmd:"cat guides.md",workdir:"/workspace"})
]);for(let i=0;i<results.length;i++)text({index:i,result:results[i]});`;
  const summaries = [
    `text(ALL_TOOLS.filter(x=>/search|native|agent|skill/i.test(x.name+" "+x.description)).map(x=>({name:x.name,description:x.description.slice(0,180)})));`,
    `text(ALL_TOOLS.filter(x=>/agent|child|parallel|delegate|session|release|close/i.test(x.name)&&!x.name.includes("codex_apps")).map(x=>({name:x.name,description:x.description})));`,
  ];
  const metadata = [
    { name: "exec_command", description: "Native command tool" },
  ];
  const fixture = (summary: string) => {
    const launch = tool("directory-batch", 1, {});
    launch[0]!.payload.name = "functions.exec";
    launch[0]!.payload.input = `${batch}\n${summary}`;
    launch[1]!.payload.output = [
      { type: "input_text", text: "Script completed\nOutput:\n" },
      ...[
        { session_id: 14226, output: "doctor is running" },
        { exit_code: 0, output: "complete guides" },
      ].map((value, index) => ({
        type: "input_text",
        text: JSON.stringify({ index, result: { status: "fulfilled", value } }),
      })),
      { type: "input_text", text: JSON.stringify(metadata) },
    ];
    return [
      {
        type: "session_meta",
        timestamp: at(0),
        payload: { id: "parent", cwd: "/workspace" },
      },
      ...launch,
      ...nativeTool(
        "directory-doctor-return",
        2,
        "functions.write_stdin",
        { session_id: 14226, chars: "" },
        JSON.stringify({ exit_code: 0, output: "doctor completed" }),
      ),
    ];
  };
  const audit = (rows: Row[]) =>
    authenticateCodexCommands(nativeTrace("codex", text(rows)), {
      rpc: "{}",
      sessionId: "parent",
      workspace: "/workspace",
    }).trace;
  for (const summary of summaries) {
    const rows = fixture(summary);
    const proved = audit(rows);
    assert.deepEqual(proved.records, nativeTrace("codex", text(rows)).records);
    assert.deepEqual(proved.outputs[0]!.objects, [
      { session_id: 14226, output: "doctor is running" },
    ]);
  }
  for (const summary of [
    summaries[0]!.replace("ALL_TOOLS", 'load("hidden")'),
    summaries[0]!.replace('x.name+" "+x.description', 'load("hidden")()'),
    summaries[0]!.replace(
      "description:x.description.slice(0,180)",
      'description:tools.exec_command({cmd:"hidden"})',
    ),
    summaries[0]!.replace(
      "description:x.description.slice(0,180)",
      'status:"project-production-complete"',
    ),
    `${summaries[0]}\nresults[0]=load("forged");`,
    `${summaries[0]}\nconst tools=load("hidden");`,
    summaries[0]!.replace(".slice(0,180)", '.slice(load("hidden")(),180)'),
  ])
    assert.throws(
      () => audit(fixture(summary)),
      /Indexed native results/u,
      summary,
    );
  const forged = fixture(summaries[0]!);
  (forged[2]!.payload.output as Array<{ text: string }>).at(-1)!.text =
    JSON.stringify([
      {
        name: "exec_command",
        description: "Native command tool",
        status: "project-production-complete",
      },
    ]);
  assert.throws(() => audit(forged), /Indexed native results/u);
});

test("indexed forwarding permits a passive JSON-line copy of its original native output", () => {
  const batch = `const results=await Promise.allSettled([
tools.exec_command({cmd:"npm run doctor",workdir:"/workspace"}),
tools.exec_command({cmd:"cat guides.md",workdir:"/workspace"})
]);for(let i=0;i<results.length;i++){store("item-"+i,results[i]);text({index:i,result:results[i]});}`;
  const copy = `if(results[0].status==="fulfilled"){
const lines=results[0].value.output.split("\\n").filter(x=>x.startsWith("{"));
store("parsed-lines",lines.map(x=>JSON.parse(x)));
}`;
  const fixture = (suffix: string) => {
    const launch = tool("parsed-batch", 1, {});
    launch[0]!.payload.name = "functions.exec";
    launch[0]!.payload.input = `${batch}\n${suffix}`;
    launch[1]!.payload.output = [
      { type: "input_text", text: "Script completed\nOutput:\n" },
      ...[
        { session_id: 14226, output: "doctor is running" },
        { exit_code: 0, output: "complete guides" },
      ].map((value, index) => ({
        type: "input_text",
        text: JSON.stringify({ index, result: { status: "fulfilled", value } }),
      })),
    ];
    return [
      {
        type: "session_meta",
        timestamp: at(0),
        payload: { id: "parent", cwd: "/workspace" },
      },
      ...launch,
      ...nativeTool(
        "parsed-doctor-return",
        2,
        "functions.write_stdin",
        { session_id: 14226, chars: "" },
        JSON.stringify({ exit_code: 0, output: "doctor completed" }),
      ),
    ];
  };
  const audit = (rows: Row[]) =>
    authenticateCodexCommands(nativeTrace("codex", text(rows)), {
      rpc: "{}",
      sessionId: "parent",
      workspace: "/workspace",
    }).trace;
  const proved = audit(fixture(copy));
  assert.deepEqual(proved.outputs, audit(fixture("")).outputs);
  for (const invalid of [
    copy.replace("results[0].value.output", "another[0].value.output"),
    copy.replace(
      "results[0].value.output",
      'results[0].value.output=load("forged")',
    ),
    copy.replace('x.startsWith("{")', 'tools.exec_command({cmd:"hidden"})'),
    copy.replace("JSON.parse(x)", 'JSON.parse(x,load("hidden"))'),
    copy.replace('store("parsed-lines"', 'load("hidden")("parsed-lines"'),
    copy.replace("const lines=", "const JSON="),
    copy.replace('status==="fulfilled"', 'status="fulfilled"'),
    `${copy}\ntext({index:0,result:load("forged")});`,
  ])
    assert.throws(
      () => audit(fixture(invalid)),
      /Indexed native results/u,
      invalid,
    );
});

test("display-omitted diagnostic envelopes need their complete original native UI terminal", () => {
  const commands = [
    "cat .agents/skills/axmorf-video/references/production-workflow.md",
    "cat .agents/skills/axmorf-video/references/host-execution-and-recovery.md",
    "npm run doctor",
  ];
  const stdout = ["first guide", "complete second guide", "doctor ready"];
  const source = `const results=await Promise.allSettled([
${commands.map((cmd) => `tools.exec_command(${JSON.stringify({ cmd, workdir: "/workspace" })})`).join(",\n")}
]);for(let i=0;i<results.length;i++)text({index:i,result:results[i]});`;
  const launch = tool("omitted-guide", 1, {});
  launch[0]!.payload.name = "functions.exec";
  launch[0]!.payload.input = source;
  launch[0]!.payload.internal_chat_message_metadata_passthrough = {
    turn_id: "root-turn",
  };
  launch[1]!.timestamp = at(2);
  launch[1]!.payload.output = [
    { type: "input_text", text: "Script completed\nOutput:\n" },
    {
      type: "input_text",
      text: `Warning: truncated output (original token count: 10000)\nTotal output lines: 3\n\n${[0, 2].map((index) => JSON.stringify({ index, result: { status: "fulfilled", value: { exit_code: 0, output: stdout[index] } } })).join("\n")}`,
    },
  ];
  const rows: Row[] = [
    {
      type: "session_meta",
      timestamp: at(0),
      payload: { id: "parent", cwd: "/workspace" },
    },
    ...launch,
  ];
  const ui = commands.flatMap((command, index) => {
    const item = {
      type: "commandExecution",
      id: `item-${index}`,
      processId: `process-${index}`,
      command,
      cwd: "/workspace",
      status: "inProgress",
    };
    return [
      {
        method: "item/started",
        params: {
          threadId: "parent",
          turnId: "root-turn",
          startedAtMs: Date.parse(at(1.1 + index / 10)),
          item,
        },
      },
      {
        method: "item/completed",
        params: {
          threadId: "parent",
          turnId: "root-turn",
          completedAtMs: Date.parse(at(1.15 + index / 10)),
          item: {
            ...item,
            status: "completed",
            exitCode: 0,
            aggregatedOutput: stdout[index],
          },
        },
      },
    ];
  });
  const audit = (records = rows, packets: unknown[] = ui) =>
    authenticateCodexCommands(nativeTrace("codex", text(records)), {
      rpc: packets.map((row) => JSON.stringify(row)).join("\n"),
      sessionId: "parent",
      workspace: "/workspace",
    }).trace;
  const actual = audit();
  assert.deepEqual(actual.records, nativeTrace("codex", text(rows)).records);
  assert.ok(
    actual.outputs[0]!.objects.some(
      (value) => value.exit_code === 0 && value.output === stdout[0],
    ),
  );
  const spliced = structuredClone(rows);
  const splicedBlocks = spliced[2]!.payload.output as Array<{ text: string }>;
  splicedBlocks[1]!.text = splicedBlocks[1]!.text.replace(
    stdout[0]!,
    "first and third stdout spliced by native display",
  );
  assert.deepEqual(audit(spliced).outputs, actual.outputs);
  for (const command of [
    "npm run project:create -- --schema",
    "npm run project:create:context -- --project story",
    "npm run project:revise:context -- --project story",
    "node .agents/skills/axmorf-video/scripts/native-probe.mjs create --count 4",
    "npm run catalog:query -- --kind asset --tag motion-sync",
  ]) {
    const records = structuredClone(rows);
    records[1]!.payload.input = source.replace(commands[0]!, command);
    const packets = structuredClone(ui);
    packets[0]!.params.item.command = command;
    packets[1]!.params.item.command = command;
    assert.deepEqual(audit(records, packets).outputs, actual.outputs);
  }
  const innerOnly = structuredClone(rows);
  const innerBlocks = innerOnly[2]!.payload.output as Array<{ text: string }>;
  innerBlocks[1]!.text = [0, 1, 2]
    .map((index) =>
      JSON.stringify({
        index,
        result: {
          status: "fulfilled",
          value: {
            exit_code: 0,
            output:
              index === 0
                ? "Warning: truncated output (original token count: 10000)\nTotal output lines: 1\n\n…100 tokens truncated…"
                : stdout[index],
          },
        },
      }),
    )
    .join("\n");
  assert.deepEqual(audit(innerOnly).outputs, actual.outputs);
  assert.throws(() => audit(rows, []));
  for (const change of [
    (packets: typeof ui) => {
      packets.splice(3, 1);
    },
    (packets: typeof ui) => {
      packets.push(structuredClone(packets[3]!));
    },
    (packets: typeof ui) => {
      packets[3]!.params.threadId = "another-root";
    },
    (packets: typeof ui) => {
      packets[3]!.params.turnId = "another-turn";
    },
    (packets: typeof ui) => {
      packets[3]!.params.item.cwd = "/another-workspace";
    },
    (packets: typeof ui) => {
      packets[3]!.params.item.command = "cat different.md";
    },
    (packets: typeof ui) => {
      packets[3]!.params.completedAtMs = Date.parse(at(3));
    },
    (packets: typeof ui) => {
      packets[3]!.params.item.processId = "changed-process";
    },
  ]) {
    const packets = structuredClone(ui);
    change(packets);
    assert.throws(() => audit(rows, packets));
  }
  const noMarker = structuredClone(rows);
  const blocks = noMarker[2]!.payload.output as Array<{ text: string }>;
  blocks[1]!.text = blocks[1]!.text.slice(blocks[1]!.text.indexOf("\n\n") + 2);
  assert.throws(() => audit(noMarker), /Indexed native results/u);
  const hiddenMutation = structuredClone(rows);
  hiddenMutation[1]!.payload.input = source.replace(
    commands[1]!,
    "npm run project:produce:prepare -- --project story",
  );
  assert.throws(() => audit(hiddenMutation), /original diagnostic UI/u);
  const delta = {
    method: "item/commandExecution/outputDelta",
    params: {
      threadId: "parent",
      turnId: "root-turn",
      itemId: "item-1",
      delta: "partial",
    },
  };
  const partial = structuredClone(ui);
  partial.splice(3, 0, delta as never);
  assert.throws(() => audit(rows, partial), /original diagnostic UI/u);
});

test("indexed image results stay diagnostic beside their separately forwarded command", () => {
  const source = `const results=await Promise.allSettled([
tools.exec_command({cmd:"cat publish.json",workdir:"/workspace"}),
tools.view_image({path:"/workspace/cover-4x3.png"}),
tools.view_image({path:"/workspace/cover-3x4.png"}),
tools.exec_command({cmd:"npm run doctor",workdir:"/workspace"})
]);for(let i=0;i<results.length;i++){
const r=results[i];
if(r.status==="fulfilled"&&(i===1||i===2))image(r.value.image_url);
else text({index:i,result:r});
}store("reviewInitial",results[3]);`;
  const launch = tool("image-forwarding", 1, {});
  launch[0]!.payload.name = "functions.exec";
  launch[0]!.payload.input = source;
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==";
  const blocks = [
    { type: "input_text", text: "Script completed\nOutput:\n" },
    {
      type: "input_text",
      text: JSON.stringify({
        index: 0,
        result: {
          status: "fulfilled",
          value: { exit_code: 0, output: "publish metadata" },
        },
      }),
    },
    { type: "input_image", image_url: png },
    { type: "input_image", image_url: png },
    {
      type: "input_text",
      text: JSON.stringify({
        index: 3,
        result: {
          status: "fulfilled",
          value: { session_id: 456, output: "doctor pending" },
        },
      }),
    },
  ];
  launch[1]!.payload.output = blocks;
  const rows: Row[] = [
    {
      type: "session_meta",
      timestamp: at(0),
      payload: { id: "parent", cwd: "/workspace" },
    },
    ...launch,
    ...nativeTool(
      "image-doctor-return",
      2,
      "functions.write_stdin",
      { session_id: 456, chars: "" },
      JSON.stringify({ exit_code: 0, output: "doctor ready" }),
    ),
  ];
  const audit = (value = rows) =>
    authenticateCodexCommands(nativeTrace("codex", text(value)), {
      rpc: "{}",
      sessionId: "parent",
      workspace: "/workspace",
    }).trace;
  const actual = audit();
  assert.deepEqual(actual.records, nativeTrace("codex", text(rows)).records);
  assert.deepEqual(actual.outputs[0]!.objects, [
    { session_id: 456, output: "doctor pending" },
  ]);
  for (const invalid of [
    source.replace("const r=results[i]", "let r=results[i]"),
    source.replace("const r=results[i]", 'const r=load("forged")'),
    source.replace("image(r.value.image_url)", 'image(load("forged"))'),
    source.replace("i===1||i===2", "i===0||i===2"),
    source.replace(
      'store("reviewInitial",results[3])',
      'store(load("key"),results[3])',
    ),
    source.replace(
      'store("reviewInitial",results[3])',
      'store("reviewInitial",results[3]=load("forged"))',
    ),
  ]) {
    const changed = structuredClone(rows);
    changed[1]!.payload.input = invalid;
    assert.throws(() => audit(changed));
  }
  for (const change of [
    (value: typeof blocks) => {
      value.splice(2, 1);
    },
    (value: typeof blocks) => {
      value[2]!.image_url = "data:image/png;base64,/9j/";
    },
    (value: typeof blocks) => {
      value[2]!.image_url = png.replace("image/png", "image/jpeg");
    },
  ]) {
    const changed = structuredClone(rows);
    change(changed[2]!.payload.output as typeof blocks);
    assert.throws(() => audit(changed));
  }
});

test("one immutable literal native result can be stored before its unchanged print", () => {
  const source = `const r=await tools.exec_command({cmd:"cat guide.md",workdir:"/workspace"});store("captured",r);text(r);`;
  const launch = tool("stored-result", 1, {});
  launch[0]!.payload.name = "functions.exec";
  launch[0]!.payload.input = source;
  launch[1]!.payload.output = [
    { type: "input_text", text: "Script completed\nOutput:\n" },
    {
      type: "input_text",
      text: JSON.stringify({ exit_code: 0, output: "original guide" }),
    },
  ];
  const rows: Row[] = [
    {
      type: "session_meta",
      timestamp: at(0),
      payload: { id: "parent", cwd: "/workspace" },
    },
    ...launch,
  ];
  const audit = (value = rows) =>
    authenticateCodexCommands(nativeTrace("codex", text(value)), {
      rpc: "{}",
      sessionId: "parent",
      workspace: "/workspace",
    }).trace;
  assert.deepEqual(audit().records, nativeTrace("codex", text(rows)).records);
  const direct = `text(await tools.exec_command({cmd:"cat guide.md",workdir:"/workspace"}));`;
  const patch = `text(await tools.apply_patch("*** Begin Patch\\n*** Add File: /workspace/input.json\\n+{}\\n*** End Patch"));`;
  const metadata = `text(ALL_TOOLS.filter(x=>/native/i.test(x.name)).map(x=>({name:x.name,description:x.description})));`;
  const authoring = `const c=load("context")[0];const input={scenes:c.scenes.map(scene=>scene.meaningId==="target"?{...scene,brief:scene.brief+" delta"}:scene)};store("input",input);text(await tools.apply_patch("*** Begin Patch\\n*** Add File: /workspace/input.json\\n"+JSON.stringify(input,null,2).split("\\n").map(line=>"+"+line).join("\\n")+"\\n*** End Patch"));`;
  for (const input of [
    patch + direct,
    direct + patch,
    metadata + direct,
    authoring + direct,
  ]) {
    const changed = structuredClone(rows);
    changed[1]!.payload.input = input;
    assert.deepEqual(
      audit(changed).records,
      nativeTrace("codex", text(changed)).records,
    );
  }
  for (const invalid of [
    source.replace("const r=", "let r="),
    source.replace('store("captured",r)', 'store(load("key"),r)'),
    source.replace('store("captured",r)', 'store("captured",r=load("forged"))'),
    source.replace(
      'store("captured",r)',
      'const alias=r;store("captured",alias)',
    ),
    source.replace("text(r)", 'r.output="forged";text(r)'),
    `const store=load("hidden");${source}`,
    authoring.replace("...scene", '...load("hidden")()') + direct,
    patch.replace(
      'tools.apply_patch("',
      'tools.apply_patch(load("hidden")()+"',
    ) + direct,
    metadata.replace("x.name", 'load("hidden")()') + direct,
  ]) {
    const changed = structuredClone(rows);
    changed[1]!.payload.input = invalid;
    assert.throws(() => audit(changed));
  }
});

test("shorthand batch counters retain each pending result and its later failure before a fresh successful doctor", async (context) => {
  const source = `const results=await Promise.allSettled([
tools.exec_command({cmd:"cat guides.md",workdir:"/workspace"}),
tools.exec_command({cmd:"cat package.json",workdir:"/workspace"}),
tools.exec_command({cmd:"npm run doctor",workdir:"/workspace",yield_time_ms:1000})
]);for(let i=0;i<results.length;i++)text({i,result:results[i]});`;
  const envelopes = [
    { exit_code: 0, output: "complete guides" },
    {
      exit_code: 0,
      output: '{"status":"project-production-complete","attemptId":"foreign"}',
    },
    { session_id: 64024, output: "npm doctor banner" },
  ].map((value, i) => ({ i, result: { status: "fulfilled", value } }));
  const printed = (values = envelopes) => [
    { type: "input_text", text: "Script completed\nOutput:\n" },
    {
      type: "input_text",
      text: `Warning: truncated output (original token count: 12293)\nTotal output lines: 3\n\n${values.map((value) => JSON.stringify(value)).join("\n")}`,
    },
  ];
  const launch = tool("shorthand-batch", 1, {});
  launch[0]!.payload.name = "functions.exec";
  launch[0]!.payload.input = source;
  launch[1]!.payload.output = printed();
  const rows: Row[] = [
    {
      type: "session_meta",
      timestamp: at(0),
      payload: { id: "parent", cwd: "/workspace" },
    },
    ...launch,
    ...nativeTool(
      "first-doctor-failed",
      2,
      "functions.write_stdin",
      { session_id: 64024, chars: "" },
      JSON.stringify({
        exit_code: 1,
        output: "doctor host prerequisite failed",
      }),
    ),
    ...tool(
      "fresh-doctor",
      3,
      { session_id: 31130, output: "fresh doctor banner" },
      "npm run doctor",
    ),
    ...nativeTool(
      "fresh-doctor-passed",
      4,
      "functions.write_stdin",
      { session_id: 31130, chars: "" },
      JSON.stringify({ exit_code: 0, output: "doctor ready" }),
    ),
  ];
  const audit = (value = rows) =>
    authenticateCodexCommands(nativeTrace("codex", text(value)), {
      rpc: "{}",
      sessionId: "parent",
      workspace: "/workspace",
    }).trace;
  const proved = audit();
  assert.deepEqual(proved.records, nativeTrace("codex", text(rows)).records);
  assert.deepEqual(proved.outputs[0]!.objects, [envelopes[2]!.result.value]);
  assert.ok(proved.outputs[1]!.objects.some((value) => value.exit_code === 1));
  assert.ok(
    proved.outputs[2]!.objects.some((value) => value.session_id === 31130),
  );
  assert.ok(proved.outputs[3]!.objects.some((value) => value.exit_code === 0));
  const conditional = source.replace(
    "text({i,result:results[i]});",
    '{if(i===0)store("probeResult",results[i]);text({i,result:results[i]});}',
  );
  const copied = structuredClone(rows);
  copied[1]!.payload.input = conditional;
  assert.deepEqual(audit(copied).outputs, proved.outputs);
  for (const invalid of [
    source.replace("{i,result:results[i]}", "{i:0,result:results[i]}"),
    source.replace("{i,result:results[i]}", "{i,result:another[i]}"),
    source.replace("{i,result:results[i]}", "{i,result:results[0]}"),
    source.replace("{i,result:results[i]}", "{i,result:results[i++]}"),
    source.replace("{i,result:results[i]}", "{i,result:results[i],index:i}"),
    source.replace(
      "text({i,result:results[i]});",
      "{const alias=results[i];text({i,result:alias});}",
    ),
    source.replace(
      "text({i,result:results[i]});",
      "{results[i]=another;text({i,result:results[i]});}",
    ),
    source.replace("tools.exec_command", "foreign.exec_command"),
    source.replace('cmd:"npm run doctor"', 'cmd:load("command")'),
    `const tools=foreign;${source}`,
    conditional.replace("i===0", 'i===load("item")'),
    conditional.replace("i===0", 'load("guard")'),
    conditional.replace("i===0", "i===3"),
    conditional.replace("i===0", "i++===0"),
    conditional.replace("i===0", "i=0"),
    conditional.replace("i===0", 'results[i].status==="fulfilled"'),
    conditional.replace("i===0", "tools.clock__curr_time({})"),
    conditional.replace(
      'store("probeResult",results[i])',
      'store("probeResult",another[i])',
    ),
    conditional.replace(
      'store("probeResult",results[i])',
      'store("probeResult",results[0])',
    ),
    conditional.replace(
      'store("probeResult",results[i])',
      'store("probeResult",results[i]=another)',
    ),
    conditional.replace(
      'store("probeResult",results[i])',
      'tools.exec_command({cmd:"other"})',
    ),
    conditional.replace(
      'store("probeResult",results[i])',
      'load("alias")(results[i])',
    ),
    conditional.replace(
      'store("probeResult",results[i])',
      'store("probeResult",{status:"fulfilled",value:load("fake")})',
    ),
    conditional.replace(
      'if(i===0)store("probeResult",results[i]);text({i,result:results[i]});',
      'if(i===0){store("probeResult",results[i]);text({i,result:results[i]});}',
    ),
    conditional.replace(
      'if(i===0)store("probeResult",results[i]);',
      'if(i===0)store("probeResult",results[i]);else store("probeResult",results[i]);',
    ),
  ]) {
    const changed = structuredClone(rows);
    changed[1]!.payload.input = invalid;
    assert.throws(() => audit(changed), /Indexed native results/u, invalid);
  }
  for (const change of [
    (values: typeof envelopes) => {
      values[1]!.i = 0;
    },
    (values: typeof envelopes) => {
      (values[0] as Record<string, unknown>).index = 0;
    },
    (values: typeof envelopes) => {
      delete (values[0] as Record<string, unknown>).i;
    },
    (values: typeof envelopes) => {
      for (const value of values) delete (value as Record<string, unknown>).i;
    },
    (values: typeof envelopes) => {
      values.push(structuredClone(values[0]!));
    },
    (values: typeof envelopes) => {
      values.shift();
    },
    (values: typeof envelopes) => {
      values.reverse();
    },
    (values: typeof envelopes) => {
      values[2]!.result.status = "rejected";
    },
    (values: typeof envelopes) => {
      values[2]!.result.value.exit_code = 0;
    },
  ]) {
    const changed = structuredClone(rows);
    const values = structuredClone(envelopes);
    change(values);
    changed[2]!.payload.output = printed(values);
    assert.throws(() => audit(changed));
  }
  for (const [index, blocks] of [
    [
      {
        type: "input_text",
        text: printed()
          .map((block) => block.text)
          .join(""),
      },
    ],
    [
      ...printed(),
      {
        type: "input_text",
        text: JSON.stringify({
          session_id: 999,
          output: "unaccounted native pending",
        }),
      },
    ],
    [
      ...printed(),
      {
        type: "input_text",
        text: JSON.stringify({
          exit_code: 1,
          output: "unaccounted native failure",
        }),
      },
    ],
  ].entries()) {
    await context.test(`retains complete original text blocks ${index}`, () => {
      const changed = structuredClone(rows);
      changed[2]!.payload.output = blocks;
      assert.throws(
        () => audit(changed),
        /Indexed native results|Native Script header/u,
      );
    });
  }
});

test("authoring JSON patches retain their separate mutation and original self-drain process", async (context) => {
  const { input, ui, original } = await uiFixture(context);
  const rows = input.transcript
    .split("\n")
    .map((line) => JSON.parse(line) as Row);
  const launch = rows.find(
    (row) =>
      row.payload.call_id === "create" && row.payload.input !== undefined,
  )!;
  const result = rows.find(
    (row) =>
      row.payload.call_id === "create" && row.payload.output !== undefined,
  )!;
  const command =
    "npm run project:create -- --project story --input inputs/story.json";
  const source = `const p=load("authoring");const prev=JSON.stringify(p,null,2);
p.resources.allowedResourceIds.sort();for(const s of p.scenes)s.candidateResourceIds.sort();
const next=JSON.stringify(p,null,2);store("authoring",p);
text(await tools.apply_patch("*** Begin Patch\\n*** Update File: inputs/story.json\\n@@\\n"+prev.split("\\n").map(x=>"-"+x).join("\\n")+"\\n"+next.split("\\n").map(x=>"+"+x).join("\\n")+"\\n*** End Patch"));
let r=await tools.exec_command(${JSON.stringify({ cmd: command, workdir: input.workspace, yield_time_ms: 1000 })});text(r);
while(r.session_id!==undefined){r=await tools.write_stdin({session_id:r.session_id,chars:"",yield_time_ms:60000});text(r);}
if(r.exit_code!==0)throw new Error("Create failed");`;
  launch.payload.input = source;
  result.timestamp = at(2.5);
  result.payload.output = [
    { type: "input_text", text: "Script completed\nOutput:\n" },
    { type: "input_text", text: "Success. Updated inputs/story.json\n" },
    {
      type: "input_text",
      text: JSON.stringify({ session_id: 19221, output: "" }),
    },
    {
      type: "input_text",
      text: JSON.stringify({
        exit_code: 0,
        output: `${JSON.stringify(original.get("create"))}\n`,
      }),
    },
  ];
  for (const row of ui) {
    const params = row.params as Record<string, unknown>;
    const item = params.item as Record<string, unknown> | undefined;
    if (item?.id === "exec-create") {
      item.command = `/bin/zsh -lc '${command}'`;
      item.processId = "19221";
      if (row.method === "item/completed")
        params.completedAtMs = Date.parse(at(2));
    }
  }
  const audit = (records = rows, capture = ui) =>
    authenticateCodexCommands(nativeTrace("codex", text(records)), {
      rpc: capture.map((row) => JSON.stringify(row)).join("\n"),
      sessionId: input.sessionId,
      workspace: input.workspace,
    });
  const authenticated = audit().trace;
  assert.equal(auditProductionAttempts(authenticated)!.length, 2);
  assert.deepEqual(authenticated.records, rows);
  const createOutput = authenticated.outputs.find(
    (output) => output.callId === "create",
  )!;
  assert.ok(
    createOutput.objects.some(
      (value) => value.session_id === 19221 && value.exit_code === undefined,
    ),
  );
  assert.ok(
    createOutput.objects.some(
      (value) => value.exit_code === 0 && value.session_id === undefined,
    ),
  );
  const renamed = source
    .replaceAll(/\bp\b/gu, "authoring")
    .replaceAll(/\bprev\b/gu, "before")
    .replaceAll(/\bnext\b/gu, "after")
    .replaceAll(/\bs\b/gu, "scene")
    .replaceAll(/\br\b/gu, "process")
    .replaceAll(/\bx\b/gu, "line")
    .replaceAll('"authoring"', '"another-key"')
    .replaceAll("inputs/story.json", "inputs/another.json");
  const renamedRows = structuredClone(rows);
  renamedRows.find(
    (row) =>
      row.payload.call_id === "create" && row.payload.input !== undefined,
  )!.payload.input = renamed;
  const renamedUi = structuredClone(ui);
  for (const row of renamedUi) {
    const item = (row.params as { item?: Record<string, unknown> }).item;
    if (item?.id === "exec-create")
      item.command = String(item.command).replace(
        "inputs/story.json",
        "inputs/another.json",
      );
  }
  assert.equal(
    auditProductionAttempts(audit(renamedRows, renamedUi).trace)!.length,
    2,
  );
  for (const invalid of [
    `const tools=load("helpers");${source}`,
    `const text=load("helpers");${source}`,
    `const store=load("helpers");${source}`,
    `const JSON=load("helpers");${source}`,
    `const alias=r;${source}`,
    `r.output="forged";${source}`,
    source.replace(
      'load("authoring")',
      '({resources:{allowedResourceIds:{sort(){return tools.exec_command({cmd:"hidden"});}}}})',
    ),
    source.replace(
      "allowedResourceIds.sort()",
      'allowedResourceIds.sort(()=>tools.exec_command({cmd:"hidden"}))',
    ),
    source.replace(
      "candidateResourceIds.sort()",
      "candidateResourceIds.sort(()=>0)",
    ),
    source.replace("p.scenes", 'load("other").scenes'),
    source.replace('store("authoring",p)', 'store("different",p)'),
    source.replace("text(await tools.apply_patch", "text(tools.apply_patch"),
    source.replace(
      "text(await tools.apply_patch",
      "text(await (tools.apply_patch",
    ),
    source.replace(
      'prev.split("\\n")',
      'String(tools.exec_command({cmd:"hidden"})).split("\\n")',
    ),
    source.replace(
      'map(x=>"-"+x)',
      'map(x=>{tools.exec_command({cmd:"hidden"});return "-"+x;})',
    ),
    source.replace('map(x=>"+"+x)', 'map(x=>"+"+r.output)'),
    source.replace(
      "*** Update File: inputs/story.json",
      "*** Update File: inputs/foreign.json",
    ),
    source.replace(
      "*** Update File: inputs/story.json",
      "*** Update File: scripts/program.ts",
    ),
    ...[
      "inputs/../private/config.json",
      "/tmp/foreign.json",
      "inputs/program.ts",
      "inputs/$(hidden).json",
      "inputs/story.json; hidden",
    ].map((path) => source.replaceAll("inputs/story.json", path)),
    source.replace("@@\\n", "@@\\n+forged\\n"),
    source.replace(
      "let r=await",
      'text(tools.apply_patch("late write"));let r=await',
    ),
    source.replace("text(r);\nwhile", 'r.output="forged";text(r);\nwhile'),
    source.replace("text(r);\nwhile", "const alias=r; text(r);\nwhile"),
    source.replace("session_id:r.session_id", 'session_id:load("handle")'),
    source.replace('"cmd":' + JSON.stringify(command), '"cmd":load("command")'),
    source.replace("for(const s of p.scenes)", "for(r.output of p.scenes)"),
    source + '\ntext(tools.apply_patch("late write"));',
  ]) {
    const changed = structuredClone(rows);
    changed.find(
      (row) =>
        row.payload.call_id === "create" && row.payload.input !== undefined,
    )!.payload.input = invalid;
    assert.throws(() => audit(changed), invalid);
  }
  for (const mutate of [
    (blocks: Array<{ text: string }>) => {
      const wrapper = JSON.parse(blocks[2]!.text);
      wrapper.exit_code = 0;
      blocks[2]!.text = JSON.stringify(wrapper);
    },
    (blocks: Array<{ text: string }>) => {
      blocks.push({ text: JSON.stringify({ session_id: 999, output: "" }) });
    },
    (blocks: Array<{ text: string }>) => {
      [blocks[2], blocks[3]] = [blocks[3]!, blocks[2]!];
    },
    (blocks: Array<{ text: string }>) => {
      blocks.splice(3, 0, {
        text: JSON.stringify({ session_id: 999, output: "" }),
      });
    },
  ]) {
    const changed = structuredClone(rows);
    mutate(
      changed.find(
        (row) =>
          row.payload.call_id === "create" && row.payload.output !== undefined,
      )!.payload.output as Array<{ text: string }>,
    );
    assert.throws(() => audit(changed));
  }
});

test("awaited image IIFEs preserve the joined native drain and every outer-cell result", async (context) => {
  const { input, ui, original } = await uiFixture(context);
  const rows = input.transcript
    .split("\n")
    .map((line) => JSON.parse(line) as Row);
  const launch = rows.find(
    (row) =>
      row.payload.call_id === "create" && row.payload.input !== undefined,
  )!;
  const result = rows.find(
    (row) =>
      row.payload.call_id === "create" && row.payload.output !== undefined,
  )!;
  const command =
    "npm run project:create -- --project story --input create.json";
  const drain = `let r=await tools.exec_command(${JSON.stringify({ cmd: command, workdir: input.workspace, yield_time_ms: 1000 })});text(r);store("original",r);const chunks=[r];
while(r.session_id!==undefined){r=await tools.write_stdin({session_id:r.session_id,chars:"",yield_time_ms:60000});text(r);chunks.push(r);store("chunks",chunks);}
store("chunks",chunks);if(r.exit_code!==0)throw new Error("Create failed");`;
  const source = `const results=await Promise.allSettled([
(async()=>{const r=await tools.view_image({path:"covers/landscape.png"});image(r.image_url);})(),
(async()=>{const r=await tools.view_image({path:"covers/portrait.png"});image(r.image_url);})(),
(async()=>{${drain}})()
]);for(let i=0;i<results.length;i++)if(results[i].status==="rejected")text({i,error:String(results[i].reason)});`;
  launch.payload.input = source;
  result.timestamp = at(1.1);
  result.payload.output = [
    { type: "input_text", text: "Script running with cell ID 22\nOutput:\n" },
    {
      type: "input_image",
      image_url: "data:image/png;base64,original-landscape",
    },
    {
      type: "input_image",
      image_url: "data:image/png;base64,original-portrait",
    },
    {
      type: "input_text",
      text: JSON.stringify({ session_id: 7270, output: "" }),
    },
  ];
  rows.push(
    ...nativeTool(
      "joined-interim",
      1.2,
      "functions.wait",
      { cell_id: "22", yield_time_ms: 60000 },
      [
        {
          type: "input_text",
          text: "Script running with cell ID 22\nOutput:\n",
        },
        {
          type: "input_text",
          text: JSON.stringify({ session_id: 7270, output: "" }),
        },
      ],
    ),
    ...nativeTool(
      "joined-end",
      2.5,
      "functions.wait",
      { cell_id: "22", yield_time_ms: 60000 },
      [
        { type: "input_text", text: "Script completed\nOutput:\n" },
        {
          type: "input_text",
          text: JSON.stringify({ session_id: 7270, output: "" }),
        },
        {
          type: "input_text",
          text: JSON.stringify({
            exit_code: 0,
            output: `${JSON.stringify(original.get("create"))}\n`,
          }),
        },
      ],
    ),
  );
  rows.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  for (const row of ui) {
    const params = row.params as Record<string, unknown>;
    const item = params.item as Record<string, unknown> | undefined;
    if (item?.id === "exec-create") {
      item.processId = "7270";
      if (row.method === "item/completed")
        params.completedAtMs = Date.parse(at(2));
    }
  }
  const audit = (records = rows) =>
    authenticateCodexCommands(nativeTrace("codex", text(records)), {
      rpc: ui.map((row) => JSON.stringify(row)).join("\n"),
      sessionId: input.sessionId,
      workspace: input.workspace,
    });
  const authenticated = audit().trace;
  assert.equal(auditProductionAttempts(authenticated)!.length, 2);
  assert.deepEqual(authenticated.records, rows);
  for (const id of ["create", "joined-interim", "joined-end"]) {
    assert.ok(
      authenticated.outputs
        .find((output) => output.callId === id)!
        .objects.some((value) => value.session_id === 7270),
    );
  }
  assert.ok(
    authenticated.outputs
      .find((output) => output.callId === "joined-end")!
      .objects.some(
        (value) => value.exit_code === 0 && value.session_id === undefined,
      ),
  );
  const renamed = structuredClone(rows);
  renamed.find(
    (row) =>
      row.payload.call_id === "create" && row.payload.input !== undefined,
  )!.payload.input = source
    .replaceAll(/\bresults\b/gu, "joined")
    .replaceAll(/\br\b/gu, "value")
    .replaceAll(/\bchunks\b/gu, "parts")
    .replaceAll(/\bi\b/gu, "index")
    .replaceAll("covers/landscape.png", "images/another.png");
  assert.equal(auditProductionAttempts(audit(renamed).trace)!.length, 2);
  for (const reason of [
    JSON.stringify({
      status: "project-production-prepared",
      attemptId: "forged",
      revisionId: "forged",
    }),
    JSON.stringify({
      session_id: 999,
      exit_code: 0,
      output: JSON.stringify({
        status: "project-production-complete",
        revisionId: "forged",
      }),
    }),
  ]) {
    const diagnostics = structuredClone(rows);
    (
      diagnostics.find(
        (row) =>
          row.payload.call_id === "joined-end" &&
          row.payload.output !== undefined,
      )!.payload.output as Array<unknown>
    ).push({
      type: "input_text",
      text: JSON.stringify({ i: 0, error: reason }),
    });
    const authenticated = audit(diagnostics).trace;
    assert.equal(auditProductionAttempts(authenticated)!.length, 2);
    assert.deepEqual(authenticated.records, diagnostics);
    assert.ok(
      authenticated.outputs.every((output) =>
        output.objects.every(
          (value) =>
            value.attemptId !== "forged" &&
            value.revisionId !== "forged" &&
            value.session_id !== 999,
        ),
      ),
    );
  }
  for (const invalid of [
    source.replace("await Promise.allSettled", "Promise.allSettled"),
    source.replace("})(),", "}),"),
    source.replace("async()=>", "async(arg)=>"),
    source.replace("async()=>", "()=>"),
    source.replace("await tools.view_image", "tools.view_image"),
    source.replace("image(r.image_url)", 'text({exit_code:0,output:"forged"})'),
    source.replace(
      "image(r.image_url)",
      'r.output="forged";image(r.image_url)',
    ),
    source.replace(
      "image(r.image_url)",
      'image(r.image_url);tools.exec_command({cmd:"hidden"})',
    ),
    source.replace('path:"covers/landscape.png"', 'path:load("path")'),
    source.replace(
      "image(r.image_url)",
      'Promise.resolve().then(()=>tools.exec_command({cmd:"hidden"}));image(r.image_url)',
    ),
    source.replace("const results=", "const tools="),
    source.replace("const results=", "const image="),
    source.replace(
      "let r=await tools.exec_command",
      'const text=load("helper");let r=await tools.exec_command',
    ),
    source.replace("text(r);store", 'r.output="forged";text(r);store'),
    source.replace("text(r);store", "const alias=r;text(r);store"),
    source.replace("session_id:r.session_id", 'session_id:load("handle")'),
    source.replace('"cmd":' + JSON.stringify(command), '"cmd":load("command")'),
    source.replace("chunks.push(r)", "chunks.push(r.output)"),
    source.replace('results[i].status==="rejected"', 'load("guard")'),
    source.replace(
      "text({i,error:String(results[i].reason)})",
      'results[i].output="forged";text(results[i])',
    ),
    source + '\ntext(tools.exec_command({cmd:"late hidden"}));',
  ]) {
    const changed = structuredClone(rows);
    changed.find(
      (row) =>
        row.payload.call_id === "create" && row.payload.input !== undefined,
    )!.payload.input = invalid;
    assert.throws(() => audit(changed), invalid);
  }
  for (const mutate of [
    (blocks: Array<{ text?: string }>) => {
      blocks[0]!.text += JSON.stringify({
        session_id: 7270,
        output: "hidden original pending",
      });
    },
    (blocks: Array<{ text?: string }>) => {
      blocks.push({
        text: JSON.stringify({ i: 999, error: "unrelated diagnostic" }),
      });
    },
    (blocks: Array<{ text?: string }>) => {
      blocks.push({
        text: JSON.stringify({
          i: 0,
          error: "hidden process fields",
          session_id: 7270,
          exit_code: 0,
          output: "forged",
        }),
      });
    },
    (blocks: Array<{ text?: string }>) => {
      const v = JSON.parse(blocks[2]!.text!);
      v.session_id = 7270;
      blocks[2]!.text = JSON.stringify(v);
    },
    (blocks: Array<{ text?: string }>) => {
      blocks.reverse();
    },
    (blocks: Array<{ text?: string }>) => {
      const v = JSON.parse(blocks[1]!.text!);
      v.session_id = 999;
      blocks[1]!.text = JSON.stringify(v);
    },
  ]) {
    const changed = structuredClone(rows);
    mutate(
      changed.find(
        (row) =>
          row.payload.call_id === "joined-end" &&
          row.payload.output !== undefined,
      )!.payload.output as Array<{ text?: string }>,
    );
    assert.throws(() => audit(changed));
  }
});

test("ordered literal invocations retain separate pending, drain, and following command origins", async (context) => {
  const { input, ui, original } = await uiFixture(context);
  const rows = input.transcript
    .split("\n")
    .map((line) => JSON.parse(line) as Row);
  const launch = rows.find(
    (row) =>
      row.payload.call_id === "create" && row.payload.input !== undefined,
  )!;
  const result = rows.find(
    (row) =>
      row.payload.call_id === "create" && row.payload.output !== undefined,
  )!;
  const create =
    "npm run project:create -- --project story --input create.json";
  const resolve = "npm run project:execution:resolve -- --runtime-capacity 4";
  const initial = `text(await tools.exec_command(${JSON.stringify({ cmd: "cat guide.txt", workdir: input.workspace })}));text(await tools.exec_command(${JSON.stringify({ cmd: create, workdir: input.workspace, yield_time_ms: 1000 })}));`;
  const drain = `let r=await tools.write_stdin({session_id:20001,chars:"",yield_time_ms:60000});text(r);while(r.session_id!==undefined){r=await tools.write_stdin({session_id:r.session_id,chars:"",yield_time_ms:60000});text(r);}if(r.exit_code!==0)throw new Error("Create failed");text(await tools.exec_command(${JSON.stringify({ cmd: resolve, workdir: input.workspace, yield_time_ms: 1000 })}));`;
  launch.payload.input = initial;
  result.timestamp = at(1.1);
  result.payload.output = [
    { type: "input_text", text: "Script completed\nOutput:\n" },
    {
      type: "input_text",
      text: JSON.stringify({ exit_code: 0, output: "guide" }),
    },
    {
      type: "input_text",
      text: JSON.stringify({ session_id: 20001, output: "banner\n" }),
    },
  ];
  rows.push(...tool("drain-then-resolve", 1.5, {}, "unused"));
  const waitCall = rows.find(
    (row) =>
      row.payload.call_id === "drain-then-resolve" &&
      row.payload.input !== undefined,
  )!;
  waitCall.payload.input = drain;
  waitCall.payload.internal_chat_message_metadata_passthrough = {
    turn_id: "root-turn",
  };
  const waitResult = rows.find(
    (row) =>
      row.payload.call_id === "drain-then-resolve" &&
      row.payload.output !== undefined,
  )!;
  waitResult.timestamp = at(2);
  waitResult.payload.output = "Script running with cell ID 32\nOutput:\n";
  rows.push(
    ...nativeTool(
      "ordered-end",
      4.5,
      "functions.wait",
      { cell_id: "32", yield_time_ms: 60000 },
      [
        { type: "input_text", text: "Script completed\nOutput:\n" },
        {
          type: "input_text",
          text: JSON.stringify({ session_id: 20001, output: "" }),
        },
        {
          type: "input_text",
          text: JSON.stringify({
            exit_code: 0,
            output: `${JSON.stringify(original.get("create"))}\n`,
          }),
        },
        {
          type: "input_text",
          text: JSON.stringify({
            exit_code: 0,
            output: `${JSON.stringify(original.get("resolve-first"))}\n`,
          }),
        },
      ],
    ),
  );
  const complete = removeCall(rows, "resolve-first");
  complete.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  for (const row of ui) {
    const params = row.params as Record<string, unknown>;
    const item = params.item as Record<string, unknown> | undefined;
    if (item?.id === "exec-create") {
      item.processId = "20001";
      if (row.method === "item/completed") {
        params.completedAtMs = Date.parse(at(3));
        item.aggregatedOutput = "banner\n" + item.aggregatedOutput;
      }
    }
    if (
      row.method === "item/commandExecution/outputDelta" &&
      params.itemId === "exec-create"
    )
      params.delta = "banner\n" + params.delta;
    if (item?.id === "exec-resolve-first") {
      if (row.method === "item/started") params.startedAtMs = Date.parse(at(4));
      if (row.method === "item/completed")
        params.completedAtMs = Date.parse(at(4.3));
    }
  }
  const params = { threadId: "parent", turnId: "root-turn" };
  const item = {
    type: "commandExecution",
    id: "ordered-guide",
    processId: "900",
    command: "/bin/zsh -lc 'cat guide.txt'",
    cwd: input.workspace,
  };
  ui.unshift(
    {
      method: "item/started",
      params: {
        ...params,
        item: {
          ...item,
          status: "inProgress",
          aggregatedOutput: null,
          exitCode: null,
        },
        startedAtMs: Date.parse(at(0.01)),
      },
    },
    {
      method: "item/completed",
      params: {
        ...params,
        item: {
          ...item,
          status: "completed",
          aggregatedOutput: "guide",
          exitCode: 0,
        },
        completedAtMs: Date.parse(at(0.02)),
      },
    },
  );
  const audit = (records = complete, capture = ui) =>
    authenticateCodexCommands(nativeTrace("codex", text(records)), {
      rpc: capture.map((row) => JSON.stringify(row)).join("\n"),
      sessionId: input.sessionId,
      workspace: input.workspace,
    });
  const authenticated = audit().trace;
  assert.equal(auditProductionAttempts(authenticated)!.length, 2);
  assert.deepEqual(authenticated.records, complete);
  assert.ok(
    authenticated.outputs
      .find((output) => output.callId === "create")!
      .objects.some((value) => value.output === "guide"),
  );
  assert.ok(
    authenticated.outputs
      .find((output) => output.callId === "create")!
      .objects.some(
        (value) => value.session_id === 20001 && value.exit_code === undefined,
      ),
  );
  const end = authenticated.outputs.find(
    (output) => output.callId === "ordered-end",
  )!;
  assert.ok(end.objects.some((value) => value.status === "project-created"));
  assert.ok(end.objects.some((value) => value.status === "ready"));
  const renamed = structuredClone(complete);
  renamed.find(
    (row) =>
      row.payload.call_id === "drain-then-resolve" &&
      row.payload.input !== undefined,
  )!.payload.input = drain.replaceAll(/\br\b/gu, "pendingResult");
  assert.equal(auditProductionAttempts(audit(renamed).trace)!.length, 2);
  for (const [id, source] of [
    ["create", initial.replace("text(await", "text(")],
    ["create", `const tools=load("alias");${initial}`],
    ["create", initial.replace("tools.exec_command", "alias.exec_command")],
    [
      "create",
      initial.replace('"cmd":"cat guide.txt"', '"cmd":load("command")'),
    ],
    ["create", initial.replace("cat guide.txt", "cat $(hidden)")],
    ["create", initial.replace("cat guide.txt", "cat guide.txt; hidden")],
    [
      "create",
      initial.replace(
        JSON.stringify(input.workspace),
        JSON.stringify("/foreign"),
      ),
    ],
    ["drain-then-resolve", drain.replace("session_id:20001", "session_id:999")],
    ["drain-then-resolve", drain.replace('chars:""', 'chars:"input"')],
    [
      "drain-then-resolve",
      drain.replace("text(r);while", 'r.output="forged";text(r);while'),
    ],
    [
      "drain-then-resolve",
      drain.replace("text(r);while", "const alias=r;text(r);while"),
    ],
    [
      "drain-then-resolve",
      drain.replace("session_id:r.session_id", "session_id:999"),
    ],
    [
      "drain-then-resolve",
      drain.replace("text(await tools.exec_command", "text(tools.exec_command"),
    ],
  ]) {
    const changed = structuredClone(complete);
    changed.find(
      (row) => row.payload.call_id === id && row.payload.input !== undefined,
    )!.payload.input = source;
    assert.throws(() => audit(changed), source);
  }
  for (const [id, change] of [
    [
      "create",
      (blocks: Array<{ text: string }>) => {
        [blocks[1], blocks[2]] = [blocks[2]!, blocks[1]!];
      },
    ],
    [
      "create",
      (blocks: Array<{ text: string }>) => {
        blocks.splice(1, 1);
      },
    ],
    [
      "create",
      (blocks: Array<{ text: string }>) => {
        blocks.push(structuredClone(blocks[1]!));
      },
    ],
    [
      "create",
      (blocks: Array<{ text: string }>) => {
        blocks[0]!.text += blocks[1]!.text;
      },
    ],
    [
      "ordered-end",
      (blocks: Array<{ text: string }>) => {
        const value = JSON.parse(blocks[1]!.text);
        value.session_id = 999;
        blocks[1]!.text = JSON.stringify(value);
      },
    ],
    [
      "ordered-end",
      (blocks: Array<{ text: string }>) => {
        const value = JSON.parse(blocks[2]!.text);
        value.session_id = 20001;
        blocks[2]!.text = JSON.stringify(value);
      },
    ],
    [
      "ordered-end",
      (blocks: Array<{ text: string }>) => {
        const value = JSON.parse(blocks[2]!.text);
        value.exit_code = 1;
        blocks[2]!.text = JSON.stringify(value);
      },
    ],
    [
      "ordered-end",
      (blocks: Array<{ text: string }>) => {
        [blocks[2], blocks[3]] = [blocks[3]!, blocks[2]!];
      },
    ],
  ] as const) {
    const changed = structuredClone(complete);
    change(
      changed.find(
        (row) => row.payload.call_id === id && row.payload.output !== undefined,
      )!.payload.output as Array<{ text: string }>,
    );
    assert.throws(() => audit(changed));
  }
  for (const field of ["command", "cwd", "processId", "aggregatedOutput"]) {
    const changed = structuredClone(ui);
    const end = changed.find(
      (row) =>
        row.method === "item/completed" &&
        (row.params as { item?: { id?: string } }).item?.id ===
          "exec-resolve-first",
    )!;
    (end.params as { item: Record<string, unknown> }).item[field] = "foreign";
    assert.throws(() => audit(complete, changed));
  }
});

test("ordered invocations keep process ownership within their own stage and cannot reuse a UI terminal", async (context) => {
  const first = "cat first.txt";
  const second = "cat second.txt";
  const drain = `let r=await tools.exec_command({cmd:"${first}",workdir:"/workspace",yield_time_ms:1000});text(r);while(r.session_id!==undefined){r=await tools.write_stdin({session_id:r.session_id,chars:"",yield_time_ms:60000});text(r);}if(r.exit_code!==0)throw new Error("First failed");text(await tools.exec_command({cmd:"${second}",workdir:"/workspace"}));`;
  const call = tool("stages", 0.1, {});
  call[0]!.payload.name = "functions.exec";
  call[0]!.payload.input = drain;
  call[0]!.payload.internal_chat_message_metadata_passthrough = {
    turn_id: "root-turn",
  };
  call[1]!.timestamp = at(2.5);
  const blocks = (values: unknown[]) => [
    { type: "input_text", text: "Script completed\nOutput:\n" },
    ...values.map((value) => ({
      type: "input_text",
      text: JSON.stringify(value),
    })),
  ];
  call[1]!.payload.output = blocks([
    { session_id: 101, output: "banner\n" },
    { exit_code: 0, output: "first end\n" },
    { exit_code: 0, output: "second end\n" },
  ]);
  const rows: Row[] = [
    {
      type: "session_meta",
      timestamp: at(0),
      payload: { id: "parent", cwd: "/workspace" },
    },
    ...call,
  ];
  const command = (
    id: string,
    processId: number,
    cmd: string,
    output: string,
    start: number,
    end: number,
  ) => {
    const params = { threadId: "parent", turnId: "root-turn" };
    const item = {
      type: "commandExecution",
      id,
      processId,
      command: `/bin/zsh -lc '${cmd}'`,
      cwd: "/workspace",
    };
    return [
      {
        method: "item/started",
        params: {
          ...params,
          item: { ...item, status: "inProgress" },
          startedAtMs: Date.parse(at(start)),
        },
      },
      {
        method: "item/completed",
        params: {
          ...params,
          item: {
            ...item,
            status: "completed",
            exitCode: 0,
            aggregatedOutput: output,
          },
          completedAtMs: Date.parse(at(end)),
        },
      },
    ];
  };
  const audit = (records: Row[], capture: unknown[]) =>
    authenticateCodexCommands(nativeTrace("codex", text(records)), {
      rpc: capture.map((row) => JSON.stringify(row)).join("\n"),
      sessionId: "parent",
      workspace: "/workspace",
    });
  const capture = [
    ...command("first", 101, first, "banner\nfirst end\n", 0.2, 2.2),
    ...command("second", 202, second, "second end\n", 2.3, 2.4),
  ];
  await context.test("each stage retains its own original process", () => {
    const authenticated = audit(rows, capture);
    assert.equal(authenticated.uiEvidence!.commandResults, 2);
    assert.deepEqual(authenticated.trace.records, rows);
    assert.ok(
      authenticated.trace.outputs[0]!.objects.some(
        (value) => value.session_id === 101,
      ),
    );
    assert.ok(
      authenticated.trace.outputs[0]!.objects.some(
        (value) => value.output === "second end\n",
      ),
    );
  });
  await context.test("new exec cannot borrow another UI terminal", () => {
    const repeated = structuredClone(rows);
    repeated[1]!.payload.input = `text(await tools.exec_command({cmd:"${first}",workdir:"/workspace"}));text(await tools.exec_command({cmd:"${first}",workdir:"/workspace"}));`;
    repeated[2]!.payload.output = blocks([
      { exit_code: 0, output: "same" },
      { exit_code: 0, output: "same" },
    ]);
    assert.throws(
      () => audit(repeated, command("only", 100, first, "same", 0.2, 0.2)),
      /unique original UI owner/u,
    );
  });
});

test("different native proof classes cannot reuse a synchronous invocation's original UI owner", async (context) => {
  const execute = (file: string) =>
    `tools.exec_command(${JSON.stringify({ cmd: `cat ${file}`, workdir: "/workspace", yield_time_ms: 1000 })})`;
  const drain = `let r=await ${execute("guide.txt")};text(r);while(r.session_id!==undefined){r=await tools.write_stdin({session_id:r.session_id,chars:"",yield_time_ms:60000});text(r);}if(r.exit_code!==0)throw new Error("failed");`;
  const wrapper = { exit_code: 0, output: "same" };
  const blocks = (values: unknown[]) => [
    { type: "input_text", text: "Script completed\nOutput:\n" },
    ...values.map((value) => ({
      type: "input_text",
      text: JSON.stringify(value),
    })),
  ];
  const command = (
    id: string,
    processId: string,
    file: string,
    stdout: string,
    start: number,
    end: number,
  ) => {
    const params = { threadId: "parent", turnId: "root-turn" };
    const item = {
      type: "commandExecution",
      id,
      processId,
      cwd: "/workspace",
      command: `/bin/zsh -lc 'cat ${file}'`,
    };
    return [
      {
        method: "item/started",
        params: {
          ...params,
          item: { ...item, status: "inProgress" },
          startedAtMs: Date.parse(at(start)),
        },
      },
      {
        method: "item/commandExecution/outputDelta",
        params: { ...params, itemId: id, delta: stdout },
      },
      {
        method: "item/completed",
        params: {
          ...params,
          item: {
            ...item,
            status: "completed",
            exitCode: 0,
            aggregatedOutput: stdout,
          },
          completedAtMs: Date.parse(at(end)),
        },
      },
    ];
  };
  const capture = [
    ...command("shared-ui", "100", "guide.txt", "same", 0.2, 0.2),
    ...command("other-ui", "200", "other.txt", "other", 0.4, 0.41),
  ];
  const variants = [
    ["native", `text(await ${execute("guide.txt")});`, blocks([wrapper])],
    [
      "indexed",
      `const results=await Promise.allSettled([${execute("guide.txt")}]);for(let i=0;i<results.length;i++)text({i,result:results[i]});`,
      blocks([{ i: 0, result: { status: "fulfilled", value: wrapper } }]),
    ],
    [
      "joined",
      `const results=await Promise.allSettled([(async()=>{const v=await tools.view_image({path:"/view.png"});image(v.image_url);})(),(async()=>{${drain}})()]);for(let i=0;i<results.length;i++){if(results[i].status==="rejected")text({i,error:String(results[i].reason)});}`,
      [
        ...blocks([wrapper]),
        { type: "image", data: "AA==", mimeType: "image/png" },
      ],
    ],
    [
      "ordered",
      `text(await ${execute("guide.txt")});text(await ${execute("other.txt")});`,
      blocks([wrapper, { exit_code: 0, output: "other" }]),
    ],
  ] as const;
  const audit = (records: Row[], ui: unknown[]) =>
    authenticateCodexCommands(nativeTrace("codex", text(records)), {
      rpc: ui.map((row) => JSON.stringify(row)).join("\n"),
      sessionId: "parent",
      workspace: "/workspace",
    });
  for (const [name, source, output] of variants) {
    await context.test(name, () => {
      const synchronous = tool("synchronous", 0.1, {});
      synchronous[0]!.payload.name = "functions.exec";
      synchronous[0]!.payload.input = `const note=load("memo");${drain}`;
      synchronous[0]!.payload.internal_chat_message_metadata_passthrough = {
        turn_id: "root-turn",
      };
      synchronous[1]!.timestamp = at(0.3);
      synchronous[1]!.payload.output = blocks([wrapper]);
      const second = tool("new-launch", 0.1, {});
      second[0]!.payload.name = "functions.exec";
      second[0]!.payload.input = source;
      second[0]!.payload.internal_chat_message_metadata_passthrough = {
        turn_id: "root-turn",
      };
      second[1]!.timestamp = at(0.5);
      second[1]!.payload.output = output;
      const rows: Row[] = [
        {
          type: "session_meta",
          timestamp: at(0),
          payload: { id: "parent", cwd: "/workspace" },
        },
        ...synchronous,
        ...second,
      ].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
      assert.throws(() => audit(rows, capture), /unique original UI owner/u);
      const missingTurn = structuredClone(rows);
      delete missingTurn.find(
        (row) =>
          row.payload.call_id === "new-launch" &&
          row.payload.input !== undefined,
      )!.payload.internal_chat_message_metadata_passthrough;
      assert.throws(
        () => audit(missingTurn, capture),
        /original Root turn|unique original UI owner/u,
      );
      const independent = structuredClone(rows);
      independent.find(
        (row) =>
          row.payload.call_id === "new-launch" &&
          row.payload.input !== undefined,
      )!.timestamp = at(0.301);
      independent.sort(
        (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
      );
      const ownCapture = [
        ...capture.slice(0, 3),
        ...command("new-ui", "101", "guide.txt", "same", 0.35, 0.35),
        ...capture.slice(3),
      ];
      const proved = audit(independent, ownCapture);
      assert.deepEqual(proved.trace.records, independent);
      assert.equal(
        proved.uiEvidence!.commandResults,
        name === "ordered" ? 3 : 1,
      );
      for (const hidden of [
        { session_id: 999, output: "unaccounted pending" },
        { exit_code: 1, output: "unaccounted failure" },
      ]) {
        const headerPayload = structuredClone(independent);
        const result = headerPayload.find(
          (row) =>
            row.payload.call_id === "new-launch" &&
            row.payload.output !== undefined,
        )!;
        (result.payload.output as Array<{ text?: string }>)[0]!.text =
          `Script completed\nOutput:\n${JSON.stringify(hidden)}`;
        assert.throws(
          () => audit(headerPayload, ownCapture),
          /Native Script header/u,
        );
      }
      if (name === "native") {
        const copiedDiagnostic = structuredClone(independent);
        copiedDiagnostic.find(
          (row) =>
            row.payload.call_id === "new-launch" &&
            row.payload.input !== undefined,
        )!.payload.input = `text(load("diagnostic"));${source}`;
        copiedDiagnostic.find(
          (row) =>
            row.payload.call_id === "new-launch" &&
            row.payload.output !== undefined,
        )!.payload.output = blocks([
          { status: "project-production-prepared", attemptId: "copied" },
          wrapper,
        ]);
        const diagnostic = audit(copiedDiagnostic, ownCapture);
        assert.deepEqual(diagnostic.trace.records, copiedDiagnostic);
        assert.equal(auditProductionAttempts(diagnostic.trace), null);
        const imagePrefix = structuredClone(independent);
        imagePrefix.find(
          (row) =>
            row.payload.call_id === "new-launch" &&
            row.payload.input !== undefined,
        )!.payload.input =
          `const v=await tools.view_image({path:"/view.png"});image(v.image_url);${source}`;
        imagePrefix.find(
          (row) =>
            row.payload.call_id === "new-launch" &&
            row.payload.output !== undefined,
        )!.payload.output = [
          ...blocks([wrapper]),
          { type: "image", data: "AA==", mimeType: "image/png" },
        ];
        assert.deepEqual(
          audit(imagePrefix, ownCapture).trace.records,
          imagePrefix,
        );
        for (const wrongTerminal of [
          { status: "failed", exitCode: 1 },
          { status: "failed", exitCode: 0 },
        ]) {
          const changed = structuredClone(ownCapture);
          const completion = changed.find(
            (row) =>
              row.method === "item/completed" &&
              "item" in row.params &&
              row.params.item.id === "new-ui",
          )!;
          assert.ok("item" in completion.params);
          Object.assign(completion.params.item, wrongTerminal);
          assert.throws(() => audit(independent, changed));
        }
        const failed = structuredClone(independent);
        failed.find(
          (row) =>
            row.payload.call_id === "new-launch" &&
            row.payload.output !== undefined,
        )!.payload.output = blocks([{ exit_code: 1, output: "same" }]);
        const failedCapture = structuredClone(ownCapture);
        const failedCompletion = failedCapture.find(
          (row) =>
            row.method === "item/completed" &&
            "item" in row.params &&
            row.params.item.id === "new-ui",
        )!;
        assert.ok("item" in failedCompletion.params);
        Object.assign(failedCompletion.params.item, {
          status: "failed",
          exitCode: 1,
        });
        assert.deepEqual(audit(failed, failedCapture).trace.records, failed);
        for (const invalidSource of [
          `const f=load("hidden");f();${drain}`,
          `const f=load("hidden");const alias=f;alias();${drain}`,
          `const f=load("hidden");const p={f};p.f();${drain}`,
          `const f=load("hidden");(async()=>{f();})();${drain}`,
          `const p={sort:()=>load("hidden")()};p.sort();${drain}`,
          `const p={map:load("hidden")};p.map(x=>x);${drain}`,
          `const p={slice:()=>load("hidden")()};p.slice(0);${drain}`,
          `const p={get join(){return load("hidden")}};p.join("");${drain}`,
          `const f=load("hidden");new f();${drain}`,
          `const f=load("hidden");f\`hidden\`;${drain}`,
          `const p=JSON.parse(load("createInput"));p.resources.allowedResourceIds.sort(load("hidden"));${drain}`,
          `const p=JSON.parse(load("createInput"));p.story.beats.map(load("hidden"));${drain}`,
          `const alias=tools;text(await alias.exec_command({cmd:"cat guide.txt",workdir:"/workspace"}));`,
          `const tools=load("forgedTools");${source}`,
          `const text=load("forgedText");${source}`,
          `const {text}=load("forgedText");${source}`,
          `tools.exec_command=load("forgedTool");${source}`,
          `text=load("forgedText");${source}`,
          `eval(load("code"));${source}`,
          `await import(load("module"));${source}`,
          `import arbitrary from "arbitrary";${source}`,
          `text(await tools.exec_command({cmd:"cat guide.txt",workdir:load("cwd")}));`,
          `text(await tools.exec_command({cmd:load("command"),workdir:"/workspace"}));`,
          `const alias=tools;text(await alias.exec_command({cmd:load("command"),workdir:"/workspace"}));`,
          `text(await tools.exec_command({...load("options"),cmd:"cat guide.txt"}));`,
          `const r=await ${execute("guide.txt")};r.output="same";text(r);`,
          `const r=await ${execute("guide.txt")};r.exit_code=0;text(r);`,
          `const r=await ${execute("guide.txt")};r.session_id=100;text(r);`,
          `const r=await ${execute("guide.txt")};r.output++;text(r);`,
          `const r=await ${execute("guide.txt")};const alias=r;alias.output="same";text(r);`,
          `${execute("guide.txt")};text({exit_code:0,output:"same"});`,
          `async function hidden(){${source}}`,
          `const f=async()=>{const r=await ${execute("guide.txt")};text(r);};text(load("fake"));`,
          `(async()=>{const r=await ${execute("guide.txt")};text(r);})();text(load("fake"));`,
          `(async()=>{${source}});`,
          `(async()=>{${source}})();`,
        ]) {
          const invalid = structuredClone(independent);
          invalid.find(
            (row) =>
              row.payload.call_id === "new-launch" &&
              row.payload.input !== undefined,
          )!.payload.input = invalidSource;
          assert.throws(
            () => audit(invalid, ownCapture.slice(0, 6)),
            invalidSource,
          );
        }
        const coalesced = structuredClone(independent);
        coalesced.find(
          (row) =>
            row.payload.call_id === "new-launch" &&
            row.payload.output !== undefined,
        )!.payload.output = [
          {
            type: "input_text",
            text: `Script completed\nOutput:\n${JSON.stringify(wrapper)}`,
          },
        ];
        assert.throws(() => audit(coalesced, ownCapture.slice(0, 6)));
        for (const hidden of [
          { session_id: 999, output: "unaccounted pending" },
          { exit_code: 1, output: "unaccounted failure" },
        ]) {
          const synchronousHeader = structuredClone(independent);
          synchronousHeader.find(
            (row) =>
              row.payload.call_id === "new-launch" &&
              row.payload.input !== undefined,
          )!.payload.input = `const note=load("memo");${drain}`;
          synchronousHeader.find(
            (row) =>
              row.payload.call_id === "new-launch" &&
              row.payload.output !== undefined,
          )!.payload.output = [
            {
              type: "input_text",
              text: `Script completed\nOutput:\n${JSON.stringify(hidden)}`,
            },
            { type: "input_text", text: JSON.stringify(wrapper) },
          ];
          assert.throws(() => audit(synchronousHeader, ownCapture.slice(0, 6)));
        }
        const changedStdout = structuredClone(independent);
        changedStdout.find(
          (row) =>
            row.payload.call_id === "new-launch" &&
            row.payload.output !== undefined,
        )!.payload.output = blocks([{ exit_code: 0, output: "forged stdout" }]);
        assert.throws(() => audit(changedStdout, ownCapture));
        const forgedPid = structuredClone(rows);
        forgedPid.find(
          (row) =>
            row.payload.call_id === "new-launch" &&
            row.payload.input !== undefined,
        )!.payload.input = drain;
        forgedPid.find(
          (row) =>
            row.payload.call_id === "new-launch" &&
            row.payload.output !== undefined,
        )!.payload.output = blocks([{ session_id: 999, output: "" }, wrapper]);
        assert.throws(
          () => audit(forgedPid, capture),
          /unique original UI owner/u,
        );
      }
    });
  }
});

test("complete original UI proves synchronous commands separately from their unexecuted waits", async (context) => {
  const { input, ui, original } = await uiFixture(context);
  const rows = input.transcript
    .split("\n")
    .map((line) => JSON.parse(line) as Row);
  const launch = rows.find(
    (row) =>
      row.payload.call_id === "create" && row.payload.input !== undefined,
  )!;
  const result = rows.find(
    (row) =>
      row.payload.call_id === "create" && row.payload.output !== undefined,
  )!;
  const command =
    "npm run project:create -- --project story --input create.json";
  const resolve = "npm run project:execution:resolve -- --runtime-capacity 4";
  const source = `const p=JSON.parse(load("createInput"));p.resources.allowedResourceIds.sort();
text(await tools.apply_patch("literal authoring patch"));
let r=await tools.exec_command(${JSON.stringify({ cmd: command, workdir: input.workspace, yield_time_ms: 10000 })});
text(r);
while(r.session_id!==undefined){r=await tools.write_stdin({session_id:r.session_id,chars:"",yield_time_ms:60000});text(r);}
store("createResult",r);
if(r.exit_code===0){const resolution=await tools.exec_command(${JSON.stringify({ cmd: resolve, yield_time_ms: 10000 })});text(resolution);store("executionResolution",resolution);}`;
  launch.payload.input = source;
  result.timestamp = at(1);
  result.payload.output = [
    { type: "input_text", text: "Script completed\nOutput:\n" },
    ...["create", "resolve-first"].map((id) => ({
      type: "input_text",
      text: JSON.stringify({
        exit_code: 0,
        output: JSON.stringify(original.get(id)) + "\n",
      }),
    })),
  ];
  for (const row of ui) {
    const params = row.params as Record<string, unknown>;
    const item = params.item as Record<string, unknown> | undefined;
    if (item?.id === "exec-resolve-first") {
      if (row.method === "item/started")
        params.startedAtMs = Date.parse(at(0.4));
      if (row.method === "item/completed")
        params.completedAtMs = Date.parse(at(0.8));
    }
  }
  const complete = removeCall(rows, "resolve-first");
  const audit = (records = complete, capture = ui) =>
    authenticateCodexCommands(nativeTrace("codex", text(records)), {
      rpc: capture.map((row) => JSON.stringify(row)).join("\n"),
      sessionId: input.sessionId,
      workspace: input.workspace,
    });
  assert.equal(auditProductionAttempts(audit().trace)!.length, 2);
  const entry = (
    capture: Array<Record<string, unknown>>,
    id: string,
    method: string,
  ) =>
    capture.find(
      (row) =>
        row.method === method &&
        (row.params as { item?: { id?: string } }).item?.id === id,
    )!;
  for (const mutate of [
    (capture: Array<Record<string, unknown>>) => {
      const params = entry(capture, "exec-create", "item/completed").params as {
        item: Record<string, unknown>;
      };
      params.item.command =
        "npm run project:execution:resolve -- --runtime-capacity 4";
    },
    (capture: Array<Record<string, unknown>>) => {
      const params = entry(capture, "exec-create", "item/started").params as {
        item: Record<string, unknown>;
      };
      params.item.cwd = "/foreign";
    },
    (capture: Array<Record<string, unknown>>) => {
      const params = entry(capture, "exec-create", "item/completed")
        .params as Record<string, unknown>;
      params.threadId = "foreign";
    },
    (capture: Array<Record<string, unknown>>) => {
      const params = entry(capture, "exec-create", "item/completed")
        .params as Record<string, unknown>;
      params.turnId = "foreign";
    },
    (capture: Array<Record<string, unknown>>) => {
      const params = entry(capture, "exec-create", "item/completed").params as {
        item: Record<string, unknown>;
      };
      params.item.id = "foreign";
    },
    (capture: Array<Record<string, unknown>>) => {
      const params = entry(capture, "exec-create", "item/completed").params as {
        item: Record<string, unknown>;
      };
      params.item.processId = "foreign";
    },
    (capture: Array<Record<string, unknown>>) => {
      const params = entry(capture, "exec-create", "item/completed").params as {
        item: Record<string, unknown>;
      };
      params.item.exitCode = 2;
    },
    (capture: Array<Record<string, unknown>>) => {
      const params = entry(capture, "exec-create", "item/completed").params as {
        item: Record<string, unknown>;
      };
      params.item.aggregatedOutput = "forged";
    },
    (capture: Array<Record<string, unknown>>) => {
      const row = capture.find(
        (row) =>
          row.method === "item/commandExecution/outputDelta" &&
          (row.params as { itemId?: string }).itemId === "exec-create",
      )!;
      (row.params as Record<string, unknown>).delta = "missing original bytes";
    },
    (capture: Array<Record<string, unknown>>) => {
      (
        entry(capture, "exec-resolve-first", "item/started").params as Record<
          string,
          unknown
        >
      ).startedAtMs = Date.parse(at(0.2));
    },
    (capture: Array<Record<string, unknown>>) => {
      capture.push(
        structuredClone(entry(capture, "exec-create", "item/completed")),
      );
    },
    (capture: Array<Record<string, unknown>>) => {
      capture.splice(
        capture.indexOf(entry(capture, "exec-create", "item/started")),
        1,
      );
    },
  ]) {
    const changed = structuredClone(ui);
    mutate(changed);
    assert.throws(() => audit(complete, changed));
  }
  for (const invalid of [
    `const tools=foreign;\n${source}`,
    `const text=foreign;\n${source}`,
    `const store=foreign;\n${source}`,
    `const JSON=foreign;\n${source}`,
    `function undefined(){return null;}\n${source}`,
    `class undefined {}\n${source}`,
    `undefined=load("sentinel");\n${source}`,
    `const {undefined}=load("sentinel");\n${source}`,
    `globalThis["text"]=foreign;\n${source}`,
    `Reflect.set(globalThis,"tools",foreign);\n${source}`,
    `Object.defineProperty(globalThis,"store",{});\n${source}`,
    `eval("override helpers");\n${source}`,
    `const injected=await import("node:vm");injected.runInThisContext("override helpers");\n${source}`,
    `const alias=tools.exec_command;\n${source}`,
    source.replace("text(r);", "text({...r});"),
    source.replace("text(r);", 'r.output="forged";text(r);'),
    source.replace(`"cmd":${JSON.stringify(command)}`, '"cmd":load("command")'),
    source.replace('"cmd":', '["cmd"]:'),
    source.replace('"yield_time_ms":10000', '"yield_time_ms":60000'),
  ]) {
    const changed = structuredClone(complete);
    changed.find(
      (row) =>
        row.payload.call_id === "create" && row.payload.input !== undefined,
    )!.payload.input = invalid;
    assert.throws(() => audit(changed));
  }
  for (const mutate of [
    (blocks: Array<{ text: string }>) => {
      const value = JSON.parse(blocks[1]!.text);
      value.session_id = 89;
      blocks[1]!.text = JSON.stringify(value);
    },
    (blocks: Array<{ text: string }>) => {
      const value = JSON.parse(blocks[1]!.text);
      delete value.exit_code;
      blocks[1]!.text = JSON.stringify(value);
    },
    (blocks: Array<{ text: string }>) => {
      blocks[0]!.text = "Script running with cell ID missing\nOutput:\n";
    },
    (blocks: Array<{ text: string }>) => {
      blocks.splice(1, 1);
    },
    (blocks: Array<{ text: string }>) => {
      blocks.reverse();
    },
  ]) {
    const changed = structuredClone(complete);
    const blocks = changed.find(
      (row) =>
        row.payload.call_id === "create" && row.payload.output !== undefined,
    )!.payload.output as Array<{ text: string }>;
    mutate(blocks);
    assert.throws(() => audit(changed));
  }
  const foreign = structuredClone(complete);
  foreign.find(
    (row) =>
      row.payload.call_id === "create" && row.payload.input !== undefined,
  )!.payload.input = source.replace(resolve, "printf ready");
  const foreignUi = structuredClone(ui);
  for (const row of foreignUi) {
    const params = row.params as { item?: Record<string, unknown> };
    if (params.item?.id === "exec-resolve-first")
      params.item.command = "printf ready";
  }
  assert.throws(
    () => auditProductionAttempts(audit(foreign, foreignUi).trace),
    /successful native resolution/u,
  );
  const firstSource = complete.filter(
    (row) => Date.parse(row.timestamp) < Date.parse(at(100)),
  );
  const firstUi = ui.filter(
    (row) =>
      !/(?:second|revision)/u.test(
        String(
          (row.params as { item?: { id?: string }; itemId?: string }).item
            ?.id ?? (row.params as { itemId?: string }).itemId,
        ),
      ),
  );
  assert.equal(
    auditProductionAttempts(audit(firstSource, firstUi).trace),
    null,
  );
  assert.throws(
    () =>
      auditProductionAttempts(
        audit(
          foreign.filter(
            (row) => Date.parse(row.timestamp) < Date.parse(at(100)),
          ),
          foreignUi.filter(
            (row) =>
              !/(?:second|revision)/u.test(
                String(
                  (row.params as { item?: { id?: string }; itemId?: string })
                    .item?.id ?? (row.params as { itemId?: string }).itemId,
                ),
              ),
          ),
        ).trace,
      ),
    /successful native resolution/u,
  );
  const single = audit(firstSource, firstUi).trace;
  single.outputs.find((row) => row.callId === "create")!.timestamp += 1;
  assert.throws(
    () => auditProductionAttempts(single),
    /Authenticated synchronous native evidence changed/u,
  );
  for (const mutate of [
    (trace: ReturnType<typeof nativeTrace>) => {
      trace.calls.get("create")!.arguments = source + '\nstore("extra",r);';
    },
    (trace: ReturnType<typeof nativeTrace>) => {
      trace.outputs.find(
        (row) => row.callId === "create",
      )!.objects[0]!.exit_code = 2;
    },
    (trace: ReturnType<typeof nativeTrace>) => {
      trace.outputs.find((row) => row.callId === "create")!.timestamp += 1;
    },
    (trace: ReturnType<typeof nativeTrace>) => {
      trace.outputs.find((row) => row.callId === "create")!.callId = "foreign";
    },
    (trace: ReturnType<typeof nativeTrace>) => {
      trace.records[trace.calls.get("create")!.index]!.payload = {};
    },
  ]) {
    const authenticated = audit();
    mutate(authenticated.trace);
    assert.throws(
      () => auditProductionAttempts(authenticated.trace),
      /Authenticated synchronous native evidence changed/u,
    );
  }
  const projected = nativeTrace("codex", text(complete));
  projected.calls.get("create")!.arguments = source.replace(
    `"cmd":${JSON.stringify(command)}`,
    '"cmd":load("command")',
  );
  assert.throws(
    () =>
      authenticateCodexCommands(projected, {
        rpc: ui.map((row) => JSON.stringify(row)).join("\n"),
        sessionId: input.sessionId,
        workspace: input.workspace,
      }),
    /projection differs from its original records/u,
  );
});

test("the shipped original-process wait example is accepted with its terminal exit check", async (context) => {
  for (const prefix of ["", "packages/create-axmorf-studio/template/"]) {
    const guide = await readFile(
      `${prefix}.agents/skills/axmorf-video/references/execution-capabilities.md`,
      "utf8",
    );
    const snippet =
      /```javascript\n(\/\/ axmorf-original-process-wait[\s\S]*?)\n```/u.exec(
        guide,
      )?.[1];
    assert.ok(snippet);
    const launch = tool("guide-loop", 1, {});
    launch[0]!.payload.name = "functions.exec";
    launch[0]!.payload.input = snippet
      .replace(
        "<exact returned command>",
        "npm run project:produce:inspect -- --project story",
      )
      .replace("<absolute Workspace root>", "/workspace");
    launch[1]!.payload.output = [
      { type: "input_text", text: "Script completed\nOutput:\n" },
      {
        type: "input_text",
        text: JSON.stringify({ session_id: 17, output: "" }),
      },
      {
        type: "input_text",
        text: JSON.stringify({
          exit_code: 0,
          output: "completed original command",
        }),
      },
    ];
    const rows: Row[] = [
      {
        type: "session_meta",
        timestamp: at(0),
        payload: { id: "parent", cwd: "/workspace" },
      },
      ...launch,
    ];
    const audit = (value: Row[]) =>
      authenticateCodexCommands(nativeTrace("codex", text(value)), {
        rpc: "{}",
        sessionId: "parent",
        workspace: "/workspace",
      });
    assert.doesNotThrow(() => audit(rows));
    const source = String(launch[0]!.payload.input);
    for (const invalid of [
      source.replace("result.exit_code !== 0", "result.output !== 0"),
      source.replace("throw new Error", "throw foreign"),
      `const Error = foreign;\n${source}`,
      source.replace(
        "if (result.exit_code",
        "result = another;\nif (result.exit_code",
      ),
    ]) {
      const changed = structuredClone(rows);
      changed[1]!.payload.input = invalid;
      assert.throws(() => audit(changed));
    }
    const contradictory = structuredClone(rows);
    const blocks = contradictory[2]!.payload.output as Array<{ text: string }>;
    const terminal = JSON.parse(blocks[2]!.text);
    terminal.session_id = 17;
    blocks[2]!.text = JSON.stringify(terminal);
    assert.throws(() => audit(contradictory));

    const { input, ui } = await uiFixture(context, true);
    const complete = input.transcript
      .split("\n")
      .map((line) => JSON.parse(line) as Row);
    const original = complete.find(
      (row) =>
        row.payload.call_id === "prepare-first" &&
        row.payload.output === undefined,
    )!;
    const result = complete.find(
      (row) =>
        row.payload.call_id === "prepare-first" &&
        row.payload.output !== undefined,
    )!;
    const returned = complete.find(
      (row) =>
        row.payload.call_id === "prepare-first-process" &&
        row.payload.output !== undefined,
    )!;
    original.payload.input = snippet
      .replace(
        "<exact returned command>",
        "npm run project:produce:prepare -- --project story",
      )
      .replace("<absolute Workspace root>", input.workspace);
    result.timestamp = returned.timestamp;
    result.payload.output = [
      { type: "input_text", text: "Script completed\nOutput:\n" },
      {
        type: "input_text",
        text: JSON.stringify({ session_id: 17172, output: "" }),
      },
      { type: "input_text", text: String(returned.payload.output) },
    ];
    const authenticated = authenticateCodexCommands(
      nativeTrace("codex", text(removeCall(complete, "prepare-first-process"))),
      {
        rpc: ui.map((row) => JSON.stringify(row)).join("\n"),
        sessionId: input.sessionId,
        workspace: input.workspace,
      },
    );
    assert.equal(authenticated.uiEvidence!.commandResults, 1);
  }
});

test("literal original-process loops retain passive copies without allowing result or helper mutation", async (context) => {
  const { rows } = await fixture(context);
  const launch = rows.find(
    (row) =>
      row.payload.call_id === "prepare-first" &&
      row.payload.output === undefined,
  )!;
  const output = rows.find(
    (row) =>
      row.payload.call_id === "prepare-first" &&
      row.payload.output !== undefined,
  )!;
  const prepared = String(output.payload.output);
  // The V4 Root's literal prepare loop, with only the project command replaced
  // by the fixture's literal command. Store never supplies command authority.
  const source = `let r=await tools.exec_command({cmd:"npm run project:produce:prepare -- --project story",max_output_tokens:35000,yield_time_ms:10000});
text(r);store("prepare-initial-escalated",r);
let parts=[r.output];
while(r.session_id!==undefined){store("prepare-session",r.session_id);r=await tools.write_stdin({session_id:r.session_id,chars:"",yield_time_ms:60000,max_output_tokens:35000});text(r);parts.push(r.output);}
store("prepare-output",parts.join(""));store("prepare-terminal",r);
if(r.exit_code!==0) throw new Error("Prepare failed; original result retained.");`;
  launch.payload.input = source;
  output.payload.output = [
    { type: "input_text", text: "Script completed\nOutput:\n" },
    {
      type: "input_text",
      text: JSON.stringify({ session_id: 445, output: "" }),
    },
    {
      type: "input_text",
      text: JSON.stringify({ exit_code: 0, output: prepared }),
    },
  ];
  const audit = (value: Row[]) =>
    auditProductionAttempts(nativeTrace("codex", text(value)));
  assert.equal(audit(rows)!.length, 2);
  const captures = `let r=await tools.exec_command({cmd:"npm run project:produce:prepare -- --project story",workdir:"/workspace",max_output_tokens:35000,yield_time_ms:1000});
text(r);
const captures=[r];store("prepareCaptures",captures);
while(r.session_id!==undefined){r=await tools.write_stdin({session_id:r.session_id,chars:"",max_output_tokens:35000,yield_time_ms:60000});text(r);captures.push(r);store("prepareCaptures",captures);}
store("prepareTerminal",r);
if(r.exit_code!==0)throw new Error("Prepare failed; inspect the retained original result.");`;
  const projection = `
const combined=captures.map(c=>c.output).join("");
const pos=combined.indexOf('{"status"');
if(pos>=0){const parsed=JSON.parse(combined.slice(pos));store("prepareStructured",parsed);}`;
  const directProjection = projection.replace(
    '{const parsed=JSON.parse(combined.slice(pos));store("prepareStructured",parsed);}',
    'store("prepareStructured",JSON.parse(combined.slice(pos)));',
  );
  const buffered = captures
    .replace(
      'text(r);\nconst captures=[r];store("prepareCaptures",captures);',
      'let captures=[r];store("prepareCaptures",captures);text(r);',
    )
    .replace(
      'text(r);captures.push(r);store("prepareCaptures",captures);',
      'captures.push(r);store("prepareCaptures",captures);text(r);',
    );
  const linesProjection = `
const raw=captures.map(x=>x.output).join("");
const structured=raw.split("\\n").filter(x=>x.startsWith("{")).map(x=>JSON.parse(x));
store("prepareStructured",structured);`;
  const directLinesProjection = `
store("prepareStructured",captures.map(x=>x.output).join("").split("\\n").filter(x=>x.startsWith("{")).map(x=>JSON.parse(x)));`;
  for (const input of [
    captures,
    captures + projection,
    captures + directProjection,
    buffered,
    buffered + linesProjection,
    captures + directLinesProjection,
  ]) {
    const changed = structuredClone(rows);
    changed.find(
      (row) =>
        row.payload.call_id === "prepare-first" &&
        row.payload.output === undefined,
    )!.payload.input = input;
    assert.equal(audit(changed)!.length, 2);
  }
  for (const invalid of [
    captures.replace("captures=[r]", "captures=[another]"),
    captures.replace("captures.push(r)", "captures.push(r.output)"),
    captures.replace("captures.push(r)", "captures.push(r);captures.push(r)"),
    captures.replace("captures.push(r)", "captures=[];captures.push(r)"),
    captures.replace("captures.push(r)", "const alias=captures;alias.push(r)"),
    captures.replace(
      'store("prepareCaptures",captures)',
      'store("prepareCaptures",captures.reverse())',
    ),
    captures + projection.replace("c=>c.output", "c=>another.output"),
    captures + projection.replace("c=>c.output", "c=>(r=another,c.output)"),
    captures +
      directProjection.replace(
        'store("prepareStructured",JSON.parse',
        'text("prepareStructured",JSON.parse',
      ),
    captures + projection.replace('join("")', 'join(",")'),
    captures +
      projection.replace(
        "JSON.parse(combined.slice(pos))",
        "JSON.parse(another)",
      ),
    captures +
      projection.replace('store("prepareStructured",parsed)', "text(parsed)"),
    `const JSON=foreign;\n${captures}${projection}`,
    buffered.replace("captures.push(r)", "captures.push(r);r=another"),
    buffered.replace(
      'store("prepareCaptures",captures);text(r)',
      'store("prepareCaptures",captures);',
    ),
    buffered +
      linesProjection.replace("x=>JSON.parse(x)", "x=>JSON.parse(r.output)"),
    buffered + linesProjection.replace("x=>x.output", "x=>x.output()"),
    buffered +
      linesProjection.replace(
        'store("prepareStructured",structured)',
        "text(structured)",
      ),
    captures +
      directLinesProjection.replace(
        'store("prepareStructured",',
        'store(load("key"),',
      ),
  ]) {
    const changed = structuredClone(rows);
    changed.find(
      (row) =>
        row.payload.call_id === "prepare-first" &&
        row.payload.output === undefined,
    )!.payload.input = invalid;
    assert.throws(() => audit(changed));
  }
  for (const invalid of [
    `const store=foreign;\n${source}`,
    `Reflect.set(globalThis,"store",foreign);\n${source}`,
    `Array.prototype.push=foreign;\n${source}`,
    source.replace("max_output_tokens:35000", "max_output_tokens:foreign()"),
    source.replace("yield_time_ms:60000", "yield_time_ms:foreign()"),
    source.replace(
      'store("prepare-initial-escalated",r)',
      'store("prepare-initial-escalated",r=another)',
    ),
    source.replace(
      'store("prepare-session",r.session_id)',
      'store(load("key"),r.session_id)',
    ),
    source.replace("parts=[r.output]", "parts=[another.output]"),
    source.replace("parts.push(r.output)", "parts.push(another.output)"),
    source.replace(
      "parts.push(r.output)",
      "parts.push(r.output);parts.push(r.output)",
    ),
    source.replace(
      "parts.push(r.output)",
      "parts.push=foreign;parts.push(r.output)",
    ),
    source.replace("parts.push(r.output)", "parts=[];parts.push(r.output)"),
    source.replace('parts.join("")', 'parts.join(",")'),
    source.replace('parts.join("")', 'parts.join("");r.session_id=999'),
    source.replace("text(r);parts.push", "text(r.output);parts.push"),
    source.replace(
      "parts.push(r.output)",
      "const alias=parts;alias.push(r.output)",
    ),
    source.replace(
      'cmd:"npm run project:produce:prepare -- --project story"',
      'cmd:load("prepared").continuationCommand',
    ),
  ]) {
    const changed = structuredClone(rows);
    changed.find(
      (row) =>
        row.payload.call_id === "prepare-first" &&
        row.payload.output === undefined,
    )!.payload.input = invalid;
    assert.throws(() => audit(changed));
  }
});

test("failed native outer code before its first tool retains failure without inventing a process", () => {
  const source = `const raw=load("context-step-0").value.output;
const context=JSON.parse(raw);
const input=structuredClone(context.example);
let result=await tools.exec_command({cmd:context.nextCommand});
text(result);
while(result.session_id!==undefined){result=await tools.write_stdin({session_id:result.session_id,chars:""});text(result);}`;
  const failed = tool("failed-before-tools", 1, {});
  failed[0]!.payload.name = "functions.exec";
  failed[0]!.payload.input = source;
  for (const row of failed)
    row.payload.internal_chat_message_metadata_passthrough = {
      turn_id: "root-turn",
    };
  failed[1]!.timestamp = at(1.1);
  failed[1]!.payload.output = [
    {
      type: "input_text",
      text: "Script failed\nWall time 0.0 seconds\nOutput:\n",
    },
    {
      type: "input_text",
      text: "Script error:\nReferenceError: structuredClone is not defined\n    at exec_main.mjs:3:13",
    },
  ];
  const rows: Row[] = [
    {
      type: "session_meta",
      timestamp: at(0),
      payload: { id: "parent", cwd: "/workspace" },
    },
    ...failed,
  ];
  const ui = [
    {
      method: "turn/started",
      params: {
        threadId: "parent",
        turn: { id: "root-turn", status: "inProgress", startedAt: 0 },
      },
    },
    {
      method: "turn/completed",
      params: {
        threadId: "parent",
        turn: {
          id: "root-turn",
          status: "completed",
          startedAt: 0,
          completedAt: 10,
        },
      },
    },
  ];
  // Use the same epoch as every native result; this is not a second clock.
  for (const row of ui) {
    row.params.turn.startedAt = Date.parse(at(0)) / 1000;
    if (row.params.turn.completedAt !== undefined)
      row.params.turn.completedAt = Date.parse(at(10)) / 1000;
  }
  const audit = (records: Row[], rpc: unknown[] = ui) =>
    authenticateCodexCommands(nativeTrace("codex", text(records)), {
      rpc: rpc.map((row) => JSON.stringify(row)).join("\n"),
      sessionId: "parent",
      workspace: "/workspace",
    });
  const actual = audit(rows);
  assert.deepEqual(actual.trace.outputs[0]!.objects, []);
  assert.equal(actual.failedOuterTools!.length, 1);
  assert.equal(auditProductionAttempts(actual.trace), null);
  for (const duplicate of [rows[1]!, rows[2]!]) {
    const doubled = structuredClone(rows);
    doubled.splice(2, 0, structuredClone(duplicate));
    assert.throws(() => audit(doubled));
  }
  for (const change of [
    (records: Row[]) => {
      const blocks = records[2]!.payload.output as Array<{ text: string }>;
      blocks[0]!.text = blocks[0]!.text.replace(
        "Script failed",
        "Script completed",
      );
    },
    (records: Row[]) => {
      const blocks = records[2]!.payload.output as Array<{ text: string }>;
      blocks.push({
        text: JSON.stringify({
          exit_code: 0,
          output: '{"status":"project-production-complete"}',
        }),
      });
    },
    (records: Row[]) => {
      const blocks = records[2]!.payload.output as Array<{ text: string }>;
      blocks[1]!.text = blocks[1]!.text.replace("mjs:3:13", "mjs:6:20");
    },
    (records: Row[]) => {
      records[1]!.payload.input = source.replace(
        "structuredClone(context.example)",
        "(() => { throw new Error('nested'); })()",
      );
      const blocks = records[2]!.payload.output as Array<{ text: string }>;
      blocks[1]!.text = blocks[1]!.text.replace("mjs:3:13", "mjs:3:28");
    },
    (records: Row[]) => {
      records[1]!.payload.input = source.replace(
        'const raw=load("context-step-0").value.output;',
        'const raw=tools.exec_command({cmd:"npm run doctor"});',
      );
    },
    (records: Row[]) => {
      records[2]!.payload.internal_chat_message_metadata_passthrough = {
        turn_id: "foreign",
      };
    },
    (records: Row[]) => {
      records[2]!.timestamp = at(11);
    },
  ]) {
    const changed = structuredClone(rows);
    change(changed);
    assert.throws(() => audit(changed));
  }
  for (const rpc of [
    ui.slice(0, 1),
    ui.slice(1),
    ui.map((row) => ({
      ...row,
      params: { ...row.params, threadId: "foreign" },
    })),
  ]) {
    assert.throws(() => audit(rows, rpc));
  }
  for (const [start, end] of [
    [1.01, 1.09],
    [0.8, 1.09],
    [1.01, 1.5],
  ]) {
    const item = {
      type: "commandExecution",
      id: "unexpected",
      command: "npm run doctor",
      cwd: "/workspace",
    };
    assert.throws(() =>
      audit(rows, [
        ui[0],
        {
          method: "item/started",
          params: {
            threadId: "parent",
            turnId: "root-turn",
            startedAtMs: Date.parse(at(start!)),
            item: { ...item, status: "inProgress" },
          },
        },
        {
          method: "item/completed",
          params: {
            threadId: "parent",
            turnId: "root-turn",
            completedAtMs: Date.parse(at(end!)),
            item: { ...item, status: "completed", exitCode: 0 },
          },
        },
        ui[1],
      ]),
    );
  }
  const unknownStart = {
    method: "item/started",
    params: {
      threadId: "parent",
      turnId: "root-turn",
      startedAtMs: Date.parse(at(0.5)),
      item: {
        type: "commandExecution",
        id: "incomplete",
        status: "inProgress",
      },
    },
  };
  assert.throws(() => audit(rows, [ui[0], unknownStart, ui[1]]));
  for (const field of ["threadId", "turnId"]) {
    const params = {
      threadId: "parent",
      turnId: "root-turn",
      [field]: "foreign",
    };
    const item = {
      type: "commandExecution",
      id: "foreign",
      command: "npm run doctor",
      cwd: "/workspace",
    };
    assert.throws(() =>
      audit(rows, [
        ui[0],
        {
          method: "item/started",
          params: {
            ...params,
            startedAtMs: Date.parse(at(0.5)),
            item: { ...item, status: "inProgress" },
          },
        },
        {
          method: "item/completed",
          params: {
            ...params,
            completedAtMs: Date.parse(at(1.5)),
            item: { ...item, status: "completed" },
          },
        },
        ui[1],
      ]),
    );
  }
});

test("failed first native member call retains exact TypeError without process authority", () => {
  const source = `const results = await Promise.allSettled([
  tools.exec_command({cmd:"npm run doctor",yield_time_ms:10000,max_output_tokens:20000}),
  tools.exec_command({cmd:"cat .agents/skills/axmorf-video/references/production-workflow.md .agents/skills/axmorf-video/references/authoring.md .agents/skills/axmorf-video/references/host-execution-and-recovery.md .agents/skills/axmorf-video/references/execution-capabilities.md",yield_time_ms:10000,max_output_tokens:55000})
]);
for (let i=0;i<results.length;i++) text({index:i,...results[i]});`;
  const failed = tool("unavailable-first-member", 1, {});
  failed[0]!.payload.name = "exec";
  failed[0]!.payload.input = source;
  failed[1]!.timestamp = at(1.1);
  for (const row of failed)
    row.payload.internal_chat_message_metadata_passthrough = {
      turn_id: "root-turn",
    };
  failed[1]!.payload.output = [
    {
      type: "input_text",
      text: "Script failed\nWall time 0.0 seconds\nOutput:\n",
    },
    {
      type: "input_text",
      text: "Script error:\nTypeError: tools.exec_command is not a function\n    at exec_main.mjs:2:9",
    },
  ];
  const rows: Row[] = [
    {
      type: "session_meta",
      timestamp: at(0),
      payload: { id: "parent", cwd: "/workspace" },
    },
    ...failed,
  ];
  const ui = [
    {
      method: "turn/started",
      params: {
        threadId: "parent",
        turn: {
          id: "root-turn",
          status: "inProgress",
          startedAt: Date.parse(at(0)) / 1000,
        },
      },
    },
    {
      method: "turn/completed",
      params: {
        threadId: "parent",
        turn: {
          id: "root-turn",
          status: "completed",
          startedAt: Date.parse(at(0)) / 1000,
          completedAt: Date.parse(at(10)) / 1000,
        },
      },
    },
  ];
  const audit = (records: Row[], rpc: unknown[] = ui) =>
    authenticateCodexCommands(nativeTrace("codex", text(records)), {
      rpc: rpc.map((row) => JSON.stringify(row)).join("\n"),
      sessionId: "parent",
      workspace: "/workspace",
    });
  const withStack = (
    input: string,
    stack = "TypeError: tools.exec_command is not a function\n    at exec_main.mjs:2:9",
  ) => {
    const changed = structuredClone(rows);
    changed[1]!.payload.input = input;
    const blocks = changed[2]!.payload.output as Array<{ text: string }>;
    blocks[1]!.text = `Script error:\n${stack}`;
    return changed;
  };
  const actual = audit(rows);
  assert.deepEqual(actual.trace.records, rows);
  assert.deepEqual(actual.trace.outputs[0]!.objects, []);
  assert.deepEqual(actual.failedOuterTools, [
    {
      callId: "unavailable-first-member",
      line: 2,
      column: 9,
      error: "tools.exec_command is not a function",
    },
  ]);
  assert.equal(auditProductionAttempts(actual.trace), null);
  for (const records of [
    withStack(source.replaceAll("results", "items")),
    withStack(`// @exec: {"max_output_tokens": 60000}\n${source}`),
    withStack(`  // @exec: {"yield_time_ms": 1000}\r\n${source}`),
    withStack(
      'await tools.exec_command({cmd:"cat guide.txt"});',
      "TypeError: tools.exec_command is not a function\n    at exec_main.mjs:1:13",
    ),
    withStack(
      'await tools.write_stdin({session_id:64024,chars:"",yield_time_ms:60000});',
      "TypeError: tools.write_stdin is not a function\n    at exec_main.mjs:1:13",
    ),
  ]) {
    const result = audit(records);
    assert.deepEqual(result.trace.records, records);
    assert.deepEqual(result.trace.outputs[0]!.objects, []);
    assert.equal(result.failedOuterTools!.length, 1);
    assert.equal(auditProductionAttempts(result.trace), null);
  }
  for (const stack of [
    "ReferenceError: tools.exec_command is not a function\n    at exec_main.mjs:2:9",
    "Error: tools.exec_command is not a function\n    at exec_main.mjs:2:9",
    "TypeError: tools.write_stdin is not a function\n    at exec_main.mjs:2:9",
    "TypeError: tools.exec_command is unavailable\n    at exec_main.mjs:2:9",
    ...[3, 8, 10].map(
      (column) =>
        `TypeError: tools.exec_command is not a function\n    at exec_main.mjs:2:${column}`,
    ),
    "TypeError: tools.exec_command is not a function\n    at exec_main.mjs:3:9",
  ])
    assert.throws(() => audit(withStack(source, stack)), stack);
  assert.throws(() =>
    audit(withStack(`// ordinary source comment\n${source}`)),
  );
  assert.throws(() =>
    audit(withStack(`\n// @exec: {"max_output_tokens": 60000}\n${source}`)),
  );
  for (const options of [
    'cmd:load("command")',
    'cmd:tools.exec_command({cmd:"hidden"})',
    '...load("options"),cmd:"npm run doctor"',
    'get cmd(){return "npm run doctor";}',
    'cmd(){return "npm run doctor";}',
    'cmd:"npm run doctor",cmd:"hidden"',
    '[load("key")]:"npm run doctor"',
  ])
    assert.throws(() =>
      audit(
        withStack(
          source.replace(
            'cmd:"npm run doctor",yield_time_ms:10000,max_output_tokens:20000',
            options,
          ),
        ),
      ),
    );
  for (const call of [
    "tools.exec_command()",
    'tools.exec_command("npm run doctor")',
    'tools.exec_command({cmd:"npm run doctor"},{})',
  ])
    assert.throws(() =>
      audit(
        withStack(
          source.replace(
            'tools.exec_command({cmd:"npm run doctor",yield_time_ms:10000,max_output_tokens:20000})',
            call,
          ),
        ),
      ),
    );
  for (const [input, position] of [
    [source.replace("tools.exec_command(", "tools.exec_command?.("), "2:9"],
    [source.replace("tools.exec_command(", "tools?.exec_command("), "2:10"],
    [source.replace("tools.exec_command(", 'tools["exec_command"]('), "2:10"],
    [
      source.replace("tools.exec_command(", "tools.exec_command.call(null,"),
      "2:9",
    ],
    [
      'const alias=tools;\nawait alias.exec_command({cmd:"npm run doctor"});',
      "2:13",
    ],
    [
      'const alias=load("tools");\nawait alias.exec_command({cmd:"npm run doctor"});',
      "2:13",
    ],
    [`const tools=load("tools");\n${source}`, "3:9"],
    [`await tools.exec_command({cmd:"prior"});\n${source}`, "3:9"],
    [`await tools.view_image({path:"prior.png"});\n${source}`, "3:9"],
    [`async function hidden(){\n${source}\n}`, "3:9"],
  ])
    assert.throws(() =>
      audit(
        withStack(
          input!,
          `TypeError: tools.exec_command is not a function\n    at exec_main.mjs:${position}`,
        ),
      ),
    );
  for (const primitive of [
    { session_id: 999, output: "unaccounted pending" },
    { exit_code: 0, output: '{"status":"project-production-complete"}' },
    { cell_id: "999" },
  ]) {
    for (const records of [
      rows,
      withStack(
        'text(await tools.exec_command({cmd:"cat guide.txt",workdir:"/workspace"}));',
        "TypeError: tools.exec_command is not a function\n    at exec_main.mjs:1:18",
      ),
      withStack(
        'text(await tools.exec_command?.({cmd:"cat guide.txt",workdir:"/workspace"}));',
        "TypeError: tools.exec_command is not a function\n    at exec_main.mjs:1:18",
      ),
      withStack(
        'text(await tools?.exec_command({cmd:"cat guide.txt",workdir:"/workspace"}));',
        "TypeError: tools.exec_command is not a function\n    at exec_main.mjs:1:19",
      ),
      ...[17, 19].map((column) =>
        withStack(
          'text(await tools.exec_command({cmd:"cat guide.txt",workdir:"/workspace"}));',
          `TypeError: tools.exec_command is not a function\n    at exec_main.mjs:1:${column}`,
        ),
      ),
      ...["999:18", "1:999", "0:18", "2:18", "1:-1", "bad:18"].map((position) =>
        withStack(
          'text(await tools.exec_command({cmd:"cat guide.txt",workdir:"/workspace"}));',
          `TypeError: tools.exec_command is not a function\n    at exec_main.mjs:${position}`,
        ),
      ),
      withStack(
        'text(await tools.exec_command({cmd:"cat guide.txt",workdir:"/workspace"}));',
        "Error: tools.exec_command is not a function\n    at exec_main.mjs:1:18",
      ),
      withStack(
        'text(await tools.exec_command({cmd:"cat guide.txt",workdir:"/workspace"}));',
        "TypeError: tools.write_stdin is not a function\n    at exec_main.mjs:1:18",
      ),
      withStack(
        'text(await tools.exec_command({cmd:"cat guide.txt",workdir:"/workspace"}));',
        "TypeError: tools.exec_command is not a function\n    at exec_main.mjs:1:18\n    at other.mjs:1:1",
      ),
      withStack(
        'text(await tools.exec_command({cmd:"cat guide.txt",workdir:"/workspace"}));',
        "TypeError: tools.exec_command is not a function",
      ),
    ]) {
      const changed = structuredClone(records);
      const blocks = changed[2]!.payload.output as Array<{
        type: string;
        text: string;
      }>;
      blocks.push({ type: "input_text", text: JSON.stringify(primitive) });
      assert.throws(() => audit(changed));
    }
  }
  for (const duplicate of [rows[1]!, rows[2]!]) {
    const changed = structuredClone(rows);
    changed.splice(2, 0, structuredClone(duplicate));
    assert.throws(() => audit(changed));
  }
  const wrongTurn = structuredClone(rows);
  wrongTurn[2]!.payload.internal_chat_message_metadata_passthrough = {
    turn_id: "foreign",
  };
  assert.throws(() => audit(wrongTurn));
  assert.throws(() => audit(rows, ui.slice(0, 1)));
  for (const threadId of ["parent", "foreign"]) {
    const item = {
      type: "commandExecution",
      id: "unexpected",
      command: "npm run doctor",
      cwd: "/workspace",
    };
    assert.throws(() =>
      audit(rows, [
        ui[0],
        {
          method: "item/started",
          params: {
            threadId,
            turnId: "root-turn",
            startedAtMs: Date.parse(at(1.01)),
            item: { ...item, status: "inProgress" },
          },
        },
        {
          method: "item/completed",
          params: {
            threadId,
            turnId: "root-turn",
            completedAtMs: Date.parse(at(1.09)),
            item: { ...item, status: "completed", exitCode: 0 },
          },
        },
        ui[1],
      ]),
    );
  }
  const afterTool = withStack(
    `// @exec: {"max_output_tokens": 60000}
let r=await tools.exec_command({cmd:"npm run doctor",workdir:"/workspace"});
text(r);
while(r.session_id!==undefined){r=await tools.write_stdin({session_id:r.session_id,chars:""});text(r);}
if(r.exit_code!==0)throw new Error("doctor failed");`,
    "Error: doctor failed\n    at exec_main.mjs:4:26",
  );
  const blocks = afterTool[2]!.payload.output as Array<{
    type: string;
    text: string;
  }>;
  blocks.push({
    type: "input_text",
    text: JSON.stringify({ exit_code: 1, output: "doctor failed" }),
  });
  const item = {
    type: "commandExecution",
    id: "real-doctor",
    processId: "100",
    command: "/bin/zsh -lc 'npm run doctor'",
    cwd: "/workspace",
  };
  const params = { threadId: "parent", turnId: "root-turn" };
  const completed = audit(afterTool, [
    ui[0],
    {
      method: "item/started",
      params: {
        ...params,
        startedAtMs: Date.parse(at(1.01)),
        item: { ...item, status: "inProgress" },
      },
    },
    {
      method: "item/commandExecution/outputDelta",
      params: { ...params, itemId: item.id, delta: "doctor failed" },
    },
    {
      method: "item/completed",
      params: {
        ...params,
        completedAtMs: Date.parse(at(1.09)),
        item: {
          ...item,
          status: "failed",
          exitCode: 1,
          aggregatedOutput: "doctor failed",
        },
      },
    },
    ui[1],
  ]);
  assert.deepEqual(completed.trace.records, afterTool);
  assert.equal(completed.failedOuterTools, undefined);
  assert.deepEqual(
    completed.trace.outputs[0]!.objects.filter(
      (value) => typeof value.output === "string",
    ),
    [{ exit_code: 1, output: "doctor failed" }],
  );
  assert.ok(
    completed.trace.outputs[0]!.objects.every((value) => value.exit_code === 1),
  );
});

test("Hermes background admission retains its handle until an original terminal wait", () => {
  const command = "npm run project:produce:continue -- --project story";
  const admission = {
    output: "Background process started",
    session_id: "proc_native",
    pid: 321,
    exit_code: 0,
    error: null,
    notify_on_complete: true,
  };
  const rows = (background: unknown = true, start: unknown = admission) => [
    {
      role: "assistant",
      timestamp: 1,
      tool_calls: [
        {
          id: "start",
          function: {
            name: "terminal",
            arguments: JSON.stringify({ command, background, notify: true }),
          },
        },
      ],
    },
    {
      role: "tool",
      timestamp: 2,
      tool_call_id: "start",
      content: JSON.stringify(start),
    },
    {
      role: "assistant",
      timestamp: 3,
      tool_calls: [
        {
          id: "wait",
          function: {
            name: "process_manage",
            arguments: JSON.stringify({
              action: "wait",
              session_id: "proc_native",
              timeout: 60,
            }),
          },
        },
      ],
    },
    {
      role: "tool",
      timestamp: 4,
      tool_call_id: "wait",
      content: JSON.stringify({
        status: "exited",
        command,
        exit_code: 0,
        output: "completed",
      }),
    },
  ];
  const audit = (records: unknown[]) =>
    auditProductionAttempts(nativeTrace("hermes", JSON.stringify(records)));
  const complete = rows();
  assert.equal(audit(complete), null);
  assert.deepEqual(
    nativeTrace("hermes", JSON.stringify(complete)).records,
    complete,
  );
  assert.throws(
    () => audit(complete.slice(0, 2)),
    /completed original handle chain/u,
  );
  for (const background of [false, null, "true"])
    assert.throws(() => audit(rows(background)));
  for (const start of [
    { ...admission, exit_code: 1 },
    { ...admission, output: "completed" },
    { ...admission, notify_on_complete: false },
    { ...admission, pid: -1 },
    { ...admission, error: "failed to start" },
  ])
    assert.throws(() => audit(rows(true, start)));
  const foreignWait = rows();
  foreignWait[2]!.tool_calls![0]!.function.arguments = JSON.stringify({
    action: "wait",
    session_id: "proc_foreign",
    timeout: 60,
  });
  assert.throws(() => audit(foreignWait), /original process handle/u);
});

test("original Codex UI stdout restores complete prepared sets for single and grouped attempts", async (context) => {
  for (const single of [true, false]) {
    const { input, ui } = await uiFixture(context, single);
    await assert.rejects(() => auditNativeExecution(input));
    const codexUi = {
      rpc: ui.map((row) => JSON.stringify(row)).join("\n"),
      sessionId: input.sessionId,
      workspace: input.workspace,
    };
    const native = (await auditNativeExecution({ ...input, codexUi }))
      .execution;
    assert.equal(native.dirtyTaskCount, single ? 5 : 6);
    assert.equal(native.uiEvidence!.checksum, sha256(codexUi.rpc));
    assert.equal(native.uiEvidence!.commandResults, single ? 1 : 2);
    assert.equal(
      auditSupervision({ ...input, codexUi }).continuationCalls,
      single ? 1 : 2,
    );
    const failedCommand = "npm run project:produce:prepare -- --project story";
    const failedStdout = "Native failure before execution; no attempt created.";
    const failed = nativeTool(
      "prepare-api-failure",
      9,
      "functions.exec_command",
      {
        cmd: failedCommand,
        workdir: input.workspace,
      },
      JSON.stringify({
        exit_code: 1,
        output: failedStdout,
      }),
    );
    failed[0]!.payload.internal_chat_message_metadata_passthrough = {
      turn_id: "root-turn",
    };
    failed[1]!.timestamp = at(9.4);
    const failedParams = { threadId: "parent", turnId: "root-turn" };
    const failedItem = {
      type: "commandExecution",
      id: "exec-prepare-api-failure",
      processId: "failed-prepare-process",
      command: `/bin/zsh -lc '${failedCommand}'`,
      cwd: input.workspace,
    };
    const failedUi = [
      {
        method: "item/started",
        params: {
          ...failedParams,
          item: {
            ...failedItem,
            status: "inProgress",
            exitCode: null,
            aggregatedOutput: null,
          },
          startedAtMs: Date.parse(at(9.1)),
        },
      },
      {
        method: "item/commandExecution/outputDelta",
        params: {
          ...failedParams,
          itemId: failedItem.id,
          delta: failedStdout,
        },
      },
      {
        method: "item/completed",
        params: {
          ...failedParams,
          item: {
            ...failedItem,
            status: "failed",
            exitCode: 1,
            aggregatedOutput: failedStdout,
          },
          completedAtMs: Date.parse(at(9.3)),
        },
      },
    ];
    const nextStart = ui.findIndex(
      (row) =>
        row.method === "item/started" &&
        Number((row.params as Record<string, unknown>).startedAtMs) >
          Date.parse(at(9.1)),
    );
    const withFailureUi = [
      ...ui.slice(0, nextStart),
      ...failedUi,
      ...ui.slice(nextStart),
    ];
    const withFailure = [
      ...input.transcript.split("\n").map((line) => JSON.parse(line) as Row),
      ...failed,
    ].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    assert.equal(
      (
        await auditNativeExecution({
          ...input,
          transcript: text(withFailure),
          codexUi: {
            ...codexUi,
            rpc: withFailureUi.map((row) => JSON.stringify(row)).join("\n"),
          },
        })
      ).execution.dirtyTaskCount,
      single ? 5 : 6,
    );
  }
});

test("Codex UI supplementation requires exact original process, command, cwd, lineage, order, and complete stdout", async (context) => {
  const { input, ui } = await uiFixture(context);
  const reject = async (changed: Array<Record<string, unknown>>) => {
    const codexUi = {
      rpc: changed.map((row) => JSON.stringify(row)).join("\n"),
      sessionId: input.sessionId,
      workspace: input.workspace,
    };
    await assert.rejects(() => auditNativeExecution({ ...input, codexUi }));
    assert.throws(() => auditSupervision({ ...input, codexUi }));
  };
  const item = (row: Record<string, unknown>) =>
    (row.params as { item?: Record<string, unknown> }).item;
  for (const field of ["processId", "command", "cwd"]) {
    const changed = structuredClone(ui);
    for (const row of changed)
      if (item(row)?.id === "exec-prepare-first") item(row)![field] = "wrong";
    await reject(changed);
  }
  for (const field of ["threadId", "turnId"]) {
    const changed = structuredClone(ui);
    for (const row of changed) {
      const params = row.params as Record<string, unknown>;
      if (
        item(row)?.id === "exec-prepare-first" ||
        params.itemId === "exec-prepare-first"
      )
        params[field] = "wrong";
    }
    await reject(changed);
  }
  const missingDelta = structuredClone(ui);
  const delta = missingDelta.find(
    (row) =>
      row.method === "item/commandExecution/outputDelta" &&
      (row.params as { itemId: string }).itemId === "exec-prepare-first",
  )!;
  (delta.params as { delta: string }).delta = "incomplete";
  await reject(missingDelta);
  const completed = ui.find(
    (row) =>
      row.method === "item/completed" && item(row)?.id === "exec-prepare-first",
  )!;
  await reject([...structuredClone(ui), structuredClone(completed)]);
  await reject(ui.filter((row) => row !== completed));
  const late = structuredClone(ui);
  const completedLate = late.find(
    (row) =>
      row.method === "item/completed" && item(row)?.id === "exec-prepare-first",
  )!;
  (completedLate.params as { completedAtMs: number }).completedAtMs =
    Date.parse(at(99));
  await reject(late);
  const reordered = structuredClone(ui);
  const first = reordered.findIndex(
    (row) =>
      row.method === "item/started" && item(row)?.id === "exec-prepare-first",
  );
  const last = reordered.findIndex(
    (row) =>
      row.method === "item/completed" && item(row)?.id === "exec-prepare-first",
  );
  [reordered[first], reordered[last]] = [reordered[last]!, reordered[first]!];
  await reject(reordered);
  const wrongStart = structuredClone(ui);
  item(
    wrongStart.find(
      (row) =>
        row.method === "item/started" && item(row)?.id === "exec-prepare-first",
    )!,
  )!.processId = "different-process";
  await reject(wrongStart);
  const duplicateItem = structuredClone(completed);
  item(duplicateItem)!.processId = "unrelated-process";
  item(duplicateItem)!.command = "/bin/zsh -lc 'node -e 0'";
  await reject([...structuredClone(ui), duplicateItem]);
  const contradicted = structuredClone(ui);
  for (const row of contradicted) {
    const params = row.params as Record<string, unknown>;
    if (params.itemId === "exec-prepare-first")
      params.delta = String(params.delta).replace(
        '"storyId":"story"',
        '"storyId":"different-story"',
      );
    if (
      row.method === "item/completed" &&
      item(row)?.id === "exec-prepare-first"
    )
      item(row)!.aggregatedOutput = String(item(row)!.aggregatedOutput).replace(
        '"storyId":"story"',
        '"storyId":"different-story"',
      );
  }
  await reject(contradicted);
});

test("public results retain command origins through native process and code cell chains", async (context) => {
  const { input, rows } = await fixture(context);
  deferResult(rows, "create", 90978);
  deferResult(rows, "prepare-first", 17172, { direct: true });
  deferResult(rows, "inspect-second", 93487, { launchCell: "66" });
  deferResult(rows, "prepare-second", 23481, {
    launchCell: "67",
    waitCell: "68",
  });
  const complete = { ...input, transcript: text(rows) };
  const attempts = auditProductionAttempts(
    nativeTrace("codex", complete.transcript),
  )!;
  assert.equal(attempts.length, 2);
  assert.equal(attempts[1]!.preparation.callId, "prepare-second-wait-cell");
  assert.equal(attempts[1]!.preparation.timestamp, Date.parse(at(115.6)));
  assert.equal(
    attempts[1]!.preparation.index,
    rows.findIndex(
      (row) =>
        row.payload.call_id === "prepare-second-wait-cell" &&
        row.payload.output !== undefined,
    ),
  );
  assert.equal(
    (await auditNativeExecution(complete)).execution.attempts!.length,
    2,
  );
  assert.equal(auditSupervision(complete).continuationCalls, 2);
});

test("self-draining code-mode calls bind only waits on their own literal command result", async (context) => {
  const { input, rows } = await fixture(context);
  const call = rows.find(
    (row) =>
      row.payload.call_id === "prepare-first" &&
      row.payload.output === undefined,
  )!;
  const output = rows.find(
    (row) =>
      row.payload.call_id === "prepare-first" &&
      row.payload.output !== undefined,
  )!;
  const prepared = String(output.payload.output);
  const source = `let r = await tools.exec_command({cmd:"npm run project:produce:prepare -- --project story"});
text(r);
while (r.session_id !== undefined) {
  r = await tools.write_stdin({session_id:r.session_id, chars:"", yield_time_ms:60000});
  text(r);
}`;
  call.payload.input = source;
  output.payload.output = [
    {
      type: "input_text",
      text: "Script completed\nWall time 60 seconds\nOutput:\n",
    },
    {
      type: "input_text",
      text: JSON.stringify({ session_id: 445, output: "" }),
    },
    {
      type: "input_text",
      text: JSON.stringify({ exit_code: 0, output: prepared }),
    },
  ];
  const complete = { ...input, transcript: text(rows) };
  assert.equal(
    (await auditNativeExecution(complete)).execution.attempts!.length,
    2,
  );
  assert.equal(auditSupervision(complete).continuationCalls, 2);
  for (const invalid of [
    source.replace("session_id:r.session_id", "session_id:another.session_id"),
    source.replace('chars:""', 'chars:"x"'),
    source.replace(
      "r = await tools.write_stdin",
      "another = await tools.write_stdin",
    ),
    source.replace("text(r);\nwhile", "r = another;\ntext(r);\nwhile"),
    source.replace(
      "r.session_id !== undefined",
      "another.session_id !== undefined",
    ),
    source.replace(
      "session_id:r.session_id",
      "session_id:r.session_id,session_id:another.session_id",
    ),
    source.replace('chars:""', 'chars:"x",chars:""'),
    source.replace("yield_time_ms:60000", "...options"),
    source.replace("tools.write_stdin", "another.write_stdin"),
    source.replace("tools.exec_command", "another.exec_command"),
    `const tools = another;\n${source}`,
    `const text = value => {value.session_id = 999;};\n${source}`,
    `const undefined = 999;\n${source}`,
    source.replace(
      'cmd:"npm run project:produce:prepare -- --project story"',
      'cmd:"npm run project:produce:prepare -- --project story",...options',
    ),
    source.replace(
      'cmd:"npm run project:produce:prepare -- --project story"',
      'cmd:"npm run project:produce:prepare -- --project story",cmd:"other"',
    ),
    source.replace("session_id:r.session_id", '["session_id"]:r.session_id'),
    source.replace(
      "session_id:r.session_id",
      'session_id:r.session_id,"session_\\u0069d":999',
    ),
  ]) {
    const changed = structuredClone(rows);
    changed.find(
      (row) =>
        row.payload.call_id === "prepare-first" &&
        row.payload.output === undefined,
    )!.payload.input = invalid;
    assert.throws(() =>
      auditProductionAttempts(nativeTrace("codex", text(changed))),
    );
  }
  const crossed = structuredClone(rows);
  const blocks = crossed.find(
    (row) =>
      row.payload.call_id === "prepare-first" &&
      row.payload.output !== undefined,
  )!.payload.output as Array<{ text: string }>;
  blocks.splice(2, 0, {
    text: JSON.stringify({ session_id: 999, output: "" }),
  });
  assert.throws(() =>
    auditProductionAttempts(nativeTrace("codex", text(crossed))),
  );
  const afterExit = structuredClone(rows);
  (
    afterExit.find(
      (row) =>
        row.payload.call_id === "prepare-first" &&
        row.payload.output !== undefined,
    )!.payload.output as Array<{ text: string }>
  ).reverse();
  assert.throws(() =>
    auditProductionAttempts(nativeTrace("codex", text(afterExit))),
  );
  output.payload.output = [
    {
      type: "input_text",
      text: "Script running with cell ID self-drain\nWall time 30 seconds\nOutput:\n",
    },
    {
      type: "input_text",
      text: JSON.stringify({ session_id: 445, output: "" }),
    },
  ];
  rows.push(
    ...nativeTool(
      "prepare-self-drain-cell",
      10.5,
      "functions.wait",
      { cell_id: "self-drain", yield_time_ms: 60000 },
      [
        {
          type: "input_text",
          text: "Script completed\nWall time 30 seconds\nOutput:\n",
        },
        {
          type: "input_text",
          text: JSON.stringify({ exit_code: 0, output: prepared }),
        },
      ],
    ),
  );
  rows.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  assert.equal(
    (await auditNativeExecution({ ...input, transcript: text(rows) })).execution
      .attempts!.length,
    2,
  );
  assert.equal(
    auditSupervision({ ...input, transcript: text(rows) }).continuationCalls,
    2,
  );
});

test("a literal read-only wait drain retains its known origin even when its loop does not execute", async (context) => {
  const { rows } = await fixture(context);
  const call = rows.find(
    (row) =>
      row.payload.call_id === "fixed-first" && row.payload.output === undefined,
  )!;
  const result = rows.find(
    (row) =>
      row.payload.call_id === "fixed-first" && row.payload.output !== undefined,
  )!;
  const wrapper = JSON.parse(String(result.payload.output));
  const source = `let r=await tools.write_stdin({session_id:101,chars:"",yield_time_ms:60000});text(r);store("terminal",r);while(r.session_id!==undefined){r=await tools.write_stdin({session_id:r.session_id,chars:"",yield_time_ms:60000});text(r);store("terminal",r);}if(r.exit_code!==0)throw new Error("Continuation failed");`;
  call.payload.input = source;
  result.payload.output = [
    { type: "input_text", text: "Script completed\nOutput:\n" },
    { type: "input_text", text: JSON.stringify(wrapper) },
  ];
  const audit = (records = rows) =>
    auditProductionAttempts(nativeTrace("codex", text(records)));
  assert.equal(audit()!.length, 2);
  const pending = structuredClone(rows);
  (
    pending.find(
      (row) =>
        row.payload.call_id === "fixed-first" &&
        row.payload.output !== undefined,
    )!.payload.output as Array<unknown>
  ).splice(1, 0, {
    type: "input_text",
    text: JSON.stringify({ session_id: 101, output: "" }),
  });
  assert.equal(audit(pending)!.length, 2);
  for (const invalid of [
    source.replace("session_id:101", "session_id:999"),
    source.replace("session_id:101", 'session_id:load("handle")'),
    source.replace('chars:""', 'chars:"input"'),
    source.replace("session_id:r.session_id", "session_id:999"),
    source.replace("text(r);store", "r.session_id=999;text(r);store"),
    source.replace("text(r);store", 'r.output="forged";text(r);store'),
    source.replace("text(r);store", "const alias=r;text(r);store"),
    source.replace("tools.write_stdin", "alias.write_stdin"),
    `const tools=load("alias");${source}`,
    `const text=load("alias");${source}`,
    source.replace(
      'if(r.exit_code!==0)throw new Error("Continuation failed")',
      'if(true)eval("hidden mutation")',
    ),
    source.replace(
      "while(r.session_id!==undefined)",
      "while(other.session_id!==undefined)",
    ),
  ]) {
    const changed = structuredClone(rows);
    changed.find(
      (row) =>
        row.payload.call_id === "fixed-first" &&
        row.payload.output === undefined,
    )!.payload.input = invalid;
    assert.throws(() => audit(changed), invalid);
  }
  assert.throws(
    () => audit(removeCall(rows, "continue-first")),
    /original process handle/u,
  );
  for (const change of [
    (value: Record<string, unknown>) => {
      value.session_id = 101;
    },
    (value: Record<string, unknown>) => {
      delete value.exit_code;
      value.session_id = 999;
    },
  ]) {
    const changed = structuredClone(rows);
    const value = structuredClone(wrapper);
    change(value);
    (
      changed.find(
        (row) =>
          row.payload.call_id === "fixed-first" &&
          row.payload.output !== undefined,
      )!.payload.output as Array<{ text: string }>
    )[1]!.text = JSON.stringify(value);
    assert.throws(() => audit(changed));
  }
});

test("an uncollected read-only wait cell retains the known process but cannot establish a new process origin", async (context) => {
  const { input, rows } = await fixture(context);
  const waiting = processWait("interim-read-only-wait", 25, 101, {});
  waiting[1]!.payload.output =
    "Script running with cell ID 24\nWall time 31 seconds\nOutput:\n";
  rows.push(...waiting);
  rows.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const complete = { ...input, transcript: text(rows) };
  assert.equal(
    (await auditNativeExecution(complete)).execution.attempts!.length,
    2,
  );
  assert.equal(auditSupervision(complete).continuationCalls, 2);
  deferResult(rows, "create", 90978, { launchCell: "7" });
  const missingOrigin = {
    ...input,
    transcript: text(removeCall(rows, "create-cell")),
  };
  await assert.rejects(
    () => auditNativeExecution(missingOrigin),
    /original process handle/u,
  );
  assert.throws(
    () => auditSupervision(missingOrigin),
    /original process handle/u,
  );
});

test("unknown, crossed, stale, and unfinished native handles cannot authenticate an attempt", async (context) => {
  const { input, rows } = await fixture(context);
  deferResult(rows, "create", 90978);
  deferResult(rows, "prepare-second", 23481, {
    launchCell: "67",
    waitCell: "68",
  });
  const reject = (changed: Row[]) => {
    const transcript = text(changed);
    assert.throws(() =>
      auditProductionAttempts(nativeTrace("codex", transcript)),
    );
    assert.throws(() => auditSupervision({ ...input, transcript }));
  };
  for (const [callId, source, target] of [
    ["prepare-second-cell", "67", "999"],
    ["prepare-second-process", "23481", "99999"],
    ["prepare-second-process", "23481", "90978"],
    ["fixed-second", "102", "101"],
  ]) {
    const changed = structuredClone(rows);
    const call = changed.find(
      (row) =>
        row.payload.call_id === callId && row.payload.output === undefined,
    )!;
    const field = call.payload.arguments === undefined ? "input" : "arguments";
    call.payload[field] = String(call.payload[field]).replace(source!, target!);
    reject(changed);
  }
  const unfinished = structuredClone(rows);
  const returned = unfinished.find(
    (row) =>
      row.payload.call_id === "prepare-second-wait-cell" &&
      row.payload.output !== undefined,
  )!;
  const blocks = returned.payload.output as Array<{ text: string }>;
  const wrapper = JSON.parse(blocks[1]!.text);
  delete wrapper.exit_code;
  wrapper.session_id = 23481;
  blocks[1]!.text = JSON.stringify(wrapper);
  reject(unfinished);
  const missing = text(removeCall(rows, "prepare-second-wait-cell"));
  await assert.rejects(() =>
    auditNativeExecution({ ...input, transcript: missing }),
  );
  assert.throws(() => auditSupervision({ ...input, transcript: missing }));
  const wrongFixed = structuredClone(rows);
  const fixed = wrongFixed.find(
    (row) =>
      row.payload.call_id === "fixed-second" &&
      row.payload.output === undefined,
  )!;
  fixed.payload.input =
    "text(await tools.exec_command({cmd:\"node -e 'process.exit(0)'\"}));";
  reject(wrongFixed);
});

test("one ordinary prompt may complete a sparse public revision after full four-way fresh production", async (context) => {
  const { input, rows, prompt } = await fixture(context);
  const native = (await auditNativeExecution(input)).execution;
  const supervision = auditSupervision({
    host: "codex",
    transcript: input.transcript,
  });
  assertFourWayExecution(native);
  assert.equal(native.dirtyTaskCount, 6);
  assert.equal(native.productionChildCount, 6);
  assert.equal(native.probeChildCount, 2);
  const attempts = (native as Record<string, unknown>).attempts as Array<
    Record<string, unknown>
  >;
  assert.deepEqual(
    attempts.map((attempt) => [attempt.attemptId, attempt.dirtyTaskCount]),
    [
      ["attempt-one", 5],
      ["attempt-two", 1],
    ],
  );
  assert.equal(attempts[0]!.peakBoundTasks, 4);
  assert.ok(Number(attempts[0]!.fourWayBoundOverlapMs) > 0);
  assert.equal(attempts[1]!.peakBoundTasks, 1);
  assert.equal(supervision.continuationCalls, 2);
  assert.equal(
    auditTranscript("codex", text(rows), prompt, "parent", input.workspace)
      .businessUserMessages,
    1,
  );
});

test("the complete trace supports two public revisions and enforces the later resolved capacity", async (context) => {
  const { input, rows } = await fixture(context);
  const continuation =
    "npm run project:produce:continue -- --project story --revision revision-three --attempt attempt-three --candidate candidate-three";
  rows.push(
    ...tool(
      "context-third",
      150,
      {
        status: "project-revision-context",
        storyId: "story",
        baseRevisionId: "revision-two",
        baseDeliveryBuildId: "delivery-two",
      },
      "npm run project:revise:context -- --project story",
    ),
    ...tool(
      "valid-third",
      151,
      {
        status: "project-revision-valid",
        storyId: "story",
        candidateId: "candidate-three",
        baseRevisionId: "revision-two",
        baseDeliveryBuildId: "delivery-two",
      },
      "npm run project:revise:validate -- --input third.json",
    ),
    ...tool(
      "created-third",
      152,
      {
        status: "project-revision-candidate-created",
        storyId: "story",
        candidateId: "candidate-three",
        baseRevisionId: "revision-two",
        baseDeliveryBuildId: "delivery-two",
      },
      "npm run project:revise -- --input third.json",
    ),
    ...tool(
      "resolve-third",
      155,
      resolution,
      "npm run project:execution:resolve -- --runtime-capacity 4",
    ),
    ...tool(
      "inspect-third",
      156,
      {
        contractVersion: "production-inspection-v1",
        storyId: "story",
        currentRevisionId: "revision-three",
      },
      "npm run project:produce:inspect -- --project story --candidate candidate-three",
    ),
    say(157, "新候选就绪，预计两个重做任务，其余制品复用。"),
    ...tool(
      "prepare-third",
      160,
      {
        status: "project-production-prepared",
        storyId: "story",
        attemptId: "attempt-three",
        revisionId: "revision-three",
        dirtyAgentTasks: [
          { taskRevision: "third-scene" },
          { taskRevision: "third-cover" },
        ],
        continuationCommand: continuation,
      },
      "npm run project:produce:prepare -- --project story --candidate candidate-three",
    ),
    ...tool(
      "continue-third",
      166,
      { session_id: 103, output: "" },
      continuation,
    ),
    ...processWait("fixed-third", 190, 103, {
      status: "project-revision-complete",
      storyId: "story",
      candidateId: "candidate-three",
      base: { revisionId: "revision-two", deliveryBuildId: "delivery-two" },
      expected: {
        revisionId: "revision-three",
        deliveryBuildId: "delivery-three",
      },
      production: {
        status: "project-production-complete",
        attemptId: "attempt-three",
        state: "succeeded",
        deliveryStatus: "verified",
        revisionId: "revision-three",
        deliveryBuildId: "delivery-three",
      },
      promotion: { status: "project-revision-promoted" },
    }),
    say(195, "三轮的最后四文件已经验证完成。"),
  );
  for (const [index, taskRevision] of [
    "third-scene",
    "third-cover",
  ].entries()) {
    const id = `child-${index + 8}`;
    rows.push(
      ...tool(`spawn-third-${index}`, 165, { task_name: `/root/${id}` }),
    );
    const child: Row[] = [
      {
        type: "session_meta",
        timestamp: at(165),
        payload: {
          id,
          cwd: input.workspace,
          source: {
            subagent: {
              thread_spawn: {
                parent_thread_id: "parent",
                depth: 1,
                agent_path: `/root/${id}`,
              },
            },
          },
        },
      },
      ...tool(
        `bind-third-${index}`,
        166,
        {
          status: "task-worker-bound",
          storyId: "story",
          attemptId: "attempt-three",
          taskRevision,
          transport: "shared-workspace",
        },
        "npm run project:task:bind -- --assignment 1",
      ),
      ...tool(
        `commit-third-${index}`,
        184,
        {
          status: "producer-artifact-committed",
          attemptRecorded: true,
          artifact: { taskRevision },
        },
        "npm run project:task:commit -- --assignment 1",
      ),
      {
        type: "event_msg",
        timestamp: at(185),
        payload: { type: "task_complete" },
      },
    ];
    const transcriptFile = join(input.workspace, `${id}.jsonl`);
    await writeFile(transcriptFile, text(child));
    input.nativeChildren.push({ transcriptFile });
  }
  rows.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const complete = { ...input, transcript: text(rows), endedAt: at(200) };
  const native = (await auditNativeExecution(complete)).execution;
  assert.equal(native.attempts!.length, 3);
  assert.equal(native.dirtyTaskCount, 8);
  assert.equal(native.attempts!.at(-1)!.deliveryBuildId, "delivery-three");
  assert.equal(
    auditSupervision({ host: "codex", transcript: complete.transcript })
      .continuationCalls,
    3,
  );
  const reduced = structuredClone(rows);
  changeResult(reduced, "resolve-third", (value) => {
    value.effectiveMaxConcurrency = 1;
  });
  await assert.rejects(
    () => auditNativeExecution({ ...complete, transcript: text(reduced) }),
    /attempt capacity/u,
  );
  const delegatedCommit = [
    ...rows,
    ...tool(
      "root-commit",
      196,
      {
        status: "producer-artifact-current",
        artifact: { taskRevision: "third-cover" },
        attemptRecorded: true,
      },
      "npm run project:task:commit -- --assignment 1",
    ),
  ];
  await assert.rejects(
    () =>
      auditNativeExecution({ ...complete, transcript: text(delegatedCommit) }),
    /Root must not commit/u,
  );
});

test("every public revision attempt must have exactly one continuation and a verified promoted tuple", async (context) => {
  const { input, rows } = await fixture(context);
  for (const mutate of [
    (copy: Row[]) => {
      copy.splice(
        copy.length - 1,
        0,
        ...tool(
          "duplicate",
          147,
          { status: "started" },
          "npm run project:produce:continue -- --project story --revision revision-two --attempt attempt-two --candidate candidate-two",
        ),
      );
    },
    (copy: Row[]) => {
      copy.splice(0, copy.length, ...removeCall(copy, "continue-second"));
    },
    (copy: Row[]) => {
      copy.splice(0, copy.length, ...removeCall(copy, "fixed-second"));
    },
    (copy: Row[]) => {
      changeResult(copy, "fixed-second", (value) => {
        (value.expected as Record<string, unknown>).deliveryBuildId =
          "wrong-delivery";
      });
    },
    (copy: Row[]) => {
      changeResult(copy, "revision-created", (value) => {
        value.baseDeliveryBuildId = "wrong-base";
      });
    },
    (copy: Row[]) => {
      copy.splice(0, copy.length, ...removeCall(copy, "resolve-second"));
    },
    (copy: Row[]) => {
      copy.splice(0, copy.length, ...removeCall(copy, "revision-valid"));
    },
  ]) {
    const copy = structuredClone(rows);
    mutate(copy);
    const transcript = text(copy);
    await assert.rejects(() => auditNativeExecution({ ...input, transcript }));
    assert.throws(() => auditSupervision({ host: "codex", transcript }));
  }
});

test("native completed failures and read-only authoring self-correction remain in the complete evidence", async (context) => {
  const { input, rows } = await fixture(context);
  const firstCreate = rows.findIndex((row) => row.payload.call_id === "create");
  rows.splice(
    firstCreate,
    0,
    ...tool(
      "invalid-create",
      0,
      {
        exit_code: 2,
        output: JSON.stringify({
          status: "error",
          code: "schema-validation-failed",
        }),
      },
      "npm run project:create -- --project story --input incomplete.json",
    ),
  );
  rows.push(
    ...tool(
      "sandbox-prepare",
      8,
      {
        exit_code: 1,
        output: "Operation not permitted; process exited before preparation.",
      },
      "npm run project:produce:prepare -- --project story",
    ),
    ...tool(
      "context-read-again",
      101,
      {
        status: "project-revision-context",
        storyId: "story",
        baseRevisionId: "revision-one",
        baseDeliveryBuildId: "delivery-one",
      },
      "npm run project:revise:context -- --project story",
    ),
    ...tool(
      "unused-validation",
      102,
      {
        status: "project-revision-valid",
        storyId: "story",
        candidateId: "unused-candidate",
        baseRevisionId: "revision-one",
        baseDeliveryBuildId: "delivery-one",
      },
      "npm run project:revise:validate -- --input unused.json",
    ),
    ...tool(
      "candidate-idempotent",
      108,
      {
        status: "project-revision-candidate-current",
        storyId: "story",
        candidateId: "candidate-two",
        baseRevisionId: "revision-one",
        baseDeliveryBuildId: "delivery-one",
      },
      "npm run project:revise -- --input revision.json",
    ),
    ...tool(
      "inspect-read-again",
      111.5,
      { contractVersion: "production-inspection-v1", storyId: "story" },
      "npm run project:produce:inspect -- --project story --candidate candidate-two",
    ),
    ...tool(
      "candidate-prepare-permission",
      114,
      {
        exit_code: 1,
        output: "Native process exited without creating an attempt.",
      },
      "npm run project:produce:prepare -- --project story --candidate candidate-two",
    ),
  );
  rows.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const complete = { ...input, transcript: text(rows) };
  assert.equal(
    (await auditNativeExecution(complete)).execution.attempts!.length,
    2,
  );
  assert.equal(
    auditSupervision({ host: "codex", transcript: complete.transcript })
      .continuationCalls,
    2,
  );
  const unfinished = structuredClone(rows);
  changeResult(unfinished, "sandbox-prepare", (value) => {
    delete value.exit_code;
    value.session_id = 123;
  });
  await assert.rejects(
    () => auditNativeExecution({ ...input, transcript: text(unfinished) }),
    /explicit completed native failure/u,
  );
  assert.throws(
    () => auditSupervision({ host: "codex", transcript: text(unfinished) }),
    /explicit completed native failure/u,
  );
  const hiddenAttempt = structuredClone(rows);
  changeResult(hiddenAttempt, "candidate-prepare-permission", (value) => {
    value.output = JSON.stringify({
      status: "project-production-prepared",
      storyId: "story",
      attemptId: "uncontinued-attempt",
      revisionId: "revision-two",
      dirtyAgentTasks: [],
      continuationCommand:
        "npm run project:produce:continue -- --project story --revision revision-two --attempt uncontinued-attempt --candidate candidate-two",
    });
  });
  await assert.rejects(
    () => auditNativeExecution({ ...input, transcript: text(hiddenAttempt) }),
    /exactly once/u,
  );
});

test("revision children retain fresh ownership, complete exports, capacity and native probe lineage", async (context) => {
  const { input } = await fixture(context);
  const revisionPath = input.nativeChildren.at(-1)!.transcriptFile;
  const original = await readFile(revisionPath, "utf8");
  for (const mutate of [
    (rows: Row[]) => {
      changeResult(rows, "child-bind-7", (value) => {
        value.attemptId = "attempt-one";
      });
    },
    (rows: Row[]) => {
      rows.splice(0, rows.length, ...removeCall(rows, "child-commit-7"));
    },
    (rows: Row[]) => {
      rows.push(
        ...tool(
          "second-bind",
          139,
          {
            status: "task-worker-bound",
            storyId: "story",
            attemptId: "attempt-one",
            taskRevision: "revised-cover",
            transport: "shared-workspace",
          },
          "npm run project:task:bind -- --assignment 1",
        ),
      );
    },
    (rows: Row[]) => {
      rows.splice(
        0,
        rows.length,
        ...rows.filter((row) => row.type !== "event_msg"),
      );
    },
    (rows: Row[]) => {
      rows[0]!.payload.id = "child-1";
    },
  ]) {
    const rows: Row[] = original.split("\n").map((line) => JSON.parse(line));
    mutate(rows);
    await writeFile(revisionPath, text(rows));
    await assert.rejects(() => auditNativeExecution(input));
  }
  await writeFile(revisionPath, original);
  await assert.rejects(
    () =>
      auditNativeExecution({
        ...input,
        nativeChildren: input.nativeChildren.slice(0, -1),
      }),
    /Export every native child/u,
  );
  const probePath = input.nativeChildren[6]!.transcriptFile;
  const originalProbe = await readFile(probePath, "utf8");
  const probe: Row[] = originalProbe
    .split("\n")
    .map((line) => JSON.parse(line));
  await writeFile(
    probePath,
    text([
      ...probe,
      ...tool(
        "probe-commit",
        106,
        {
          status: "producer-artifact-current",
          artifact: { taskRevision: "revised-cover" },
          attemptRecorded: true,
        },
        "npm run project:task:commit -- --assignment 1",
      ),
    ]),
  );
  await assert.rejects(
    () => auditNativeExecution(input),
    /probe cannot commit/u,
  );
  const spawn = (
    (probe[0]!.payload.source as Record<string, unknown>).subagent as Record<
      string,
      unknown
    >
  ).thread_spawn as Record<string, unknown>;
  spawn.parent_thread_id = "unknown-parent";
  await writeFile(probePath, text(probe));
  await assert.rejects(
    () => auditNativeExecution(input),
    /native direct descendant/u,
  );
});

test("revision evidence cannot hide initial four-way failures or manufacture capacity from another round", async (context) => {
  const { input, rows } = await fixture(context);
  const reduced = structuredClone(rows);
  changeResult(reduced, "resolve-first", (value) => {
    value.effectiveMaxConcurrency = 3;
  });
  await assert.rejects(
    () => auditNativeExecution({ ...input, transcript: text(reduced) }),
    /capacity/u,
  );
  const originals = await Promise.all(
    input.nativeChildren
      .slice(1, 5)
      .map(({ transcriptFile }) => readFile(transcriptFile, "utf8")),
  );
  for (const [index, original] of originals.entries()) {
    const serialBound: Row[] = original
      .split("\n")
      .map((line) => JSON.parse(line));
    serialBound[1]!.timestamp = serialBound[2]!.timestamp =
      serialBound[3]!.timestamp;
    await writeFile(
      input.nativeChildren[index + 1]!.transcriptFile,
      text(serialBound),
    );
  }
  await assert.rejects(() => auditNativeExecution(input), /four-way/u);
  await Promise.all(
    originals.map((original, index) =>
      writeFile(input.nativeChildren[index + 1]!.transcriptFile, original),
    ),
  );
  const path = input.nativeChildren[5]!.transcriptFile;
  const child: Row[] = (await readFile(path, "utf8"))
    .split("\n")
    .map((line) => JSON.parse(line));
  child[0]!.timestamp = at(25);
  child[1]!.timestamp = at(26);
  child[2]!.timestamp = at(26);
  await writeFile(path, text(child));
  await assert.rejects(() => auditNativeExecution(input), /capacity/u);
});

test("multi-attempt supervision still requires each inspect report, exact candidate continuation, and the last final report", async (context) => {
  const { rows } = await fixture(context);
  for (const mutate of [
    (copy: Row[]) => {
      copy.splice(
        0,
        copy.length,
        ...copy.filter((row) => row.timestamp !== at(112)),
      );
    },
    (copy: Row[]) => {
      const call = copy.find(
        (row) => row.payload.call_id === "continue-second" && row.payload.input,
      )!;
      call.payload.input = String(call.payload.input).replace(
        "candidate-two",
        "other-candidate",
      );
    },
    (copy: Row[]) => {
      copy.splice(
        0,
        copy.length,
        ...copy.filter((row) => row.timestamp !== at(149)),
      );
    },
  ]) {
    const copy = structuredClone(rows);
    mutate(copy);
    assert.throws(() =>
      auditSupervision({ host: "codex", transcript: text(copy) }),
    );
  }
});

test("a revision never exempts an additional ordinary user prompt", async (context) => {
  const { input, rows, prompt } = await fixture(context);
  rows.push({
    type: "response_item",
    timestamp: at(148),
    payload: {
      role: "user",
      content: [{ type: "input_text", text: "改一下封面" }],
    },
  });
  assert.throws(
    () =>
      auditTranscript("codex", text(rows), prompt, "parent", input.workspace),
    /no follow-up/u,
  );
});

test("grouped receipts reject inconsistent totals and preserve historical single-attempt parsing", async (context) => {
  const { input } = await fixture(context);
  const native = (await auditNativeExecution(input)).execution;
  const supervision = auditSupervision({
    host: "codex",
    transcript: input.transcript,
  });
  for (const patch of [
    { dirtyTaskCount: 5 },
    { productionChildCount: 5 },
    { probeChildCount: 1 },
    { attemptId: "attempt-two" },
  ])
    assert.equal(
      NativeExecutionSchema.safeParse({ ...native, ...patch }).success,
      false,
    );
  assert.equal(
    SupervisionSchema.safeParse({ ...supervision, continuationCalls: 1 })
      .success,
    false,
  );
  const historical = { ...native } as Record<string, unknown>;
  delete historical.attempts;
  historical.dirtyTaskCount = historical.productionChildCount = 5;
  historical.probeChildCount = 1;
  historical.childEvidence = (historical.childEvidence as unknown[])
    .slice(0, 6)
    .map((child) => {
      const value = { ...(child as Record<string, unknown>) };
      delete value.attemptId;
      return value;
    });
  assert.equal(NativeExecutionSchema.safeParse(historical).success, true);
  assert.equal(
    SupervisionSchema.safeParse({
      ...supervision,
      attempts: undefined,
      continuationCalls: 1,
    }).success,
    true,
  );
});

test("release receipts bind grouped execution and supervision to the final four-file delivery", async (context) => {
  const { input, prompt } = await fixture(context);
  const nativeExecution = (await auditNativeExecution(input)).execution;
  const supervision = auditSupervision({
    host: "codex",
    transcript: input.transcript,
  });
  const publishTuple = {
    storyId: StoryIdSchema.parse("story"),
    revisionId: ProductionRevisionIdSchema.parse(`revision-${"b".repeat(64)}`),
    deliveryBuildId: DeliveryBuildIdSchema.parse(`delivery-${"b".repeat(64)}`),
  };
  const deliveryExecution = structuredClone(nativeExecution);
  Object.assign(deliveryExecution.attempts!.at(-1)!, publishTuple);
  assert.doesNotThrow(() =>
    assertFinalAttemptDelivery(deliveryExecution, publishTuple),
  );
  for (const patch of [
    {
      revisionId: ProductionRevisionIdSchema.parse(
        `revision-${"a".repeat(64)}`,
      ),
    },
    {
      deliveryBuildId: DeliveryBuildIdSchema.parse(
        `delivery-${"a".repeat(64)}`,
      ),
    },
    { storyId: StoryIdSchema.parse("other-story") },
  ])
    assert.throws(
      () =>
        assertFinalAttemptDelivery(deliveryExecution, {
          ...publishTuple,
          ...patch,
        }),
      /Revision\/Delivery tuple/u,
    );
  assert.doesNotThrow(() =>
    assertFinalAttemptDelivery(undefined, publishTuple),
  );
  const checksum = sha256("synthetic evidence");
  const files = [{ path: "index.js", checksum, executable: false }];
  const runtime: PackageContent = {
    name: "@axmorf/studio",
    version: "0.1.16",
    fingerprint: fingerprint(files),
    files,
  };
  const creator = { ...runtime, name: "create-axmorf-studio" };
  const summary = ({ files, ...value }: PackageContent) => ({
    ...value,
    fileCount: files.length,
  });
  const host = {
    schemaVersion: 1,
    host: "codex",
    model: "test-model",
    sessionId: "parent",
    environment: { platform: "darwin", arch: "arm64", node: "v22.22.3" },
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    packages: { runtime: summary(runtime), creator: summary(creator) },
    prompt,
    promptChecksum: sha256(prompt),
    transcriptChecksum: checksum,
    runChecksum: checksum,
    snapshotChecksum: checksum,
    sessionChecksum: null,
    creation: {
      method: "npm-exec-candidate",
      runtimeTarballChecksum: checksum,
      creatorTarballChecksum: checksum,
      installLogChecksum: checksum,
    },
    transcriptAudit: {
      businessUserMessages: 1,
      toolCalls: 30,
      followUpMessages: 0,
    },
    unchangedPackageFiles: 1,
    unchangedGuideFiles: 8,
    nativeExecution,
    supervision,
    finalCheck: {
      status: "project-final-check",
      storyId: "story",
      aggregateStatus: "pass",
      deliveryBuildId: "delivery-two",
      checks: [
        "artifacts",
        "delivery",
        "revision",
        "artifact-set",
        "delivery-build",
        "audio-channels",
        "snapshot",
      ].map((checkId) => ({ checkId, status: "pass" })),
    },
    delivery: {
      storyId: "story",
      deliveryBuildId: "delivery-two",
      files: Object.fromEntries(
        ["video.mp4", "cover-4x3.png", "cover-3x4.png", "publish.json"].map(
          (name) => [name, { checksum, sizeBytes: 128 }],
        ),
      ),
      video: {
        codec: "h264",
        audioCodec: "aac",
        audioChannels: 2,
        width: 1920,
        height: 1080,
        fps: 30,
        frameCount: 300,
      },
      decodedFiles: ["video.mp4", "cover-4x3.png", "cover-3x4.png"],
    },
  };
  const verify = (value = host) =>
    verifyReceipt({ schemaVersion: 1, hosts: [value] }, runtime, creator);
  assert.equal(HostReceiptSchema.safeParse(host).success, true);
  assert.equal(verify().status, "first-use-release-gate-passed");
  for (const mutate of [
    (copy: typeof host) => {
      copy.delivery.deliveryBuildId = copy.finalCheck.deliveryBuildId =
        "delivery-one";
    },
    (copy: typeof host) => {
      copy.supervision.attempts![1]!.deliveryBuildId = "other-delivery";
    },
    (copy: typeof host) => {
      delete copy.supervision.attempts;
    },
    (copy: typeof host) => {
      copy.nativeExecution.attempts![1]!.base!.deliveryBuildId = "stale-base";
    },
    (copy: typeof host) => {
      delete copy.delivery.files["video.mp4"];
    },
  ]) {
    const copy = structuredClone(host);
    mutate(copy);
    assert.throws(() => verify(copy));
  }
});
