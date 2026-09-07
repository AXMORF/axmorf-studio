import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { sha256 } from "./package-content";

type Row = Record<string, unknown>;
const object = (value: unknown): Row =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
const time = (value: unknown) => {
  const result =
    typeof value === "number" ? value * 1000 : Date.parse(String(value));
  assert.ok(Number.isFinite(result), "Native evidence has no valid timestamp");
  return result;
};

// Native tools wrap command output in JSON, text blocks, and npm banner lines.
// Inspect only tool results; assistant prose is never production evidence.
export function outputObjects(value: unknown, depth = 0): Row[] {
  if (depth > 8) return [];
  if (Array.isArray(value))
    return value.flatMap((item) => outputObjects(item, depth + 1));
  if (typeof value === "object" && value !== null) {
    return [
      object(value),
      ...Object.values(value).flatMap((item) => outputObjects(item, depth + 1)),
    ];
  }
  if (typeof value !== "string") return [];
  try {
    return outputObjects(JSON.parse(value), depth + 1);
  } catch {
    /* npm banners are not JSON */
  }
  const found: Row[] = [];
  for (let start = 0; start < value.length; start += 1) {
    if (value[start] === '"') {
      let escaped = false;
      for (let end = start + 1; end < value.length; end += 1) {
        if (escaped) escaped = false;
        else if (value[end] === "\\") escaped = true;
        else if (value[end] === '"') {
          try {
            found.push(
              ...outputObjects(
                JSON.parse(value.slice(start, end + 1)),
                depth + 1,
              ),
            );
            start = end;
          } catch {
            /* Not a JSON string inside this host wrapper. */
          }
          break;
        }
      }
      continue;
    }
    if (value[start] !== "{" && value[start] !== "[") continue;
    const stack: string[] = [];
    let quoted = false;
    let escaped = false;
    for (let end = start; end < value.length; end += 1) {
      const character = value[end]!;
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') quoted = true;
      else if (character === "{" || character === "[") stack.push(character);
      else if (character === "}" || character === "]") {
        if (stack.pop() !== (character === "}" ? "{" : "[")) break;
        if (stack.length !== 0) continue;
        try {
          found.push(
            ...outputObjects(
              JSON.parse(value.slice(start, end + 1)),
              depth + 1,
            ),
          );
          start = end;
        } catch {
          // A host's non-JSON wrapper can contain valid nested JSON. Continue
          // searching its inner offsets without interpreting Python or shell.
        }
        break;
      }
    }
  }
  return found;
}

export function nativeTrace(host: "codex" | "hermes", text: string) {
  const records: Row[] =
    host === "codex"
      ? text
          .trim()
          .split("\n")
          .map((line) => object(JSON.parse(line)))
      : z.array(z.record(z.string(), z.unknown())).parse(JSON.parse(text));
  const calls = new Map<string, { name: string; arguments: string }>();
  const outputs: Array<{ name: string; timestamp: number; objects: Row[] }> =
    [];
  for (const record of records) {
    const payload = host === "codex" ? object(record.payload) : record;
    if (host === "codex" && record.type !== "response_item") continue;
    if (
      host === "hermes" &&
      payload.role === "assistant" &&
      payload.tool_calls
    ) {
      const raw =
        typeof payload.tool_calls === "string"
          ? JSON.parse(payload.tool_calls)
          : payload.tool_calls;
      for (const call of z
        .array(z.record(z.string(), z.unknown()))
        .parse(raw)) {
        const fn = object(call.function);
        calls.set(String(call.id), {
          name: String(fn.name),
          arguments: String(fn.arguments),
        });
      }
    } else if (
      ["function_call", "custom_tool_call"].includes(String(payload.type))
    ) {
      calls.set(String(payload.call_id), {
        name: String(payload.name),
        arguments: String(payload.arguments ?? payload.input ?? ""),
      });
    }
    if (
      payload.role === "tool" ||
      ["function_call_output", "custom_tool_call_output"].includes(
        String(payload.type),
      )
    ) {
      const call = calls.get(String(payload.tool_call_id ?? payload.call_id));
      assert.ok(call, "Native tool output is missing its originating call");
      outputs.push({
        name: call.name,
        timestamp: time(record.timestamp),
        objects: outputObjects(payload.output ?? payload.content),
      });
    }
  }
  return { records, calls, outputs };
}

