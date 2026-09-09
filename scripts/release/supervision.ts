import assert from "node:assert/strict";
import ts from "typescript";
import { sha256 } from "./package-content";
import { z } from "zod";
import { nativeTrace, outputObjects } from "./native-execution";

export const SupervisionSchema = z
  .object({
    schemaVersion: z.literal(1),
    source: z.enum(["codex", "tui"]),
    reportedBeforeCreate: z.literal(true),
    reportedBeforePrepare: z.literal(true),
    continuationCalls: z.literal(1),
    pollingCalls: z.literal(0),
    asyncBatches: z.number().int().nonnegative(),
    completedAsyncBatches: z.number().int().nonnegative(),
    uiEvidence: z
      .object({
        checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
        sessionId: z.string().min(1),
        toolCalls: z.number().int().positive(),
        visibleReports: z.number().int().positive(),
      })
      .strict()
      .optional(),
  })
  .strict();

type Row = Record<string, unknown>;
const object = (value: unknown): Row =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
const args = (value: unknown): Row => {
  if (typeof value !== "string") return object(value);
  try {
    return object(JSON.parse(value));
  } catch {
    return { code: value };
  }
};

const shellCommands = (name: string, input: Row): string[] => {
  if (/(?:^|[._])(?:terminal|exec_command)$/u.test(name))
    return [String(input.command ?? input.cmd ?? "")];
  if (!/(?:^|[._])exec$/u.test(name)) return [];
  const commands: string[] = [];
  const source = ts.createSourceFile(
    "native-exec.ts",
    String(input.code ?? ""),
    ts.ScriptTarget.Latest,
    true,
  );
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "exec_command"
    ) {
      const argument = node.arguments[0];
      if (argument && ts.isObjectLiteralExpression(argument)) {
        for (const property of argument.properties) {
          if (
            ts.isPropertyAssignment(property) &&
            ["cmd", "command"].includes(
              property.name.getText(source).replace(/["']/gu, ""),
            ) &&
            (ts.isStringLiteral(property.initializer) ||
              ts.isNoSubstitutionTemplateLiteral(property.initializer))
          )
            commands.push(property.initializer.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return commands;
};
const productionCalls = (commands: string[], action: string) =>
  commands.reduce(
    (count, command) =>
      count +
      [
        ...command.matchAll(
          new RegExp(
            `(?:^|[;\\n&|])\\s*npm\\s+run\\s+project:${action}(?=\\s|$)`,
            "gu",
          ),
        ),
      ].length,
    0,
  );

type HermesUiInput = {
  rpc: string;
  sessionId: string;
  uiSessionId: string;
  workspace: string;
};

// Authenticate the separately captured native UI stream against the complete DB
// trace. Interim prose exists only in this stream; never insert it into the DB.
function hermesUiTimeline(input: HermesUiInput, records: Row[]) {
  const rpc = input.rpc
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => object(JSON.parse(line)));
  const created = rpc.filter(
    (row) => typeof object(row.result).stored_session_id === "string",
  );
  assert.equal(
    created.length,
    1,
    "TUI evidence requires exactly one fresh session.create response",
  );
  const creation = object(created[0]!.result);
  assert.equal(
    creation.stored_session_id,
    input.sessionId,
    "TUI stored session does not match native DB",
  );
  assert.equal(
    creation.session_id,
    input.uiSessionId,
    "TUI UI session does not match run",
  );
  assert.equal(
    object(creation.info).cwd,
    input.workspace,
    "TUI Workspace does not match",
  );
  assert.equal(creation.message_count, 0, "TUI session was not fresh");
  assert.deepEqual(
    creation.messages,
    [],
    "TUI session contains earlier messages",
  );
  const expectedCalls: Array<{
    id: string;
    name: string;
    arguments: Row;
    row: number;
  }> = [];
  const expectedResults: Array<{ id: string; value: unknown; row: number }> =
    [];
  const expectedReports: Array<{ text: string; row: number }> = [];
  const parseValue = (value: unknown): unknown => {
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  };
  for (const [index, row] of records.entries()) {
    if (row.role === "assistant") {
      for (const raw of (parseValue(row.tool_calls) ?? []) as Row[]) {
        const fn = object(raw.function);
        let name = String(fn.name);
        let arguments_ = args(fn.arguments);
        if (name === "tool_call") {
          name = String(arguments_.name);
          arguments_ = args(arguments_.arguments);
        }
        expectedCalls.push({
          id: String(raw.id),
          name,
          arguments: arguments_,
          row: index,
        });
      }
      if (typeof row.content === "string" && row.content.trim())
        expectedReports.push({ text: row.content, row: index });
    }
    if (row.role === "tool")
      expectedResults.push({
        id: String(row.tool_call_id),
        value: parseValue(row.content),
        row: index,
      });
  }
  const starts = new Map<string, number>();
  const results = new Map<string, number>();
  const rowPositions = new Map<number, number>();
  const reports: number[] = [];
  let sequence = -1;
  let callCount = 0;
  let resultCount = 0;
  let reportCount = 0;
  const creationIndex = rpc.indexOf(created[0]!);
  for (const [index, row] of rpc.entries()) {
    if (row.method !== "event") continue;
    const event = object(row.params);
    const type = String(event.type);
    const payload = object(event.payload);
    if (
      [
        "tool.start",
        "tool.complete",
        "message.interim",
        "message.complete",
      ].includes(type)
    ) {
      assert.ok(index > creationIndex, "TUI event precedes session creation");
      assert.equal(
        event.session_id,
        input.uiSessionId,
        "TUI event belongs to a different session",
      );
      assert.ok(
        Number.isInteger(event.seq),
        "TUI root event lacks native sequence",
      );
    }
    if (event.session_id !== input.uiSessionId) continue;
    if (event.seq !== undefined) {
      assert.ok(
        Number.isInteger(event.seq) &&
          (sequence < 0 || Number(event.seq) === sequence + 1),
        "TUI event sequence is incomplete or reordered",
      );
      sequence = Number(event.seq);
    }
    if (type === "session.info" && payload.stored_session_id !== undefined)
      assert.equal(payload.stored_session_id, input.sessionId);
    if (type === "tool.start" || type === "tool.complete") {
      const id = String(payload.tool_id);
      const expected =
        type === "tool.start"
          ? expectedCalls[callCount]
          : expectedCalls.find((call) => call.id === id);
      assert.ok(expected, "TUI tool has no matching native DB call");
      assert.equal(
        id,
        expected.id,
        "TUI tool call identity/order differs from native DB",
      );
      assert.equal(
        payload.name,
        expected.name,
        "TUI tool name differs from native DB",
      );
      assert.deepEqual(
        payload.args,
        expected.arguments,
        "TUI tool arguments differ from native DB",
      );
      if (type === "tool.start") {
        assert.ok(!starts.has(id), "Duplicate TUI tool start");
        starts.set(id, index);
        callCount++;
        if (!rowPositions.has(expected.row))
          rowPositions.set(expected.row, index);
      } else {
        assert.ok(
          starts.has(id) && !results.has(id),
          "TUI result has no unique preceding start",
        );
        const result = expectedResults[resultCount++];
        assert.ok(result, "Extra TUI tool result");
        assert.equal(id, result.id, "TUI result order differs from native DB");
        assert.deepEqual(
          payload.result,
          result.value,
          "TUI result differs from native DB",
        );
        results.set(id, index);
        rowPositions.set(result.row, index);
      }
    }
    if (
      ["message.interim", "message.complete"].includes(type) &&
      typeof payload.text === "string" &&
      payload.text.trim()
    ) {
      reports.push(index);
      if (type === "message.complete") {
        const expected = expectedReports[reportCount++];
        assert.ok(expected, "TUI final report missing from native DB");
        assert.equal(
          payload.text,
          expected.text,
          "TUI final report differs from native DB",
        );
        rowPositions.set(expected.row, index);
      }
    }
  }
  assert.equal(
    callCount,
    expectedCalls.length,
    "TUI evidence omits native tool calls",
  );
  assert.equal(
    resultCount,
    expectedResults.length,
    "TUI evidence omits native tool results",
  );
  assert.equal(
    reportCount,
    expectedReports.length,
    "TUI evidence omits native final reports",
  );
  // Native notifications remain authenticated by the DB/delegation formatter.
  // Locate them before their next native assistant/tool event in the UI timeline.
  for (const [index, row] of records.entries()) {
    if (row.role !== "user") continue;
    const next = [...rowPositions.entries()]
      .filter(([position]) => position > index)
      .sort(([a], [b]) => a - b)[0];
    assert.ok(next, "Native user notification has no following UI turn");
    rowPositions.set(index, next[1] - 0.5);
  }
  return {
    starts,
    results,
    rowPositions,
    reports,
    evidence: {
      checksum: sha256(input.rpc),
      sessionId: input.uiSessionId,
      toolCalls: callCount,
      visibleReports: reports.length,
    },
  };
}

// This is a trace audit, not a runtime gate: prose proves a report was made,
// while only native tool results prove preparation and delivery.
export function auditSupervision(input: {
  host: "codex" | "hermes";
  transcript: string;
  sessionSource?: string;
  hermesUi?: HermesUiInput;
}) {
  if (input.host === "hermes") {
    assert.equal(
      input.sessionSource,
      "tui",
      "Supervision acceptance requires the real Hermes TUI async path, not -z",
    );
  }
  const { records } = nativeTrace(input.host, input.transcript);
  const ui = input.hermesUi
    ? hermesUiTimeline(input.hermesUi, records)
    : undefined;
  const messages: number[] = ui ? [...ui.reports] : [];
  const calls: Array<{
    index: number;
    name: string;
    arguments: Row;
    text: string;
    commands: string[];
  }> = [];
  const results: Array<{ index: number; value: Row }> = [];
  const completed = new Map<string, number>();
  for (const [index, record] of records.entries()) {
    const row = input.host === "hermes" ? record : object(record.payload);
    if (input.host === "codex" && record.type !== "response_item") continue;
    const content = row.content;
    if (
      !ui &&
      row.role === "assistant" &&
      (typeof content === "string"
        ? content.trim().length > 0
        : Array.isArray(content) &&
          content.some(
            (part) =>
              object(part).type === "output_text" &&
              String(object(part).text ?? "").trim(),
          ))
    )
      messages.push(index);
    if (input.host === "hermes" && row.role === "user") {
      const metadata = args(row.display_metadata);
      const id =
        metadata.delegation_id ??
        (typeof content === "string"
          ? /^\[ASYNC DELEGATION(?: BATCH)? COMPLETE — ([^\]]+)\]/u.exec(
              content,
            )?.[1]
          : undefined);
      // The first-use recorder separately authenticates native notifications
      // against the durable Hermes delegation rows and formatter.
      if (typeof id === "string")
        completed.set(id, ui ? ui.rowPositions.get(index)! : index);
    }
    const rawCalls =
      input.host === "hermes"
        ? ((typeof row.tool_calls === "string"
            ? JSON.parse(row.tool_calls)
            : row.tool_calls) ?? [])
        : ["function_call", "custom_tool_call"].includes(String(row.type))
          ? [row]
          : [];
    for (const raw of rawCalls) {
      const fn =
        input.host === "hermes" ? object(object(raw).function) : object(raw);
      let name = String(fn.name);
      let arguments_ = args(fn.arguments ?? fn.input);
      if (name === "tool_call") {
        name = String(arguments_.name);
        arguments_ = args(arguments_.arguments);
      }
      calls.push({
        index: ui ? ui.starts.get(String(object(raw).id))! : index,
        name,
        arguments: arguments_,
        text: JSON.stringify(arguments_),
        commands: shellCommands(name, arguments_),
      });
    }
    if (
      row.role === "tool" ||
      ["function_call_output", "custom_tool_call_output"].includes(
        String(row.type),
      )
    ) {
      for (const value of outputObjects(row.output ?? row.content))
        results.push({
          index: ui ? ui.results.get(String(row.tool_call_id))! : index,
          value,
        });
    }
  }
  const create = calls.find(
    (call) => productionCalls(call.commands, "create") > 0,
  );
  const prepare = calls.find(
    (call) => productionCalls(call.commands, "produce:prepare") > 0,
  );
  const inspect = results.find(
    (result) => result.value.contractVersion === "production-inspection-v1",
  );
  assert.ok(
    create && prepare && inspect,
    "Missing create, inspect, or prepare evidence",
  );
  assert.ok(
    messages.some((index) => index <= create.index),
    "Missing user-visible boundary report before create",
  );
  assert.ok(
    messages.some((index) => index > inspect.index && index <= prepare.index),
    "Missing user-visible inspect report before costly prepare",
  );
  const continuation = calls.filter(
    (call) => productionCalls(call.commands, "produce:continue") > 0,
  );
  assert.equal(
    continuation.reduce(
      (count, call) =>
        count + productionCalls(call.commands, "produce:continue"),
      0,
    ),
    1,
    "Production must start its continuation exactly once",
  );
  for (const call of calls) {
    assert.ok(
      !(call.name === "delegate_task" && call.arguments.action === "list"),
      "Child list polling is not native completion",
    );
    assert.ok(
      !/\/delegation\/live\//u.test(call.text),
      "Root must not read child transcripts to advance production",
    );
    assert.ok(
      !call.commands.some((command) =>
        /(?:^|[;\n&])\s*sleep\s+[\d.]/u.test(command),
      ),
      "Shell sleep blocks event-only completion delivery",
    );
    if (call.index > continuation[0]!.index && call.name === "process_manage") {
      assert.ok(
        !["poll", "log", "list"].includes(String(call.arguments.action)),
        "Continuation supervision must wait on its original handle",
      );
      if (call.arguments.action === "wait")
        assert.ok(
          Number(call.arguments.timeout) >= 30,
          "Use a long native process wait",
        );
    }
  }
  const batches = results.filter(
    (result) =>
      result.value.status === "dispatched" &&
      result.value.mode === "background" &&
      typeof result.value.delegation_id === "string",
  );
  const fixed = results.find((result) =>
    ["project-production-complete", "project-production-current"].includes(
      String(result.value.status),
    ),
  );
  assert.ok(fixed, "No verified fixed delivery result");
  // Hermes may yield with a pending update after fixed delivery while native
  // notifications are still queued. Only the last visible report is final;
  // semantic duplicates or inaccurate prose require the maintainer review.
  const finalReport = messages.filter((index) => index > fixed.index).at(-1);
  assert.ok(finalReport !== undefined, "No user-visible final delivery report");
  for (const batch of batches) {
    const received = completed.get(String(batch.value.delegation_id));
    assert.ok(
      received !== undefined &&
        received > batch.index &&
        received < finalReport,
      "Final report precedes native async batch completion",
    );
  }
  if (input.host === "hermes")
    assert.ok(
      batches.length > 0,
      "Hermes TUI acceptance did not exercise background delegation",
    );
  return SupervisionSchema.parse({
    schemaVersion: 1,
    source: input.host === "hermes" ? "tui" : "codex",
    reportedBeforeCreate: true,
    reportedBeforePrepare: true,
    continuationCalls: 1,
    pollingCalls: 0,
    asyncBatches: batches.length,
    completedAsyncBatches: batches.length,
    ...(ui ? { uiEvidence: ui.evidence } : {}),
  });
}