const commandOutputs = (trace: ReturnType<typeof nativeTrace>) =>
  trace.outputs.filter(({ name }) =>
    /(?:^|[._])(?:exec|exec_command|execute_code|terminal|process|process_manage|wait|write_stdin)$/u.test(
      name,
    ),
  );
const committed = (value: Row) =>
  ["producer-artifact-committed", "producer-artifact-current"].includes(
    String(value.status),
  );

export const NativeExecutionSchema = z
  .object({
    mode: z.literal("subagents"),
    workerTransport: z.enum(["shared-workspace", "controller-io"]),
    modeSource: z.enum(["builtin-default", "settings"]),
    concurrencySource: z.enum(["builtin-default", "settings"]),
    requestedMaxConcurrency: z.literal(4),
    effectiveMaxConcurrency: z.number().int().min(1).max(4),
    peakActiveChildren: z.number().int().min(2).max(4),
    dirtyTaskCount: z.number().int().min(5),
    productionChildCount: z.number().int().min(5),
    probeChildCount: z.number().int().positive(),
    refillAdmissions: z.number().int().positive(),
    attemptId: z.string().min(1),
    childEvidence: z
      .array(
        z
          .object({
            sessionId: z.string().min(1),
            transcriptChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
            sessionChecksum: z
              .string()
              .regex(/^sha256:[a-f0-9]{64}$/u)
              .nullable(),
            taskRevision: z.string().nullable(),
          })
          .strict(),
      )
      .min(5),
    delegationChecksum: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/u)
      .nullable(),
    notificationFormatterChecksum: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/u)
      .nullable(),
  })
  .strict();

export const NativeChildInput = z
  .object({
    transcriptFile: z.string().min(1),
    sessionFile: z.string().min(1).optional(),
  })
  .strict();

export async function auditNativeExecution(input: {
  host: "codex" | "hermes";
  transcript: string;
  sessionId: string;
  workspace: string;
  startedAt: string;
  endedAt: string;
  storyId: string;
  nativeChildren: z.infer<typeof NativeChildInput>[];
  delegationFile?: string;
  hermesRuntimeRoot?: string;
}) {
  const root = nativeTrace(input.host, input.transcript);
  const outputs = commandOutputs(root).flatMap(({ objects, timestamp }) =>
    objects.map((value) => ({ value, timestamp })),
  );
  const resolves = outputs.filter(
    ({ value }) => value.status === "ready" && value.mode === "subagents",
  );
  assert.equal(
    resolves.length,
    1,
    "Expected one successful native subagents resolution",
  );
  const resolution = resolves[0]!.value;
  const sources = object(resolution.source);
  assert.ok(
    ["builtin-default", "settings"].includes(String(sources.mode)),
    "Mode must come from the package or saved settings",
  );
  assert.ok(
    ["builtin-default", "settings"].includes(String(sources.maxConcurrency)),
    "Concurrency must come from the package or saved settings",
  );
  assert.equal(resolution.requestedMaxConcurrency, 4);
  const capacity = z
    .number()
    .int()
    .min(1)
    .max(4)
    .parse(resolution.effectiveMaxConcurrency);
  assert.ok(
    ["shared-workspace", "controller-io"].includes(
      String(resolution.workerTransport),
    ),
  );
  const prepared = outputs.filter(
    ({ value }) => value.status === "project-production-prepared",
  );
  assert.equal(
    prepared.length,
    1,
    "Expected one production attempt in the fresh run",
  );
  const preparation = prepared[0]!;
  const tasks = z
    .array(z.object({ taskRevision: z.string().min(1) }).passthrough())
    .min(5)
    .parse(preparation.value.dirtyAgentTasks);
  assert.equal(preparation.value.storyId, input.storyId);
  const expected = tasks.map((task) => task.taskRevision).sort();
  assert.equal(new Set(expected).size, expected.length);
  assert.ok(
    !outputs.some(({ value }) => committed(value)),
    "Root must not commit child-owned artifacts",
  );
  const children = [];
  for (const paths of input.nativeChildren) {
    const transcript = await readFile(paths.transcriptFile, "utf8");
    const trace = nativeTrace(input.host, transcript);
    let id: string;
    let started: number;
    let ended: number;
    let sessionChecksum: string | null = null;
    if (input.host === "codex") {
      const metas = trace.records.filter(
        (record) => record.type === "session_meta",
      );
      assert.equal(metas.length, 1);
      const meta = object(metas[0]!.payload);
      id = z.string().min(1).parse(meta.id);
      const spawn = object(object(object(meta.source).subagent).thread_spawn);
      assert.equal(
        spawn.parent_thread_id,
        input.sessionId,
        "Codex child is not a native direct descendant",
      );
      assert.equal(spawn.depth, 1);
      const agentPath = z.string().min(1).parse(spawn.agent_path);
      assert.equal(meta.cwd, input.workspace);
      assert.ok(
        root.outputs.some(
          ({ name, objects }) =>
            /spawn_agent$/u.test(name) &&
            objects.some((value) => value.task_name === agentPath),
        ),
        "Codex child has no native spawn response",
      );
      started = time(metas[0]!.timestamp);
      const complete = trace.records.filter(
        (record) =>
          record.type === "event_msg" &&
          object(record.payload).type === "task_complete",
      );
      assert.ok(
        complete.length > 0,
        "Codex child has no native completion event",
      );
      ended = time(complete.at(-1)!.timestamp);
    } else {
      assert.ok(
        paths.sessionFile,
        "Hermes child requires its native session row",
      );
      const bytes = await readFile(paths.sessionFile);
      sessionChecksum = sha256(bytes);
      const session = z
        .object({
          id: z.string(),
          parent_session_id: z.string(),
          source: z.literal("subagent"),
          cwd: z.string().nullable(),
          started_at: z.number(),
          ended_at: z.number(),
          message_count: z.number(),
          tool_call_count: z.number(),
        })
        .passthrough()
        .parse(JSON.parse(bytes.toString("utf8")));
      id = session.id;
      assert.equal(
        session.parent_session_id,
        input.sessionId,
        "Hermes child is not a native direct descendant",
      );
      // Hermes records cwd only for source=cli; native subagent rows carry
      // parent_session_id/source instead. Task bindings below establish scope.
      if (session.cwd !== null) assert.equal(session.cwd, input.workspace);
      assert.equal(session.message_count, trace.records.length);
      assert.equal(session.tool_call_count, trace.calls.size);
      assert.ok(
        [...root.calls.values()].some((call) => call.name === "delegate_task"),
        "Hermes root did not invoke native delegation",
      );
      started = time(session.started_at);
      ended = time(session.ended_at);
    }
    assert.ok(
      started >= time(input.startedAt) &&
        ended <= time(input.endedAt) &&
        ended > started,
      "Child session falls outside the tested run",
    );
    const results = commandOutputs(trace).flatMap(({ objects }) => objects);
    const binds = results.filter(
      (value) => value.status === "task-worker-bound",
    );
    let taskRevision: string | null = null;
    if (binds.length === 0) {
      assert.ok(
        ended <= resolves[0]!.timestamp,
        "A child without task binding must complete its capability probe before successful resolution",
      );
      assert.ok(
        trace.calls.size > 0,
        "Probe child did not exercise a native tool",
      );
    } else {
      const bound = binds[0]!;
      taskRevision = z.string().parse(bound.taskRevision);
      assert.ok(
        binds.every((value) => value.taskRevision === taskRevision),
        "One child must own only one production task",
      );
      assert.equal(bound.attemptId, preparation.value.attemptId);
      assert.equal(bound.storyId, input.storyId);
      assert.equal(bound.transport, resolution.workerTransport);
      const commits = results.filter(committed);
      assert.ok(
        commits.length > 0,
        "Production child did not commit its artifact",
      );
      assert.ok(
        commits.every(
          (value) =>
            object(value.artifact).taskRevision === taskRevision &&
            value.attemptRecorded === true,
        ),
      );
      assert.ok(
        started >= preparation.timestamp,
        "Production child predates its prepared task",
      );
    }
    children.push({
      sessionId: id,
      transcriptChecksum: sha256(transcript),
      sessionChecksum,
      taskRevision,
      started,
      ended,
    });
  }
  assert.equal(
    new Set(children.map((child) => child.sessionId)).size,
    children.length,
    "Duplicate child evidence",
  );
  const spawnedCount =
    input.host === "codex"
      ? root.outputs
          .filter(({ name }) => /spawn_agent$/u.test(name))
          .flatMap(({ objects }) => objects)
          .filter((value) => typeof value.task_name === "string").length
      : [...root.calls.values()]
          .filter((call) => call.name === "delegate_task")
          .reduce((count, call) => {
            const args = object(JSON.parse(call.arguments));
            return count + (Array.isArray(args.tasks) ? args.tasks.length : 0);
          }, 0);
  assert.equal(
    children.length,
    spawnedCount,
    "Export every native child; omitted children can hide concurrency violations",
  );
  assert.deepEqual(
    children
      .flatMap((child) =>
        child.taskRevision === null ? [] : [child.taskRevision],
      )
      .sort(),
    expected,
    "Every dirty task needs exactly one native child commit",
  );
  let active = 0;
  let peak = 0;
  for (const event of children
    .flatMap((child) => [
      { at: child.started, change: 1 },
      { at: child.ended, change: -1 },
    ])
    .sort((a, b) => a.at - b.at || a.change - b.change)) {
    active += event.change;
    peak = Math.max(peak, active);
  }
  assert.ok(
    peak <= capacity,
    "Native child concurrency exceeded the resolved capacity",
  );
  const productionChildren = children.filter(
    (child) => child.taskRevision !== null,
  );
  const refillAdmissions = productionChildren.filter((child) =>
    productionChildren.some((earlier) => earlier.ended <= child.started),
  ).length;
  const notifications = await hermesNotifications(input, root);
  return {
    execution: NativeExecutionSchema.parse({
      mode: "subagents",
      workerTransport: resolution.workerTransport,
      modeSource: sources.mode,
      concurrencySource: sources.maxConcurrency,
      requestedMaxConcurrency: 4,
      effectiveMaxConcurrency: capacity,
      peakActiveChildren: peak,
      dirtyTaskCount: tasks.length,
      productionChildCount: productionChildren.length,
      probeChildCount: children.length - productionChildren.length,
      refillAdmissions,
      attemptId: preparation.value.attemptId,
      childEvidence: children.map(
        ({ sessionId, transcriptChecksum, sessionChecksum, taskRevision }) => ({
          sessionId,
          transcriptChecksum,
          sessionChecksum,
          taskRevision,
        }),
      ),
      delegationChecksum: notifications.delegationChecksum,
      notificationFormatterChecksum:
        notifications.notificationFormatterChecksum,
    }),
    allowedNativeMessages: notifications.messages,
  };
}

async function hermesNotifications(
  input: {
    host: "codex" | "hermes";
    sessionId: string;
    delegationFile?: string;
    hermesRuntimeRoot?: string;
  },
  root: ReturnType<typeof nativeTrace>,
) {
  if (input.host !== "hermes" || !input.delegationFile)
    return {
      messages: [] as string[],
      delegationChecksum: null,
      notificationFormatterChecksum: null,
    };
  assert.ok(
    input.hermesRuntimeRoot,
    "Hermes notification verification requires the installed native runtime",
  );
  const bytes = await readFile(input.delegationFile);
  const rows = z
    .array(z.record(z.string(), z.unknown()))
    .parse(JSON.parse(bytes.toString("utf8")));
  const events = rows.map((record) =>
    object(
      typeof record.event_json === "string"
        ? JSON.parse(record.event_json)
        : record.event_json,
    ),
  );
  const dispatched = root.outputs
    .filter(({ name }) => name === "delegate_task")
    .flatMap(({ objects }) => objects)
    .filter((value) => value.status === "dispatched");
  for (const [index, event] of events.entries()) {
    assert.equal(rows[index]!.parent_session_id, input.sessionId);
    assert.equal(event.parent_session_id, input.sessionId);
    assert.equal(event.type, "async_delegation");
    assert.ok(
      dispatched.some((value) => value.delegation_id === event.delegation_id),
      "Completion is not bound to a native dispatch",
    );
    assert.equal(event.status, "completed");
  }
  const formatter = join(
    input.hermesRuntimeRoot,
    "tools/process_registry_notifications.py",
  );
  const messages = z.array(z.string()).parse(
    JSON.parse(
      execFileSync(
        "python3",
        [
          "-c",
          "import importlib.util,json,sys; s=importlib.util.spec_from_file_location('native_notifications',sys.argv[1]); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps([m.format_process_notification(x) for x in json.load(sys.stdin)]))",
          formatter,
        ],
        {
          input: JSON.stringify(events),
          encoding: "utf8",
          timeout: 30_000,
          maxBuffer: 8 * 1024 * 1024,
        },
      ),
    ),
  );
  return {
    messages,
    delegationChecksum: sha256(bytes),
    notificationFormatterChecksum: sha256(await readFile(formatter)),
  };
}
