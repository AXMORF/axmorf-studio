import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import ts from "typescript";
import { z } from "zod";
import { sha256 } from "./package-content";

type Row = Record<string, unknown>;
const object = (value: unknown): Row =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
const HermesTool = z
  .object({
    name: z.string().min(1),
    arguments: z.union([z.record(z.string(), z.unknown()), z.string()]),
  })
  .strict();

export const unwrapHermesToolCall = (value: unknown) => {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  const bridge =
    parsed !== null && typeof parsed === "object" && "calls" in parsed
      ? z
          .object({ calls: z.tuple([HermesTool]) })
          .strict()
          .parse(parsed).calls[0]
      : HermesTool.parse(parsed);
  return {
    name: bridge.name,
    arguments: z
      .record(z.string(), z.unknown())
      .parse(
        typeof bridge.arguments === "string"
          ? JSON.parse(bridge.arguments)
          : bridge.arguments,
      ),
  };
};
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
  const calls = new Map<
    string,
    { name: string; arguments: string; index: number }
  >();
  const outputs: Array<{
    name: string;
    timestamp: number;
    index: number;
    callId: string;
    objects: Row[];
  }> = [];
  for (const [index, record] of records.entries()) {
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
          index,
        });
      }
    } else if (
      ["function_call", "custom_tool_call"].includes(String(payload.type))
    ) {
      calls.set(String(payload.call_id), {
        name: String(payload.name),
        arguments: String(payload.arguments ?? payload.input ?? ""),
        index,
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
      let outputName = call.name;
      if (host === "hermes" && call.name === "tool_call") {
        // Hermes defers tools behind a native bridge. Its invocation records
        // the wrapper, while the native result records the executed tool name.
        const bridge = unwrapHermesToolCall(call.arguments);
        assert.equal(
          payload.tool_name,
          bridge.name,
          "Hermes bridge output does not match its underlying invocation",
        );
        outputName = bridge.name;
      }
      outputs.push({
        name: outputName,
        index,
        callId: String(payload.tool_call_id ?? payload.call_id),
        timestamp: time(record.timestamp),
        objects: outputObjects(payload.output ?? payload.content),
      });
    }
  }
  return { records, calls, outputs };
}

export function codexSpawnReceipts(
  root: ReturnType<typeof nativeTrace>,
  sessionId: string,
) {
  const completed = root.records.filter((record) => {
    const payload = object(record.payload);
    const item = object(payload.item);
    return (
      record.type === "event_msg" &&
      payload.type === "item_completed" &&
      payload.thread_id === sessionId &&
      item.type === "CollabAgentToolCall" &&
      item.tool === "spawn_agent" &&
      item.status === "completed"
    );
  });
  const eventIds = new Set<string>();
  const childIds = new Set<string>();
  for (const record of completed) {
    const payload = object(record.payload);
    const item = object(payload.item);
    const eventId = z.string().min(1).parse(item.id);
    assert.ok(!eventIds.has(eventId), "Duplicate native spawn event");
    eventIds.add(eventId);
    assert.equal(
      item.sender_thread_id,
      sessionId,
      "Native spawn event has the wrong parent",
    );
    const receivers = z
      .array(z.string().min(1))
      .length(1)
      .parse(item.receiver_thread_ids);
    assert.ok(!childIds.has(receivers[0]!), "Duplicate native child receiver");
    childIds.add(receivers[0]!);
  }
  const agentValues = root.outputs
    .flatMap(({ objects }) => objects)
    .filter(
      (value) =>
        typeof value.agent_id === "string" &&
        typeof value.nickname === "string",
    )
    .map((value) => value.agent_id)
    .filter((value): value is string => typeof value === "string");
  const agentIds = new Set(agentValues);
  assert.equal(
    agentIds.size,
    agentValues.length,
    "Duplicate native spawn tool results",
  );
  if (completed.length === 0) {
    assert.equal(
      agentIds.size,
      0,
      "Codex spawn output has no native completed event",
    );
    const legacyValues = root.outputs
      .filter(({ name }) => /spawn_agent$/u.test(name))
      .flatMap(({ objects }) => objects)
      .map((value) => value.task_name)
      .filter((value): value is string => typeof value === "string");
    const legacy = new Set(legacyValues);
    assert.equal(
      legacy.size,
      legacyValues.length,
      "Duplicate legacy spawn responses",
    );
    return { native: false, childIds: new Set<string>(), legacy };
  }
  assert.equal(
    agentIds.size,
    completed.length,
    "Codex native spawn events and outputs do not match",
  );
  assert.deepEqual(
    [...agentIds].sort(),
    [...childIds].sort(),
    "Codex native spawn receivers do not match tool results",
  );
  return { native: true, childIds, legacy: new Set<string>() };
}

export function codexCompletionMessages(
  root: ReturnType<typeof nativeTrace>,
  sessionId: string,
  children: Array<{
    sessionId: string;
    ended: number;
    lastAgentMessage: string | null;
  }>,
) {
  const expected = new Map(children.map((child) => [child.sessionId, child]));
  const messages = root.records
    .filter((record) => record.type === "response_item")
    .filter((record) => {
      const payload = object(record.payload);
      const metadata = object(
        payload.internal_chat_message_metadata_passthrough,
      );
      return (
        payload.role === "user" &&
        Array.isArray(metadata.content_item_kinds) &&
        metadata.content_item_kinds.length === 1 &&
        metadata.content_item_kinds[0] === "multi_agent.subagent_notification"
      );
    });
  const seen = new Set<string>();
  const allowed: string[] = [];
  let previous = 0;
  if (messages.length === 0) return allowed;
  for (const record of messages) {
    const payload = object(record.payload);
    const content = payload.content;
    assert.ok(Array.isArray(content) && content.length === 1);
    const item = object(content[0]);
    assert.equal(item.type, "input_text");
    const text = z.string().parse(item.text);
    const match = text.match(
      /^<subagent_notification>\n([\s\S]*)\n<\/subagent_notification>$/u,
    );
    assert.ok(match, "Malformed native subagent notification");
    const notification = z
      .object({
        agent_path: z.string().min(1),
        status: z.object({ completed: z.string().nullable() }).strict(),
      })
      .strict()
      .parse(JSON.parse(match[1]!));
    const child = expected.get(notification.agent_path);
    assert.ok(child, "Native notification references an unknown child");
    assert.ok(
      !seen.has(notification.agent_path),
      "Duplicate native notification",
    );
    seen.add(notification.agent_path);
    const timestamp = time(record.timestamp);
    assert.ok(timestamp >= previous, "Native notification order is not stable");
    assert.ok(
      timestamp >= child.ended,
      "Native notification predates child completion",
    );
    assert.equal(
      notification.status.completed,
      child.lastAgentMessage,
      "Native notification text does not match child final message",
    );
    previous = timestamp;
    allowed.push(text);
  }
  assert.equal(
    seen.size,
    expected.size,
    "Native completion notifications do not cover every child",
  );
  const rootCompletion = root.records
    .filter(
      (record) =>
        record.type === "event_msg" &&
        object(record.payload).type === "task_complete" &&
        (object(record.payload).thread_id === sessionId ||
          object(record.payload).thread_id == null),
    )
    .at(-1);
  assert.ok(
    rootCompletion,
    "Native notifications have no Root completion event",
  );
  assert.ok(
    previous <= time(rootCompletion.timestamp),
    "Native notification follows Root completion",
  );
  return allowed;
}

export function codexChildTrace(
  text: string,
  parent: ReturnType<typeof nativeTrace>,
) {
  const records = text
    .trim()
    .split("\n")
    .map((line) => object(JSON.parse(line)));
  const metas = records.filter((record) => record.type === "session_meta");
  assert.equal(
    records[0],
    metas[0],
    "Codex child must start with its own metadata",
  );
  assert.ok(
    metas.length === 1 || metas.length === 2,
    "Unexpected Codex child metadata",
  );
  if (metas.length === 1) return nativeTrace("codex", text);

  // Full-history native forks re-emit selected parent records with NEW outer
  // timestamps. Verify their payload lineage before discarding inherited work.
  const meta = object(metas[0]!.payload);
  const parentMetas = parent.records.filter(
    (record) => record.type === "session_meta",
  );
  assert.equal(
    parentMetas.length,
    1,
    "Codex parent must be a fresh root session",
  );
  assert.equal(
    metas[1],
    records[1],
    "Inherited metadata must precede fork history",
  );
  assert.deepEqual(
    metas[1]!.payload,
    parentMetas[0]!.payload,
    "Inherited metadata does not match parent",
  );
  assert.equal(
    meta.forked_from_id,
    object(parentMetas[0]!.payload).id,
    "Fork does not identify its parent",
  );
  const settingsIndex = records.findIndex(
    (record) =>
      record.type === "event_msg" &&
      object(record.payload).type === "thread_settings_applied" &&
      object(record.payload).thread_id === meta.id,
  );
  assert.ok(settingsIndex > 2, "Fork has no native child settings boundary");
  const adapter = object(records[settingsIndex - 1]!.payload);
  const adapterContent =
    Array.isArray(adapter.content) && adapter.content.length === 1
      ? object(adapter.content[0])
      : {};
  const adapterKinds = object(
    adapter.internal_chat_message_metadata_passthrough,
  ).content_item_kinds;
  // Current Codex identifies this host message with typed metadata; older
  // captures use the XML wrapper. Neither form replaces the lineage audit.
  const hasRoleIdentity =
    adapterKinds === undefined
      ? String(adapterContent.text).startsWith("<multi_agent_role>")
      : Array.isArray(adapterKinds) &&
        adapterKinds.length === 1 &&
        adapterKinds[0] === "multi_agent.role_instructions";
  assert.ok(
    records[settingsIndex - 1]!.type === "response_item" &&
      adapter.type === "message" &&
      adapter.role === "developer" &&
      adapterContent.type === "input_text" &&
      typeof adapterContent.text === "string" &&
      adapterContent.text.trim().length > 0 &&
      hasRoleIdentity,
    "Fork has no native child role adapter",
  );
  let parentIndex = 0;
  for (const record of records.slice(2, settingsIndex - 1)) {
    // World state is a regenerated host projection, never execution evidence.
    if (record.type === "world_state") continue;
    const match = parent.records.findIndex(
      (candidate, index) =>
        index > parentIndex &&
        candidate.type === record.type &&
        isDeepStrictEqual(candidate.payload, record.payload),
    );
    assert.ok(
      match > parentIndex,
      "Inherited history does not match parent order and payloads",
    );
    parentIndex = match;
  }
  const own = records.slice(settingsIndex + 1);
  const parentTurns = new Set(
    parent.records
      .map((record) => object(record.payload).turn_id)
      .filter(Boolean),
  );
  const turns = new Set<string>();
  assert.ok(
    own[0]?.type === "event_msg" &&
      object(own[0].payload).type === "task_started",
    "Fork has no child turn boundary",
  );
  for (const record of own) {
    const payload = object(record.payload);
    if (record.type === "event_msg" && payload.type === "task_started") {
      const turn = z.string().min(1).parse(payload.turn_id);
      assert.ok(
        !parentTurns.has(turn),
        "Inherited parent turn cannot own child work",
      );
      turns.add(turn);
    }
    if (
      payload.turn_id !== undefined ||
      (record.type === "event_msg" && payload.type === "task_complete")
    ) {
      assert.ok(
        turns.has(String(payload.turn_id)),
        "Child event does not belong to its own started turn",
      );
    }
  }
  const trace = nativeTrace(
    "codex",
    [records[0], ...own].map((record) => JSON.stringify(record)).join("\n"),
  );
  assert.ok(
    [...trace.calls.keys()].every((id) => !parent.calls.has(id)),
    "Inherited parent calls cannot own child work",
  );
  return trace;
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

export const shellCommands = (name: string, input: Row): string[] => {
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

export const productionCommands = (commands: string[], action: string) =>
  commands.flatMap((command) =>
    [
      ...command.matchAll(
        new RegExp(
          `(?:^|[;\\n&|])\\s*(npm\\s+run\\s+project:${action}(?=\\s|$)[^;\\n&|]*)`,
          "gu",
        ),
      ),
    ].map((match) => match[1]!.trim()),
  );

const callCommands = (call: { name: string; arguments: string }) => {
  let input: Row;
  try {
    input = object(JSON.parse(call.arguments));
  } catch {
    input = { code: call.arguments };
  }
  if (call.name === "tool_call") {
    const bridge = unwrapHermesToolCall(call.arguments);
    return shellCommands(bridge.name, bridge.arguments);
  }
  return shellCommands(call.name, input);
};

type NativeOperation =
  | {
      kind: "exec";
      command?: string;
      cwd?: string;
      selfDraining?: true;
      joinedDiagnostics?: { index: string; count: number };
    }
  | {
      kind: "process";
      handle: string | undefined;
      chars: unknown;
      selfDraining?: true;
    }
  | { kind: "cell"; handle: string | undefined };

const nativeLiteral = (node: ts.Node): boolean =>
  ts.isStringLiteral(node) ||
  ts.isNumericLiteral(node) ||
  ts.isNoSubstitutionTemplateLiteral(node) ||
  [
    ts.SyntaxKind.TrueKeyword,
    ts.SyntaxKind.FalseKeyword,
    ts.SyntaxKind.NullKeyword,
  ].includes(node.kind) ||
  (ts.isArrayLiteralExpression(node) && node.elements.every(nativeLiteral)) ||
  (ts.isObjectLiteralExpression(node) &&
    new Set(
      node.properties.map((property) =>
        property.name &&
        (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))
          ? property.name.text
          : undefined,
      ),
    ).size === node.properties.length &&
    node.properties.every(
      (property) =>
        ts.isPropertyAssignment(property) &&
        (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
        nativeLiteral(property.initializer),
    ));

// Accept the ordinary code-mode drain loop only after proving that every use of
// its mutable result variable belongs to this launch and its read-only waits.
const isSelfDraining = (source: ts.SourceFile, calls: ts.CallExpression[]) => {
  if (calls.length !== 2) return false;
  const [launch, wait] = calls as [ts.CallExpression, ts.CallExpression];
  if (
    ![launch, wait].every(
      (call) =>
        ts.isPropertyAccessExpression(call.expression) &&
        ts.isIdentifier(call.expression.expression) &&
        call.expression.expression.text === "tools",
    )
  )
    return false;
  const launchInput = launch.arguments[0];
  if (
    !launchInput ||
    !ts.isObjectLiteralExpression(launchInput) ||
    !launchInput.properties.every(
      (property) =>
        ts.isPropertyAssignment(property) &&
        (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
        nativeLiteral(property.initializer),
    )
  )
    return false;
  const launchKeys = launchInput.properties
    .filter(ts.isPropertyAssignment)
    .map(
      (property) => (property.name as ts.Identifier | ts.StringLiteral).text,
    );
  if (new Set(launchKeys).size !== launchKeys.length) return false;
  const awaited = launch.parent;
  const declaration = awaited.parent;
  if (
    !ts.isAwaitExpression(awaited) ||
    !ts.isVariableDeclaration(declaration) ||
    declaration.initializer !== awaited ||
    !ts.isIdentifier(declaration.name) ||
    !ts.isVariableDeclarationList(declaration.parent) ||
    declaration.parent.declarations.length !== 1 ||
    !(declaration.parent.flags & ts.NodeFlags.Let)
  )
    return false;
  const variable = declaration.name.text;
  const statement = declaration.parent.parent;
  const index = source.statements.indexOf(statement as ts.Statement);
  if (
    !source.statements.slice(0, index).every((node) => {
      if (
        !ts.isExpressionStatement(node) ||
        !ts.isAwaitExpression(node.expression)
      )
        return false;
      const call = node.expression.expression;
      return (
        ts.isCallExpression(call) &&
        ts.isPropertyAccessExpression(call.expression) &&
        ts.isIdentifier(call.expression.expression) &&
        call.expression.expression.text === "tools" &&
        call.expression.name.text === "update_plan" &&
        call.arguments.length === 1 &&
        nativeLiteral(call.arguments[0]!)
      );
    })
  )
    return false;
  const firstPrint = source.statements[index + 1];
  const remainder = source.statements.slice(index + 2);
  const loopIndex = remainder.findIndex(ts.isWhileStatement);
  const loop = remainder[loopIndex];
  const beforeLoop = remainder.slice(0, loopIndex);
  const afterLoop = remainder.slice(loopIndex + 1);
  const printArgument = (node: ts.Node | undefined) => {
    if (!node || !ts.isExpressionStatement(node)) return undefined;
    const expression = node.expression;
    return ts.isCallExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === "text" &&
      expression.arguments.length === 1 &&
      ts.isIdentifier(expression.arguments[0]!) &&
      expression.arguments[0]!.text === variable
      ? expression.arguments[0]
      : undefined;
  };
  const initialPrintArgument = printArgument(firstPrint);
  if (
    index < 0 ||
    !initialPrintArgument ||
    !loop ||
    !ts.isWhileStatement(loop) ||
    !ts.isBinaryExpression(loop.expression) ||
    loop.expression.operatorToken.kind !==
      ts.SyntaxKind.ExclamationEqualsEqualsToken ||
    !ts.isIdentifier(loop.expression.right) ||
    loop.expression.right.text !== "undefined" ||
    !ts.isBlock(loop.statement)
  )
    return false;
  const sessionVariable = (node: ts.Node) =>
    ts.isPropertyAccessExpression(node) &&
    node.name.text === "session_id" &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === variable
      ? node.expression
      : undefined;
  const conditionVariable = sessionVariable(loop.expression.left);
  const assignment = wait.parent.parent;
  const waitIndex = loop.statement.statements.indexOf(
    assignment.parent as ts.Statement,
  );
  const finalPrintArgument = printArgument(
    loop.statement.statements[waitIndex + 1],
  );
  const arguments_ = wait.arguments[0];
  if (
    !conditionVariable ||
    !finalPrintArgument ||
    !ts.isAwaitExpression(wait.parent) ||
    !ts.isBinaryExpression(assignment) ||
    assignment.operatorToken.kind !== ts.SyntaxKind.EqualsToken ||
    !ts.isIdentifier(assignment.left) ||
    assignment.left.text !== variable ||
    assignment.right !== wait.parent ||
    waitIndex < 0 ||
    !arguments_ ||
    !ts.isObjectLiteralExpression(arguments_) ||
    !arguments_.properties.every(
      (property) =>
        ts.isPropertyAssignment(property) &&
        (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)),
    )
  )
    return false;
  const properties = arguments_.properties.filter(ts.isPropertyAssignment);
  const keys = properties.map(
    (property) => (property.name as ts.Identifier | ts.StringLiteral).text,
  );
  if (new Set(keys).size !== keys.length) return false;
  const session = properties.find((_, index) => keys[index] === "session_id");
  const chars = properties.find((_, index) => keys[index] === "chars");
  if (
    !chars ||
    !ts.isStringLiteral(chars.initializer) ||
    chars.initializer.text !== ""
  )
    return false;
  const waitVariable = session && sessionVariable(session.initializer);
  if (
    !properties.every(
      (property) => property === session || nativeLiteral(property.initializer),
    )
  )
    return false;
  const passiveResults = new Set<ts.Node>();
  const passiveCallees = new Set<ts.Node>();
  const passiveParts = new Set<ts.Node>();
  const resultField = (node: ts.Node | undefined, field: string) =>
    node &&
    ts.isPropertyAccessExpression(node) &&
    node.name.text === field &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === variable
      ? node.expression
      : undefined;
  const partsDeclarations = beforeLoop.filter(ts.isVariableStatement);
  if (partsDeclarations.length > 1) return false;
  const partsDeclaration = partsDeclarations[0];
  let parts: string | undefined;
  let capturesWrappers = false;
  if (partsDeclaration) {
    if (
      partsDeclaration.declarationList.declarations.length !== 1 ||
      !(
        partsDeclaration.declarationList.flags &
        (ts.NodeFlags.Let | ts.NodeFlags.Const)
      )
    )
      return false;
    const binding = partsDeclaration.declarationList.declarations[0]!;
    if (
      !ts.isIdentifier(binding.name) ||
      !binding.initializer ||
      !ts.isArrayLiteralExpression(binding.initializer) ||
      binding.initializer.elements.length !== 1
    )
      return false;
    const element = binding.initializer.elements[0]!;
    const initial =
      ts.isIdentifier(element) && element.text === variable
        ? element
        : resultField(element, "output");
    if (
      !initial ||
      [variable, "tools", "text", "store", "undefined", "Error"].includes(
        binding.name.text,
      )
    )
      return false;
    parts = binding.name.text;
    capturesWrappers = ts.isIdentifier(element);
    passiveParts.add(binding.name);
    passiveResults.add(initial);
  }
  const partCall = (node: ts.Node, method: "join" | "push") => {
    if (
      !parts ||
      !partsDeclaration ||
      node.pos < partsDeclaration.pos ||
      !ts.isCallExpression(node) ||
      !ts.isPropertyAccessExpression(node.expression) ||
      node.expression.name.text !== method ||
      !ts.isIdentifier(node.expression.expression) ||
      node.expression.expression.text !== parts ||
      node.arguments.length !== 1
    )
      return false;
    if (method === "join") {
      if (
        !ts.isStringLiteral(node.arguments[0]!) ||
        node.arguments[0]!.text !== ""
      )
        return false;
    } else {
      const argument = node.arguments[0]!;
      const result = capturesWrappers
        ? ts.isIdentifier(argument) && argument.text === variable
          ? argument
          : undefined
        : resultField(argument, "output");
      if (!result) return false;
      passiveResults.add(result);
    }
    passiveParts.add(node.expression.expression);
    return true;
  };
  const storedValue = (node: ts.Node) => {
    const result =
      ts.isIdentifier(node) && node.text === variable
        ? node
        : (resultField(node, "output") ?? resultField(node, "session_id"));
    if (result) {
      passiveResults.add(result);
      return true;
    }
    if (capturesWrappers && ts.isIdentifier(node) && node.text === parts) {
      passiveParts.add(node);
      return true;
    }
    return partCall(node, "join");
  };
  const passive = (node: ts.Statement, allowPush = false) => {
    if (
      !ts.isExpressionStatement(node) ||
      !ts.isCallExpression(node.expression)
    )
      return false;
    const call = node.expression;
    if (allowPush && partCall(call, "push")) return true;
    if (
      !ts.isIdentifier(call.expression) ||
      call.expression.text !== "store" ||
      call.arguments.length !== 2 ||
      !ts.isStringLiteral(call.arguments[0]!) ||
      !storedValue(call.arguments[1]!)
    )
      return false;
    passiveCallees.add(call.expression);
    return true;
  };
  if (
    !beforeLoop.every((node) => node === partsDeclaration || passive(node)) ||
    !loop.statement.statements
      .slice(0, waitIndex)
      .every((node) => passive(node))
  )
    return false;
  const afterPrint = loop.statement.statements.slice(waitIndex + 2);
  if (!afterPrint.every((node) => passive(node, true))) return false;
  if (
    parts &&
    afterPrint.filter(
      (node) =>
        ts.isExpressionStatement(node) && partCall(node.expression, "push"),
    ).length !== 1
  )
    return false;
  let jsonReceiver: ts.Identifier | undefined;
  const captureProjection = () => {
    if (!capturesWrappers || afterLoop.length < 3) return false;
    const declaration = (node: ts.Node | undefined) =>
      node &&
      ts.isVariableStatement(node) &&
      node.declarationList.flags & ts.NodeFlags.Const &&
      node.declarationList.declarations.length === 1 &&
      ts.isIdentifier(node.declarationList.declarations[0]!.name) &&
      node.declarationList.declarations[0]!.initializer
        ? node.declarationList.declarations[0]
        : undefined;
    const [joinStatement, positionStatement, parseStatement] =
      afterLoop.slice(-3);
    const joined = declaration(joinStatement);
    const position = declaration(positionStatement);
    if (!joined || !position || !parseStatement) return false;
    const join = joined.initializer!;
    if (
      !ts.isCallExpression(join) ||
      !ts.isPropertyAccessExpression(join.expression) ||
      join.expression.name.text !== "join" ||
      join.arguments.length !== 1 ||
      !ts.isStringLiteral(join.arguments[0]!) ||
      join.arguments[0]!.text !== ""
    )
      return false;
    const map = join.expression.expression;
    if (
      !ts.isCallExpression(map) ||
      !ts.isPropertyAccessExpression(map.expression) ||
      map.expression.name.text !== "map" ||
      !ts.isIdentifier(map.expression.expression) ||
      map.expression.expression.text !== parts ||
      map.arguments.length !== 1 ||
      !ts.isArrowFunction(map.arguments[0]!)
    )
      return false;
    const project = map.arguments[0];
    if (
      project.parameters.length !== 1 ||
      !ts.isIdentifier(project.parameters[0]!.name) ||
      project.parameters[0]!.initializer ||
      project.parameters[0]!.dotDotDotToken ||
      !ts.isPropertyAccessExpression(project.body) ||
      project.body.name.text !== "output" ||
      !ts.isIdentifier(project.body.expression) ||
      project.body.expression.text !== project.parameters[0]!.name.text
    )
      return false;
    const joinedName = (joined.name as ts.Identifier).text;
    const positionName = (position.name as ts.Identifier).text;
    const search = position.initializer!;
    if (
      !ts.isCallExpression(search) ||
      !ts.isPropertyAccessExpression(search.expression) ||
      search.expression.name.text !== "indexOf" ||
      !ts.isIdentifier(search.expression.expression) ||
      search.expression.expression.text !== joinedName ||
      search.arguments.length !== 1 ||
      !ts.isStringLiteral(search.arguments[0]!) ||
      !ts.isIfStatement(parseStatement) ||
      parseStatement.elseStatement ||
      !ts.isBinaryExpression(parseStatement.expression) ||
      parseStatement.expression.operatorToken.kind !==
        ts.SyntaxKind.GreaterThanEqualsToken ||
      !ts.isIdentifier(parseStatement.expression.left) ||
      parseStatement.expression.left.text !== positionName ||
      !ts.isNumericLiteral(parseStatement.expression.right) ||
      parseStatement.expression.right.text !== "0"
    )
      return false;
    const body = parseStatement.thenStatement;
    if (ts.isBlock(body) && body.statements.length !== 2) return false;
    const parsed = ts.isBlock(body)
      ? declaration(body.statements[0])
      : undefined;
    const store = ts.isBlock(body) ? body.statements[1]! : body;
    if (
      (ts.isBlock(body) && !parsed) ||
      !ts.isExpressionStatement(store) ||
      !ts.isCallExpression(store.expression) ||
      !ts.isIdentifier(store.expression.expression) ||
      store.expression.expression.text !== "store" ||
      store.expression.arguments.length !== 2 ||
      !ts.isStringLiteral(store.expression.arguments[0]!)
    )
      return false;
    const parsedName = parsed ? (parsed.name as ts.Identifier).text : undefined;
    const names = [
      joinedName,
      positionName,
      ...(parsedName ? [parsedName] : []),
      project.parameters[0]!.name.text,
    ];
    if (
      new Set(names).size !== names.length ||
      names.some((name) =>
        [
          variable,
          parts,
          "tools",
          "text",
          "store",
          "undefined",
          "Error",
          "JSON",
        ].includes(name),
      )
    )
      return false;
    const parse = parsed?.initializer ?? store.expression.arguments[1]!;
    if (
      !ts.isCallExpression(parse) ||
      !ts.isPropertyAccessExpression(parse.expression) ||
      !ts.isIdentifier(parse.expression.expression) ||
      parse.expression.expression.text !== "JSON" ||
      parse.expression.name.text !== "parse" ||
      parse.arguments.length !== 1 ||
      !ts.isCallExpression(parse.arguments[0]!)
    )
      return false;
    const slice = parse.arguments[0];
    if (
      !ts.isPropertyAccessExpression(slice.expression) ||
      slice.expression.name.text !== "slice" ||
      !ts.isIdentifier(slice.expression.expression) ||
      slice.expression.expression.text !== joinedName ||
      slice.arguments.length !== 1 ||
      !ts.isIdentifier(slice.arguments[0]!) ||
      slice.arguments[0]!.text !== positionName ||
      (parsedName &&
        (!ts.isIdentifier(store.expression.arguments[1]!) ||
          store.expression.arguments[1]!.text !== parsedName))
    )
      return false;
    passiveParts.add(map.expression.expression);
    passiveCallees.add(store.expression.expression);
    jsonReceiver = parse.expression.expression;
    return true;
  };
  const passiveAfterLoop = captureProjection()
    ? afterLoop.slice(0, -3)
    : afterLoop;
  const terminal = passiveAfterLoop.at(-1);
  if (
    !passiveAfterLoop.every(
      (node) => (node === terminal && ts.isIfStatement(node)) || passive(node),
    )
  )
    return false;
  let terminalVariable: ts.Identifier | undefined;
  let errorConstructor: ts.Identifier | undefined;
  if (terminal && ts.isIfStatement(terminal)) {
    const condition = terminal.expression;
    const failure = terminal.thenStatement;
    if (
      !terminal.elseStatement &&
      ts.isBinaryExpression(condition) &&
      condition.operatorToken.kind ===
        ts.SyntaxKind.ExclamationEqualsEqualsToken &&
      ts.isNumericLiteral(condition.right) &&
      condition.right.text === "0" &&
      ts.isPropertyAccessExpression(condition.left) &&
      condition.left.name.text === "exit_code" &&
      ts.isIdentifier(condition.left.expression) &&
      condition.left.expression.text === variable &&
      ts.isThrowStatement(failure) &&
      ts.isNewExpression(failure.expression) &&
      ts.isIdentifier(failure.expression.expression) &&
      failure.expression.expression.text === "Error" &&
      failure.expression.arguments?.length === 1 &&
      ts.isStringLiteral(failure.expression.arguments[0]!)
    ) {
      terminalVariable = condition.left.expression;
      errorConstructor = failure.expression.expression;
    }
    if (!terminalVariable) return false;
  }
  const allowed = new Set<ts.Node>([
    declaration.name,
    initialPrintArgument,
    conditionVariable,
    assignment.left,
    finalPrintArgument,
    ...(waitVariable ? [waitVariable] : []),
    ...(terminalVariable ? [terminalVariable] : []),
    ...passiveResults,
  ]);
  const undefinedNode = loop.expression.right;
  const printCallees = new Set<ts.Node>([
    (initialPrintArgument.parent as ts.CallExpression).expression,
    (finalPrintArgument.parent as ts.CallExpression).expression,
  ]);
  let valid = Boolean(waitVariable);
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && node.text === variable && !allowed.has(node))
      valid = false;
    if (
      ts.isIdentifier(node) &&
      node.text === "store" &&
      !passiveCallees.has(node)
    )
      valid = false;
    if (
      parts &&
      ts.isIdentifier(node) &&
      node.text === parts &&
      !passiveParts.has(node)
    )
      valid = false;
    if (
      errorConstructor &&
      ts.isIdentifier(node) &&
      node.text === "Error" &&
      node !== errorConstructor
    )
      valid = false;
    if (
      jsonReceiver &&
      ts.isIdentifier(node) &&
      node.text === "JSON" &&
      node !== jsonReceiver
    )
      valid = false;
    if (
      ts.isIdentifier(node) &&
      node.text === "undefined" &&
      node !== undefinedNode
    )
      valid = false;
    if (
      ts.isIdentifier(node) &&
      node.text === "text" &&
      !printCallees.has(node)
    )
      valid = false;
    if (ts.isIdentifier(node) && node.text === "tools") {
      const property = node.parent;
      if (
        !ts.isPropertyAccessExpression(property) ||
        property.expression !== node ||
        !ts.isCallExpression(property.parent) ||
        property.parent.expression !== property ||
        (![launch, wait].includes(property.parent) &&
          !(property.name.text === "update_plan" && property.pos < launch.pos))
      )
        valid = false;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return valid;
};

const nativeOperations = (call: { name: string; arguments: string }) => {
  let input: Row;
  try {
    input = object(JSON.parse(call.arguments));
  } catch {
    input = { code: call.arguments };
  }
  const handle = (value: unknown) =>
    typeof value === "number" || typeof value === "string"
      ? String(value)
      : undefined;
  const operation = (name: string, arguments_: Row): NativeOperation | null => {
    if (name === "exec_command")
      return {
        kind: "exec",
        ...(typeof arguments_.cmd === "string"
          ? { command: arguments_.cmd }
          : {}),
        ...(typeof arguments_.workdir === "string"
          ? { cwd: arguments_.workdir }
          : {}),
      };
    if (name === "write_stdin")
      return {
        kind: "process",
        handle: handle(arguments_.session_id),
        chars: arguments_.chars ?? "",
      };
    if (name === "wait")
      return { kind: "cell", handle: handle(arguments_.cell_id) };
    return null;
  };
  if (!/(?:^|[._])exec$/u.test(call.name)) {
    const name = /(?:^|[._])(exec_command|write_stdin|wait)$/u.exec(
      call.name,
    )?.[1];
    return [name ? operation(name, input) : null].filter(
      (value): value is NativeOperation => value !== null,
    );
  }
  const found: NativeOperation[] = [];
  const calls: ts.CallExpression[] = [];
  const source = ts.createSourceFile(
    "native-handles.ts",
    String(input.code ?? ""),
    ts.ScriptTarget.Latest,
    true,
  );
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ["exec_command", "write_stdin"].includes(node.expression.name.text)
    ) {
      calls.push(node);
      const values: Row = {};
      const argument = node.arguments[0];
      if (argument && ts.isObjectLiteralExpression(argument))
        for (const property of argument.properties) {
          if (!ts.isPropertyAssignment(property)) {
            values.session_id = { nonLiteral: true };
            values.chars = { nonLiteral: true };
            continue;
          }
          const value = property.initializer;
          const key = property.name.getText(source).replace(/["']/gu, "");
          if (
            ts.isStringLiteral(value) ||
            ts.isNoSubstitutionTemplateLiteral(value) ||
            ts.isNumericLiteral(value)
          )
            values[key] = value.text;
          else values[key] = { nonLiteral: true };
        }
      found.push(operation(node.expression.name.text, values)!);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (
    found.length === 2 &&
    found[0]!.kind === "exec" &&
    found[0]!.command !== undefined &&
    found[1]!.kind === "process" &&
    found[1]!.chars === ""
  ) {
    if (
      isSelfDraining(source, calls) ||
      authoringSelfDraining(call, source, calls, found[0]!.command)
    )
      return [{ ...found[0]!, selfDraining: true } as NativeOperation];
    const joined = joinedSelfDraining(source);
    if (joined)
      return [
        {
          ...found[0]!,
          selfDraining: true,
          joinedDiagnostics: joined,
        } as NativeOperation,
      ];
  }
  if (
    found.length === 2 &&
    found[0]!.kind === "process" &&
    found[0]!.handle !== undefined &&
    found[0]!.chars === "" &&
    found[1]!.kind === "process" &&
    found[1]!.chars === "" &&
    isSelfDraining(source, calls)
  )
    return [{ ...found[0]!, selfDraining: true } as NativeOperation];
  return found;
};

// Indexed allSettled envelopes preserve separate native invocations. Prove the
// forwarding code before using an index; stdout cannot supply that identity.
const indexedBatchResult = (
  call: { name: string; arguments: string },
  texts: string[],
) => {
  const rows = texts.flatMap((value): Row[] => {
    const parse = (text: string) => {
      try {
        return object(JSON.parse(text));
      } catch {
        return undefined;
      }
    };
    const whole = parse(value);
    // A native cell may coalesce its text items behind a truncation header.
    // Parse only complete top-level rows, never nested command stdout.
    return whole
      ? [whole]
      : value.split("\n").flatMap((line) => {
          const row = parse(line);
          return row ? [row] : [];
        });
  });
  const envelopes = rows.filter((row) => "index" in row || "result" in row);
  if (!envelopes.length) return null;
  const fail =
    "Indexed native results need their unchanged original batch forwarding";
  assert.ok(
    rows.length === envelopes.length &&
      texts.every(
        (value) =>
          !/^Script\b/u.test(value) ||
          (value.includes("Output:\n") &&
            !value
              .slice(value.indexOf("Output:\n") + "Output:\n".length)
              .trim()),
      ),
    fail,
  );
  let input: Row;
  try {
    input = object(JSON.parse(call.arguments));
  } catch {
    input = { code: call.arguments };
  }
  const source = ts.createSourceFile(
    "native-batch.ts",
    String(input.code ?? ""),
    ts.ScriptTarget.Latest,
    true,
  );
  const [declaration, loop, copy] = source.statements;
  assert.ok(
    /(?:^|[._])exec$/u.test(call.name) &&
      (source.statements.length === 2 || source.statements.length === 3),
    fail,
  );
  assert.ok(
    declaration &&
      ts.isVariableStatement(declaration) &&
      declaration.declarationList.declarations.length === 1 &&
      declaration.declarationList.flags & ts.NodeFlags.Const,
    fail,
  );
  const variable = declaration.declarationList.declarations[0]!;
  assert.ok(
    ts.isIdentifier(variable.name) &&
      variable.initializer &&
      ts.isAwaitExpression(variable.initializer),
    fail,
  );
  const binding = variable.name.text;
  assert.ok(
    !["tools", "Promise", "text", "store", "undefined"].includes(binding),
    fail,
  );
  // A final built-in store may retain the original array, without rebinding
  // helpers, creating aliases, or changing the forwarded results.
  if (copy)
    assert.ok(
      ts.isExpressionStatement(copy) &&
        ts.isCallExpression(copy.expression) &&
        ts.isIdentifier(copy.expression.expression) &&
        copy.expression.expression.text === "store" &&
        copy.expression.arguments.length === 2 &&
        ts.isStringLiteral(copy.expression.arguments[0]!) &&
        ts.isIdentifier(copy.expression.arguments[1]!) &&
        copy.expression.arguments[1].text === binding,
      fail,
    );
  const batch = variable.initializer.expression;
  assert.ok(
    ts.isCallExpression(batch) &&
      ts.isPropertyAccessExpression(batch.expression) &&
      ts.isIdentifier(batch.expression.expression) &&
      batch.expression.expression.text === "Promise" &&
      batch.expression.name.text === "allSettled" &&
      batch.arguments.length === 1 &&
      ts.isArrayLiteralExpression(batch.arguments[0]!),
    fail,
  );
  const operations = batch.arguments[0].elements.map((entry) => {
    assert.ok(
      ts.isCallExpression(entry) &&
        ts.isPropertyAccessExpression(entry.expression) &&
        ts.isIdentifier(entry.expression.expression) &&
        entry.expression.expression.text === "tools" &&
        entry.arguments.length === 1 &&
        nativeLiteral(entry.arguments[0]!),
      fail,
    );
    const operations = nativeOperations({
      name: "functions.exec",
      arguments: entry.getText(source),
    });
    assert.ok(operations.length <= 1, fail);
    return operations[0] ?? null;
  });
  assert.ok(
    loop &&
      ts.isForStatement(loop) &&
      loop.initializer &&
      ts.isVariableDeclarationList(loop.initializer) &&
      loop.initializer.declarations.length === 1 &&
      loop.initializer.flags & ts.NodeFlags.Let,
    fail,
  );
  const iterator = loop.initializer.declarations[0]!;
  assert.ok(
    ts.isIdentifier(iterator.name) &&
      iterator.initializer &&
      ts.isNumericLiteral(iterator.initializer) &&
      iterator.initializer.text === "0",
    fail,
  );
  const index = iterator.name.text;
  assert.ok(
    index !== binding &&
      !["tools", "Promise", "text", "store", "undefined"].includes(index),
    fail,
  );
  const isIndex = (node: ts.Node | undefined) =>
    Boolean(node && ts.isIdentifier(node) && node.text === index);
  const condition = loop.condition;
  assert.ok(
    condition &&
      ts.isBinaryExpression(condition) &&
      condition.operatorToken.kind === ts.SyntaxKind.LessThanToken &&
      isIndex(condition.left) &&
      ts.isPropertyAccessExpression(condition.right) &&
      condition.right.name.text === "length" &&
      ts.isIdentifier(condition.right.expression) &&
      condition.right.expression.text === binding,
    fail,
  );
  assert.ok(
    loop.incrementor &&
      ts.isPostfixUnaryExpression(loop.incrementor) &&
      loop.incrementor.operator === ts.SyntaxKind.PlusPlusToken &&
      isIndex(loop.incrementor.operand),
    fail,
  );
  const forwarded = (node: ts.Node | undefined) =>
    Boolean(
      node &&
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === binding &&
      isIndex(node.argumentExpression),
    );
  const statements = ts.isBlock(loop.statement)
    ? [...loop.statement.statements]
    : [loop.statement];
  const print = statements.pop();
  assert.ok(
    print &&
      ts.isExpressionStatement(print) &&
      ts.isCallExpression(print.expression) &&
      ts.isIdentifier(print.expression.expression) &&
      print.expression.expression.text === "text" &&
      print.expression.arguments.length === 1 &&
      ts.isObjectLiteralExpression(print.expression.arguments[0]!),
    fail,
  );
  const properties = print.expression.arguments[0].properties;
  assert.ok(
    properties.length === 2 &&
      properties.every(
        (property) =>
          ts.isPropertyAssignment(property) ||
          (ts.isShorthandPropertyAssignment(property) &&
            !property.objectAssignmentInitializer),
      ),
    fail,
  );
  const fields = properties
    .filter(
      (property) =>
        ts.isPropertyAssignment(property) ||
        ts.isShorthandPropertyAssignment(property),
    )
    .map(
      (property) =>
        [
          property.name.getText(source),
          ts.isPropertyAssignment(property)
            ? property.initializer
            : property.name,
        ] as const,
    );
  const indexField = fields.some(
    ([key, value]) => key === "index" && isIndex(value),
  )
    ? "index"
    : properties.some(
          (property) =>
            ts.isShorthandPropertyAssignment(property) &&
            isIndex(property.name),
        )
      ? index
      : undefined;
  assert.ok(
    indexField &&
      indexField !== "result" &&
      fields.some(([key, value]) => key === "result" && forwarded(value)),
    fail,
  );
  // The built-in store only serializes a copy; it cannot mutate the forwarded
  // result. No alias, computed callback, or write to the result is accepted.
  const key = (node: ts.Node): boolean =>
    ts.isStringLiteral(node) ||
    isIndex(node) ||
    (ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
      key(node.left) &&
      key(node.right));
  const storeCopy = (statement: ts.Statement) =>
    ts.isExpressionStatement(statement) &&
    ts.isCallExpression(statement.expression) &&
    ts.isIdentifier(statement.expression.expression) &&
    statement.expression.expression.text === "store" &&
    statement.expression.arguments.length === 2 &&
    key(statement.expression.arguments[0]!) &&
    forwarded(statement.expression.arguments[1]);
  assert.ok(
    statements.every((statement) => {
      if (!ts.isIfStatement(statement)) return storeCopy(statement);
      const condition = statement.expression;
      if (
        statement.elseStatement ||
        !ts.isBinaryExpression(condition) ||
        condition.operatorToken.kind !==
          ts.SyntaxKind.EqualsEqualsEqualsToken ||
        !isIndex(condition.left) ||
        !ts.isNumericLiteral(condition.right)
      )
        return false;
      const item = Number(condition.right.text);
      if (!Number.isSafeInteger(item) || item < 0 || item >= operations.length)
        return false;
      const body = ts.isBlock(statement.thenStatement)
        ? statement.thenStatement.statements
        : [statement.thenStatement];
      return body.length === 1 && storeCopy(body[0]!);
    }),
    fail,
  );
  assert.equal(
    envelopes.length,
    operations.length,
    "Native batch result set is incomplete or duplicated",
  );
  assert.deepEqual(
    envelopes.map((row) => row[indexField]),
    operations.map((_, index) => index),
    "Native batch result indices differ from their original invocations",
  );
  const wrappers = envelopes.map((row, index) => {
    assert.deepEqual(Object.keys(row).sort(), [indexField, "result"].sort());
    const result = object(row.result);
    assert.equal(
      result.status,
      "fulfilled",
      "Native batch invocation has no fulfilled original result",
    );
    const wrapper = object(result.value);
    if (operations[index]) {
      assert.ok(
        typeof wrapper.output === "string" &&
          (wrapper.session_id !== undefined ||
            typeof wrapper.exit_code === "number"),
        "Native batch invocation has no complete process result",
      );
      assert.ok(
        !(
          wrapper.session_id !== undefined &&
          typeof wrapper.exit_code === "number"
        ),
        "A completed native process cannot retain a running handle",
      );
    }
    return wrapper;
  });
  const pending = wrappers.flatMap((wrapper, index) =>
    operations[index] && wrapper.session_id !== undefined ? [index] : [],
  );
  assert.ok(pending.length <= 1, "Ambiguous native process result");
  const waits = operations.flatMap((operation, index) =>
    operation?.kind === "process" ? [index] : [],
  );
  assert.ok(waits.length <= 1, "Ambiguous native handle wait invocation");
  assert.ok(
    !waits.length || !pending.length || waits[0] === pending[0],
    "Native batch pending result belongs to a different invocation",
  );
  const index_ = waits[0] ?? pending[0] ?? operations.findIndex(Boolean);
  assert.ok(
    index_ >= 0 && operations[index_],
    "Native batch has no original command invocation",
  );
  assert.ok(
    operations.every(
      (operation, index) =>
        index === index_ ||
        operation?.kind !== "exec" ||
        !["create", "revise", "produce:prepare", "produce:continue"].some(
          (action) =>
            productionCommands([operation.command ?? ""], action).length,
        ),
    ),
    "Independent public mutation needs its own original native result",
  );
  return {
    operation: operations[index_]!,
    execOrdinal:
      operations[index_]!.kind === "exec"
        ? operations
            .slice(0, index_)
            .filter((operation) => operation?.kind === "exec").length
        : undefined,
    wrappers: [wrappers[index_]!],
  };
};

type NativeTrace = ReturnType<typeof nativeTrace>;
const unstartedOuterProofs = new WeakMap<NativeTrace, Map<number, string>>();
const outerFailureChecksum = (trace: NativeTrace, index: number) => {
  const output = trace.outputs.find((value) => value.index === index)!;
  const call = trace.calls.get(output.callId)!;
  return sha256(
    JSON.stringify([trace.records[call.index], trace.records[index]]),
  );
};

const unavailableFirstNativeCall = (
  source: ts.SourceFile,
  call: ts.CallExpression | undefined,
  point: number,
  method: string | undefined,
) =>
  ["exec_command", "write_stdin"].includes(method ?? "") &&
  call !== undefined &&
  call.questionDotToken === undefined &&
  ts.isPropertyAccessExpression(call.expression) &&
  call.expression.questionDotToken === undefined &&
  ts.isIdentifier(call.expression.expression) &&
  call.expression.expression.text === "tools" &&
  call.expression.name.text === method &&
  point === call.expression.name.getStart(source) &&
  call.arguments.length === 1 &&
  ts.isObjectLiteralExpression(call.arguments[0]!) &&
  nativeLiteral(call.arguments[0]!);

// Code mode can fail before any native tool is invoked. Only the host's failed
// envelope, source stack and complete UI command timeline can prove that case.
// It contributes no shell output, exit code, or process completion authority.
const proveUnstartedOuterFailures = (
  trace: NativeTrace,
  input: CodexUiInput,
  rows: Row[],
) => {
  const proofs = new Map<number, string>();
  const failures: Array<{
    callId: string;
    line: number;
    column: number;
    error: string;
  }> = [];
  for (const output of commandOutputs(trace)) {
    const call = trace.calls.get(output.callId)!;
    if (!/(?:^|[._])exec$/u.test(call.name)) continue;
    const payload = object(trace.records[output.index]!.payload);
    const blocks = payload.output;
    if (
      !Array.isArray(blocks) ||
      !String(object(blocks[0]).text).startsWith("Script failed\n")
    )
      continue;
    assert.equal(
      trace.records.filter(
        (record) =>
          ["function_call", "custom_tool_call"].includes(
            String(object(record.payload).type),
          ) && object(record.payload).call_id === output.callId,
      ).length,
      1,
      "Failed outer call needs a unique original native invocation",
    );
    assert.equal(
      trace.outputs.filter((value) => value.callId === output.callId).length,
      1,
      "Failed outer call needs a unique original native result",
    );
    const hasPrimitiveResult = blocks.slice(1).some((block) => {
      try {
        const value = object(JSON.parse(String(object(block).text)));
        return (
          typeof value.output === "string" &&
          (value.session_id !== undefined ||
            typeof value.exit_code === "number")
        );
      } catch {
        return false;
      }
    });
    // A real shell failure follows its original process chain. It cannot use
    // the unstarted-outer classification or lose its fixed terminal result.
    if (hasPrimitiveResult) {
      const error = blocks
        .map((block) => String(object(block).text))
        .find((value) => value.startsWith("Script error:\n"));
      const stack = /\bat exec_main\.mjs:(\d+):(\d+)\s*$/u.exec(error ?? "");
      assert.ok(
        stack,
        "Native outer process results need an original source stack",
      );
      if (stack) {
        let arguments_: Row;
        try {
          arguments_ = object(JSON.parse(call.arguments));
        } catch {
          arguments_ = { code: call.arguments };
        }
        const source = ts.createSourceFile(
          "exec_main.mjs",
          String(arguments_.code ?? ""),
          ts.ScriptTarget.Latest,
          true,
        );
        const starts = source.getLineStarts();
        const line = Number(stack[1]);
        const column = Number(stack[2]);
        assert.ok(
          line > 0 && line <= starts.length && column > 0,
          "Failed outer source position is invalid",
        );
        const point = starts[line - 1]! + column - 1;
        assert.ok(
          point < (starts[line] ?? source.end),
          "Failed outer source position is outside its line",
        );
        let beforeTool = true;
        // A callee or argument stack does not prove the invocation returned.
        // Its expression must end before the stack; UI/process proof still applies.
        const visit = (node: ts.Node) => {
          if (
            ts.isCallExpression(node) &&
            ts.isPropertyAccessExpression(node.expression) &&
            ts.isIdentifier(node.expression.expression) &&
            node.expression.expression.text === "tools" &&
            ["exec_command", "write_stdin"].includes(
              node.expression.name.text,
            ) &&
            node.end < point
          )
            beforeTool = false;
          ts.forEachChild(node, visit);
        };
        visit(source);
        assert.ok(
          !beforeTool,
          "Pre-tool outer failure cannot contain native process results",
        );
      }
      continue;
    }
    assert.ok(
      blocks.length === 2 &&
        blocks.every(
          (block) =>
            object(block).type === "input_text" &&
            typeof object(block).text === "string",
        ),
      "Failed outer tool needs its exact native error envelope",
    );
    assert.match(
      String(object(blocks[0]).text),
      /^Script failed\nWall time \d+(?:\.\d+)? seconds\nOutput:\n$/u,
    );
    const stack =
      /^Script error:\n(ReferenceError|TypeError|Error): ([^\n]+)\n\s+at exec_main\.mjs:(\d+):(\d+)$/u.exec(
        String(object(blocks[1]).text),
      );
    assert.ok(stack, "Failed outer tool has no exact native source stack");
    assert.ok(
      !output.objects.some(
        (value) =>
          value.session_id !== undefined ||
          value.exit_code !== undefined ||
          value.cell_id !== undefined ||
          typeof value.output === "string",
      ),
      "Failed outer tool cannot contain process results or handles",
    );
    let arguments_: Row;
    try {
      arguments_ = object(JSON.parse(call.arguments));
    } catch {
      arguments_ = { code: call.arguments };
    }
    const source = ts.createSourceFile(
      "exec_main.mjs",
      String(arguments_.code ?? ""),
      ts.ScriptTarget.Latest,
      true,
    );
    const line = Number(stack[3]);
    const column = Number(stack[4]);
    const starts = source.getLineStarts();
    assert.ok(
      line > 0 && line <= starts.length && column > 0,
      "Failed outer source position is invalid",
    );
    const point = starts[line - 1]! + column - 1;
    assert.ok(
      point < (starts[line] ?? source.end),
      "Failed outer source position is outside its line",
    );
    const statement = source.statements.find(
      (node) => node.getStart(source) <= point && point < node.end,
    );
    assert.ok(
      statement &&
        (ts.isVariableStatement(statement) ||
          ts.isExpressionStatement(statement) ||
          ts.isThrowStatement(statement)),
      "Failed outer stack is not a top-level pre-tool statement",
    );
    let valid = true;
    let firstTool = Infinity;
    let firstCall: ts.CallExpression | undefined;
    const visit = (node: ts.Node) => {
      if (
        ts.isFunctionLike(node) &&
        node.getStart(source) <= point &&
        point < node.end
      )
        valid = false;
      if (ts.isIdentifier(node) && node.text === "tools") {
        const property = node.parent;
        if (
          !ts.isPropertyAccessExpression(property) ||
          property.expression !== node ||
          !ts.isCallExpression(property.parent) ||
          property.parent.expression !== property
        )
          valid = false;
        else if (property.parent.getStart(source) < firstTool) {
          firstTool = property.parent.getStart(source);
          firstCall = property.parent;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    const unavailable =
      /^tools\.(exec_command|write_stdin) is not a function$/u.exec(stack[2]!);
    // A missing callable reports the member token. Literal arguments exclude
    // nested execution while evaluating that rejected call.
    const unavailableFirstTool =
      stack[1] === "TypeError" &&
      unavailableFirstNativeCall(source, firstCall, point, unavailable?.[1]);
    assert.ok(
      valid && (unavailable ? unavailableFirstTool : point < firstTool),
      "Failed outer stack does not precede its first real tool invocation",
    );
    const origin = object(trace.records[call.index]!.payload);
    const turnId = object(
      origin.internal_chat_message_metadata_passthrough,
    ).turn_id;
    assert.ok(
      typeof turnId === "string" && turnId.length > 0,
      "Failed outer tool has no original Root turn",
    );
    assert.equal(
      object(payload.internal_chat_message_metadata_passthrough).turn_id,
      turnId,
      "Failed outer result belongs to a different Root turn",
    );
    const turnRows = rows
      .map((row, index) => ({
        row,
        index,
        params: object(row.params),
        turn: object(object(row.params).turn),
      }))
      .filter(
        ({ params, turn }) =>
          params.threadId === input.sessionId && turn.id === turnId,
      );
    const opened = turnRows.filter(({ row }) => row.method === "turn/started");
    const closed = turnRows.filter(
      ({ row }) => row.method === "turn/completed",
    );
    assert.equal(
      opened.length,
      1,
      "Failed outer evidence needs one native Root turn start",
    );
    assert.equal(
      closed.length,
      1,
      "Failed outer evidence needs one native Root turn completion",
    );
    assert.ok(
      opened[0]!.index < closed[0]!.index &&
        opened[0]!.turn.status === "inProgress" &&
        ["completed", "failed", "interrupted"].includes(
          String(closed[0]!.turn.status),
        ),
      "Failed outer Root turn is incomplete or reordered",
    );
    const turnStart = time(
      z.number().finite().parse(opened[0]!.turn.startedAt),
    );
    const turnEnd = time(
      z.number().finite().parse(closed[0]!.turn.completedAt),
    );
    assert.equal(closed[0]!.turn.startedAt, opened[0]!.turn.startedAt);
    const launchAt = time(trace.records[call.index]!.timestamp);
    assert.ok(
      turnStart <= launchAt &&
        launchAt <= output.timestamp &&
        output.timestamp <= turnEnd,
      "Failed outer call does not share the complete native Root clock window",
    );
    const nativeItems = rows
      .map((row, index) => ({
        row,
        index,
        params: object(row.params),
        item: object(object(row.params).item),
      }))
      .filter(({ item }) => item.type === "commandExecution");
    for (const { row, item } of nativeItems) {
      z.string().min(1).parse(item.id);
      assert.ok(
        ["item/started", "item/completed"].includes(String(row.method)),
        "Failed outer native inventory contains an unknown command event",
      );
    }
    const commands = nativeItems.filter(
      ({ params }) =>
        params.threadId === input.sessionId && params.turnId === turnId,
    );
    const foreign = new Set(
      nativeItems
        .filter(
          ({ params }) =>
            params.threadId !== input.sessionId || params.turnId !== turnId,
        )
        .map(({ item }) => item.id),
    );
    for (const id of foreign) {
      const events = nativeItems.filter(({ item }) => item.id === id);
      const started = events.filter(({ row }) => row.method === "item/started");
      const ended = events.filter(({ row }) => row.method === "item/completed");
      assert.equal(
        started.length,
        1,
        "Failed outer capture cannot exclude an unlinked native command",
      );
      assert.equal(
        ended.length,
        1,
        "Failed outer capture cannot exclude an unlinked native command",
      );
      const startAt = z.number().finite().parse(started[0]!.params.startedAtMs);
      const endAt = z.number().finite().parse(ended[0]!.params.completedAtMs);
      assert.ok(
        started[0]!.index < ended[0]!.index,
        "Failed outer foreign command is reordered",
      );
      for (const field of ["threadId", "turnId"])
        assert.equal(
          started[0]!.params[field],
          ended[0]!.params[field],
          "Failed outer foreign command changed native lineage",
        );
      assert.ok(
        startAt <= endAt && (endAt < launchAt || startAt > output.timestamp),
        "Failed outer call overlaps a native command with different Root lineage",
      );
    }
    const starts_ = commands.filter(({ row }) => row.method === "item/started");
    const ends = commands.filter(({ row }) => row.method === "item/completed");
    assert.equal(
      starts_.length,
      ends.length,
      "Failed outer native command inventory is incomplete",
    );
    for (const start of starts_) {
      const completions = ends.filter(({ item }) => item.id === start.item.id);
      assert.equal(
        starts_.filter(({ item }) => item.id === start.item.id).length,
        1,
      );
      assert.equal(
        completions.length,
        1,
        "Failed outer native command item has no unique completion",
      );
      const end = completions[0]!;
      assert.ok(
        opened[0]!.index < start.index &&
          start.index < end.index &&
          end.index < closed[0]!.index,
        "Failed outer native command item lies outside the complete Root capture",
      );
      const startedAt = z.number().finite().parse(start.params.startedAtMs);
      const completedAt = z.number().finite().parse(end.params.completedAtMs);
      assert.ok(
        turnStart <= startedAt &&
          startedAt <= completedAt &&
          completedAt <= turnEnd,
        "Failed outer native command uses a different clock window",
      );
      assert.ok(
        completedAt < launchAt || startedAt > output.timestamp,
        "Failed outer call overlaps an actual native command invocation",
      );
    }
    proofs.set(output.index, outerFailureChecksum(trace, output.index));
    failures.push({ callId: output.callId, line, column, error: stack[2]! });
  }
  return { proofs, failures };
};

type SynchronousInvocation = {
  command: string;
  cwd: string;
  yieldMs: number;
  binding: string;
  conditionalOn?: string;
};

// This does not admit authoring prefixes as drain-loop syntax. The original UI
// must separately prove every invocation completed before its first yield.
const synchronousInvocations = (
  call: { name: string; arguments: string },
  cwd: string,
): SynchronousInvocation[] | null => {
  if (!/(?:^|[._])exec$/u.test(call.name)) return null;
  let input: Row;
  try {
    input = object(JSON.parse(call.arguments));
  } catch {
    input = { code: call.arguments };
  }
  const source = ts.createSourceFile(
    "native-synchronous.ts",
    String(input.code ?? ""),
    ts.ScriptTarget.Latest,
    true,
  );
  const launches: ts.CallExpression[] = [];
  const bindings = new Set<string>();
  const dataBindings = new Map<
    string,
    { initializer?: ts.Expression; projected: boolean }
  >();
  const gatherBinding = (
    name: ts.BindingName,
    initializer?: ts.Expression,
    projected = false,
  ) => {
    if (ts.isIdentifier(name)) {
      bindings.add(name.text);
      dataBindings.set(name.text, { initializer, projected });
    } else
      for (const element of name.elements)
        if (ts.isBindingElement(element))
          gatherBinding(element.name, initializer, true);
  };
  const gather = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node)) {
      const loop = node.parent.parent;
      gatherBinding(
        node.name,
        node.initializer ??
          (ts.isForOfStatement(loop) ? loop.expression : undefined),
        ts.isForOfStatement(loop),
      );
    }
    if (ts.isParameter(node)) {
      const callback = node.parent;
      const call = callback.parent;
      const mapped =
        ts.isArrowFunction(callback) &&
        ts.isCallExpression(call) &&
        call.arguments[0] === callback &&
        ts.isPropertyAccessExpression(call.expression) &&
        call.expression.name.text === "map";
      gatherBinding(
        node.name,
        mapped ? call.expression.expression : undefined,
        true,
      );
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "exec_command"
    )
      launches.push(node);
    ts.forEachChild(node, gather);
  };
  gather(source);
  if (!launches.length) return null;
  const regions: Array<{ binding: string; start: number; end: number }> = [];
  const conditions = new Set<ts.Node>();
  const invocations: SynchronousInvocation[] = [];
  for (const launch of launches) {
    const awaited = launch.parent;
    const binding = awaited.parent;
    if (
      !ts.isPropertyAccessExpression(launch.expression) ||
      !ts.isIdentifier(launch.expression.expression) ||
      launch.expression.expression.text !== "tools" ||
      launch.arguments.length !== 1 ||
      !ts.isObjectLiteralExpression(launch.arguments[0]!) ||
      !nativeLiteral(launch.arguments[0]!) ||
      !ts.isAwaitExpression(awaited) ||
      !ts.isVariableDeclaration(binding) ||
      binding.initializer !== awaited ||
      !ts.isIdentifier(binding.name) ||
      !ts.isVariableDeclarationList(binding.parent) ||
      !(binding.parent.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) ||
      binding.parent.declarations.length !== 1
    )
      return null;
    const statement = binding.parent.parent;
    const parent = statement.parent;
    const bindingName = binding.name.text;
    if (
      !ts.isVariableStatement(statement) ||
      !(
        ts.isSourceFile(parent) ||
        (ts.isBlock(parent) &&
          ts.isIfStatement(parent.parent) &&
          parent.parent.thenStatement === parent)
      ) ||
      invocations.some((value) => value.binding === bindingName)
    )
      return null;
    const values = new Map(
      launch.arguments[0].properties
        .filter(ts.isPropertyAssignment)
        .map(
          (property) =>
            [
              (property.name as ts.Identifier | ts.StringLiteral).text,
              property.initializer,
            ] as const,
        ),
    );
    const command = values.get("cmd");
    const directory = values.get("workdir");
    const yield_ = values.get("yield_time_ms");
    if (
      !command ||
      !(
        ts.isStringLiteral(command) ||
        ts.isNoSubstitutionTemplateLiteral(command)
      ) ||
      (directory &&
        !(
          ts.isStringLiteral(directory) ||
          ts.isNoSubstitutionTemplateLiteral(directory)
        )) ||
      (yield_ && !ts.isNumericLiteral(yield_))
    )
      return null;
    const yieldMs = yield_ ? Number(yield_.getText(source)) : 10000;
    if (yieldMs < 250 || yieldMs > 30000) return null;
    const start = parent.statements.indexOf(statement);
    const next = parent.statements.findIndex(
      (node, index) =>
        index > start &&
        launches.some((other) => other.parent.parent.parent.parent === node),
    );
    let group = [
      ...parent.statements.slice(start, next < 0 ? undefined : next),
    ];
    const last = group.at(-1);
    if (
      last &&
      ts.isIfStatement(last) &&
      launches.some((other) => other.pos > last.pos && other.end < last.end)
    ) {
      const condition = last.expression;
      if (
        last.elseStatement ||
        !ts.isBlock(last.thenStatement) ||
        !ts.isBinaryExpression(condition) ||
        condition.operatorToken.kind !==
          ts.SyntaxKind.EqualsEqualsEqualsToken ||
        !ts.isPropertyAccessExpression(condition.left) ||
        condition.left.name.text !== "exit_code" ||
        !ts.isIdentifier(condition.left.expression) ||
        condition.left.expression.text !== binding.name.text ||
        !ts.isNumericLiteral(condition.right) ||
        condition.right.text !== "0" ||
        last.thenStatement.statements.length !== 3
      )
        return null;
      conditions.add(condition.left.expression);
      group = group.slice(0, -1);
    }
    const fragment = ts.createSourceFile(
      "native-sync-forwarding.ts",
      group.map((node) => node.getText(source)).join("\n"),
      ts.ScriptTarget.Latest,
      true,
    );
    const nativeCalls: ts.CallExpression[] = [];
    const findCalls = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ["exec_command", "write_stdin"].includes(node.expression.name.text)
      )
        nativeCalls.push(node);
      ts.forEachChild(node, findCalls);
    };
    findCalls(fragment);
    const forwarded = (node: ts.Node | undefined) =>
      node && ts.isIdentifier(node) && node.text === bindingName;
    const directPrint = group[1];
    const plain =
      nativeCalls.length === 1 &&
      group.length >= 2 &&
      directPrint &&
      ts.isExpressionStatement(directPrint) &&
      ts.isCallExpression(directPrint.expression) &&
      ts.isIdentifier(directPrint.expression.expression) &&
      directPrint.expression.expression.text === "text" &&
      directPrint.expression.arguments.length === 1 &&
      forwarded(directPrint.expression.arguments[0]) &&
      group
        .slice(2)
        .every(
          (node) =>
            ts.isExpressionStatement(node) &&
            ts.isCallExpression(node.expression) &&
            ts.isIdentifier(node.expression.expression) &&
            node.expression.expression.text === "store" &&
            node.expression.arguments.length === 2 &&
            ts.isStringLiteral(node.expression.arguments[0]!) &&
            forwarded(node.expression.arguments[1]),
        );
    if (!plain && !isSelfDraining(fragment, nativeCalls)) return null;
    let conditionalOn: string | undefined;
    if (ts.isBlock(parent) && ts.isIfStatement(parent.parent)) {
      const guard = parent.parent.expression;
      if (
        !ts.isBinaryExpression(guard) ||
        !ts.isPropertyAccessExpression(guard.left) ||
        !ts.isIdentifier(guard.left.expression) ||
        !conditions.has(guard.left.expression)
      )
        return null;
      conditionalOn = guard.left.expression.text;
    }
    regions.push({
      binding: binding.name.text,
      start: statement.pos,
      end: group.at(-1)!.end,
    });
    invocations.push({
      command: command.text,
      cwd: directory ? directory.text : cwd,
      yieldMs,
      binding: binding.name.text,
      ...(conditionalOn ? { conditionalOn } : {}),
    });
  }
  const helpers = new Set([
    "tools",
    "text",
    "store",
    "load",
    "image",
    "Promise",
    "JSON",
    "String",
    "Math",
    "undefined",
    "Error",
  ]);
  type DataKind = "data" | "array" | "object" | "string" | "scalar";
  // A bound name does not prove it is callable. Outside the exact native
  // result regions, only serialized authoring values and pure data calls may
  // supply members; custom helpers, methods, and closures remain unproven.
  const data = (
    node: ts.Expression,
    seen = new Set<string>(),
  ): DataKind | undefined => {
    const read = (value: ts.Expression) => data(value, seen);
    if (ts.isParenthesizedExpression(node)) return read(node.expression);
    if (ts.isStringLiteralLike(node)) return "string";
    if (nativeLiteral(node)) {
      return ts.isArrayLiteralExpression(node)
        ? "array"
        : ts.isObjectLiteralExpression(node)
          ? "object"
          : "scalar";
    }
    if (ts.isIdentifier(node)) {
      const binding = dataBindings.get(node.text);
      if (!binding?.initializer || seen.has(node.text)) return undefined;
      const value = data(binding.initializer, new Set([...seen, node.text]));
      return value && (binding.projected ? "data" : value);
    }
    if (ts.isArrayLiteralExpression(node))
      return node.elements.every((value) => read(value)) ? "array" : undefined;
    if (ts.isObjectLiteralExpression(node))
      return node.properties.every((property) =>
        ts.isPropertyAssignment(property)
          ? !ts.isComputedPropertyName(property.name) &&
            !!read(property.initializer)
          : ts.isShorthandPropertyAssignment(property) && !!read(property.name),
      )
        ? "object"
        : undefined;
    if (ts.isPropertyAccessExpression(node))
      return read(node.expression) ? "data" : undefined;
    if (ts.isElementAccessExpression(node))
      return read(node.expression) && read(node.argumentExpression)
        ? "data"
        : undefined;
    if (ts.isBinaryExpression(node)) {
      if (
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
      )
        return undefined;
      const left = read(node.left);
      const right = read(node.right);
      return left && right
        ? node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
          (left === "string" || right === "string")
          ? "string"
          : "scalar"
        : undefined;
    }
    if (!ts.isCallExpression(node)) return undefined;
    const callee = node.expression;
    const args = node.arguments;
    if (ts.isIdentifier(callee)) {
      if (
        callee.text === "load" &&
        args.length === 1 &&
        ts.isStringLiteral(args[0]!)
      )
        return "data";
      return callee.text === "String" &&
        args.length <= 1 &&
        args.every((value) => read(value))
        ? "string"
        : undefined;
    }
    if (!ts.isPropertyAccessExpression(callee)) return undefined;
    if (
      ts.isIdentifier(callee.expression) &&
      callee.expression.text === "JSON" &&
      args.every((value) => read(value))
    )
      return callee.name.text === "parse" && args.length === 1
        ? "data"
        : callee.name.text === "stringify" &&
            args.length >= 1 &&
            args.length <= 3
          ? "string"
          : undefined;
    const receiver = read(callee.expression);
    if (
      callee.name.text === "map" &&
      (receiver === "data" || receiver === "array") &&
      args.length === 1 &&
      ts.isArrowFunction(args[0]!) &&
      !args[0]!.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword,
      ) &&
      !ts.isBlock(args[0]!.body) &&
      read(args[0]!.body)
    )
      return "array";
    if (!args.every((value) => read(value))) return undefined;
    if (
      callee.name.text === "sort" &&
      (receiver === "data" || receiver === "array") &&
      args.length === 0
    )
      return "array";
    if (
      callee.name.text === "split" &&
      receiver === "string" &&
      args.length <= 2
    )
      return "array";
    if (callee.name.text === "join" && receiver === "array" && args.length <= 1)
      return "string";
    if (receiver !== "string" && receiver !== "array") return undefined;
    if (callee.name.text === "slice" && args.length <= 2) return receiver;
    if (callee.name.text === "indexOf" && args.length >= 1 && args.length <= 2)
      return "scalar";
    return undefined;
  };
  let valid = true;
  const visit = (node: ts.Node) => {
    const inRegion = regions.some(
      (region) => node.pos >= region.start && node.end <= region.end,
    );
    if (!inRegion) {
      if (
        ts.isTaggedTemplateExpression(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node) ||
        ts.isDeleteExpression(node) ||
        (ts.isBinaryExpression(node) &&
          node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
          node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) ||
        ((ts.isForOfStatement(node) || ts.isForInStatement(node)) &&
          !ts.isVariableDeclarationList(node.initializer)) ||
        ((ts.isPrefixUnaryExpression(node) ||
          ts.isPostfixUnaryExpression(node)) &&
          [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(
            node.operator,
          )) ||
        (ts.isArrowFunction(node) &&
          !(ts.isCallExpression(node.parent) && data(node.parent))) ||
        (ts.isNewExpression(node) &&
          !(
            ts.isIdentifier(node.expression) && node.expression.text === "Error"
          ))
      )
        valid = false;
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const direct =
          ts.isIdentifier(callee) &&
          ["text", "store"].includes(callee.text) &&
          node.arguments.every((value) =>
            ts.isAwaitExpression(value)
              ? ts.isCallExpression(value.expression) &&
                ts.isPropertyAccessExpression(value.expression.expression) &&
                ts.isIdentifier(value.expression.expression.expression) &&
                value.expression.expression.expression.text === "tools" &&
                value.expression.expression.name.text === "apply_patch"
              : data(value),
          );
        const patch =
          ts.isPropertyAccessExpression(callee) &&
          ts.isIdentifier(callee.expression) &&
          callee.expression.text === "tools" &&
          callee.name.text === "apply_patch" &&
          node.arguments.length === 1 &&
          data(node.arguments[0]!) === "string" &&
          ts.isAwaitExpression(node.parent) &&
          ts.isCallExpression(node.parent.parent) &&
          ts.isIdentifier(node.parent.parent.expression) &&
          node.parent.parent.expression.text === "text" &&
          node.parent.parent.arguments.length === 1 &&
          ts.isExpressionStatement(node.parent.parent.parent) &&
          node.parent.parent.parent.parent === source &&
          node.end <= regions[0]!.start;
        if (!direct && !patch && !data(node)) valid = false;
      }
    }
    if (
      node.kind === ts.SyntaxKind.ThisKeyword ||
      (ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword) ||
      (ts.isPropertyAccessExpression(node) &&
        ["constructor", "prototype", "__proto__"].includes(node.name.text)) ||
      (ts.isElementAccessExpression(node) &&
        (!node.argumentExpression ||
          !ts.isNumericLiteral(node.argumentExpression)))
    )
      valid = false;
    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      const propertyName =
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (ts.isPropertyAssignment(parent) && parent.name === node) ||
        (ts.isBindingElement(parent) && parent.propertyName === node);
      if (!propertyName) {
        const region = regions.find((value) => value.binding === node.text);
        if (
          region &&
          !(node.pos >= region.start && node.end <= region.end) &&
          !conditions.has(node)
        )
          valid = false;
        if (helpers.has(node.text)) {
          const direct =
            ts.isCallExpression(parent) && parent.expression === node;
          const member =
            ts.isPropertyAccessExpression(parent) &&
            parent.expression === node &&
            ts.isCallExpression(parent.parent) &&
            parent.parent.expression === parent;
          const accepted = ["text", "store", "load", "String"].includes(
            node.text,
          )
            ? direct
            : node.text === "Error"
              ? ts.isNewExpression(parent) && parent.expression === node
              : node.text === "undefined"
                ? ts.isBinaryExpression(parent) &&
                  parent.right === node &&
                  parent.operatorToken.kind ===
                    ts.SyntaxKind.ExclamationEqualsEqualsToken
                : member &&
                  (node.text === "tools"
                    ? ["exec_command", "write_stdin", "apply_patch"].includes(
                        parent.name.text,
                      )
                    : node.text === "JSON"
                      ? ["parse", "stringify"].includes(parent.name.text)
                      : node.text === "Math");
          if (!accepted) valid = false;
        } else if (!bindings.has(node.text)) valid = false;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return valid ? invocations : null;
};

// A serialized create input can be normalized and patched before launching its
// drain loop. Prove the entire authoring prefix and the existing result region;
// neither stored authoring data nor the patch result supplies process authority.
const authoringSelfDraining = (
  call: { name: string; arguments: string },
  source: ts.SourceFile,
  calls: ts.CallExpression[],
  command: string,
) => {
  const invocation = synchronousInvocations(call, "");
  if (!invocation || invocation.length !== 1) return false;
  const launch = calls[0]!;
  const statement = launch.parent.parent.parent.parent;
  const prefix = source.statements.slice(
    0,
    source.statements.indexOf(statement as ts.Statement),
  );
  if (statement.parent !== source || prefix.length !== 7) return false;
  const input =
    /^npm run project:create -- --project [a-z0-9][a-z0-9-]* --input (inputs\/[a-zA-Z0-9][a-zA-Z0-9._/-]*\.json)$/u.exec(
      command,
    )?.[1];
  if (!input || input.split("/").some((part) => part === "." || part === ".."))
    return false;
  const declaration = (node: ts.Node | undefined) => {
    if (
      !node ||
      !ts.isVariableStatement(node) ||
      !(node.declarationList.flags & ts.NodeFlags.Const) ||
      node.declarationList.declarations.length !== 1
    )
      return undefined;
    const binding = node.declarationList.declarations[0]!;
    return ts.isIdentifier(binding.name) && binding.initializer
      ? { name: binding.name.text, value: binding.initializer }
      : undefined;
  };
  const identifier = (node: ts.Node | undefined, name: string) =>
    !!node && ts.isIdentifier(node) && node.text === name;
  const string = (node: ts.Node | undefined, value: string) =>
    !!node && ts.isStringLiteral(node) && node.text === value;
  const member = (node: ts.Node, root: string, fields: string[]): boolean => {
    if (!fields.length) return identifier(node, root);
    return (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === fields.at(-1) &&
      member(node.expression, root, fields.slice(0, -1))
    );
  };
  const direct = (node: ts.Node, name: string) =>
    ts.isCallExpression(node) && identifier(node.expression, name)
      ? node
      : undefined;
  const expression = (node: ts.Node | undefined) =>
    node && ts.isExpressionStatement(node) ? node.expression : undefined;
  const data = declaration(prefix[0]);
  const before = declaration(prefix[1]);
  const after = declaration(prefix[4]);
  if (
    !data ||
    !before ||
    !after ||
    new Set([data.name, before.name, after.name, invocation[0]!.binding])
      .size !== 4
  )
    return false;
  const load = direct(data.value, "load");
  if (
    !load ||
    load.arguments.length !== 1 ||
    !ts.isStringLiteral(load.arguments[0]!)
  )
    return false;
  const key = load.arguments[0].text;
  const stringify = (node: ts.Expression) =>
    ts.isCallExpression(node) &&
    member(node.expression, "JSON", ["stringify"]) &&
    node.arguments.length === 3 &&
    identifier(node.arguments[0], data.name) &&
    node.arguments[1]!.kind === ts.SyntaxKind.NullKeyword &&
    ts.isNumericLiteral(node.arguments[2]!) &&
    node.arguments[2]!.text === "2";
  if (!stringify(before.value) || !stringify(after.value)) return false;
  const sort = (
    node: ts.Expression | undefined,
    root: string,
    fields: string[],
  ) =>
    !!node &&
    ts.isCallExpression(node) &&
    node.arguments.length === 0 &&
    member(node.expression, root, [...fields, "sort"]);
  if (
    !sort(expression(prefix[2]), data.name, ["resources", "allowedResourceIds"])
  )
    return false;
  const loop = prefix[3]!;
  if (
    !ts.isForOfStatement(loop) ||
    loop.awaitModifier ||
    !ts.isVariableDeclarationList(loop.initializer) ||
    !(loop.initializer.flags & ts.NodeFlags.Const) ||
    loop.initializer.declarations.length !== 1 ||
    !member(loop.expression, data.name, ["scenes"])
  )
    return false;
  const scene = loop.initializer.declarations[0]!;
  const body =
    ts.isBlock(loop.statement) && loop.statement.statements.length === 1
      ? loop.statement.statements[0]
      : loop.statement;
  if (
    !ts.isIdentifier(scene.name) ||
    scene.initializer ||
    [data.name, before.name, after.name, invocation[0]!.binding].includes(
      scene.name.text,
    ) ||
    !sort(expression(body), scene.name.text, ["candidateResourceIds"])
  )
    return false;
  const storeExpression = expression(prefix[5]);
  const store = storeExpression && direct(storeExpression, "store");
  if (
    !store ||
    store.arguments.length !== 2 ||
    !string(store.arguments[0], key) ||
    !identifier(store.arguments[1], data.name)
  )
    return false;
  const patchExpression = expression(prefix[6]);
  const print = patchExpression && direct(patchExpression, "text");
  if (
    !print ||
    print.arguments.length !== 1 ||
    !ts.isAwaitExpression(print.arguments[0]!)
  )
    return false;
  const patch = print.arguments[0].expression;
  if (
    !ts.isCallExpression(patch) ||
    !member(patch.expression, "tools", ["apply_patch"]) ||
    patch.arguments.length !== 1
  )
    return false;
  const pieces = (node: ts.Expression): ts.Expression[] =>
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
      ? [...pieces(node.left), ...pieces(node.right)]
      : [node];
  const parts = pieces(patch.arguments[0]!);
  const lines = (node: ts.Expression, root: string, sign: string) => {
    if (
      !ts.isCallExpression(node) ||
      !ts.isPropertyAccessExpression(node.expression) ||
      node.expression.name.text !== "join" ||
      node.arguments.length !== 1 ||
      !string(node.arguments[0], "\n")
    )
      return false;
    const map = node.expression.expression;
    if (
      !ts.isCallExpression(map) ||
      !ts.isPropertyAccessExpression(map.expression) ||
      map.expression.name.text !== "map" ||
      map.arguments.length !== 1 ||
      !ts.isArrowFunction(map.arguments[0]!)
    )
      return false;
    const project = map.arguments[0];
    if (project.modifiers?.length || project.parameters.length !== 1)
      return false;
    const parameter = project.parameters[0]!;
    if (
      !ts.isIdentifier(parameter.name) ||
      parameter.initializer ||
      parameter.dotDotDotToken ||
      parameter.modifiers?.length ||
      !ts.isBinaryExpression(project.body) ||
      project.body.operatorToken.kind !== ts.SyntaxKind.PlusToken ||
      !string(project.body.left, sign) ||
      !identifier(project.body.right, parameter.name.text)
    )
      return false;
    const split = map.expression.expression;
    return (
      ts.isCallExpression(split) &&
      member(split.expression, root, ["split"]) &&
      split.arguments.length === 1 &&
      string(split.arguments[0], "\n")
    );
  };
  return (
    parts.length === 5 &&
    string(parts[0], `*** Begin Patch\n*** Update File: ${input}\n@@\n`) &&
    lines(parts[1]!, before.name, "-") &&
    string(parts[2], "\n") &&
    lines(parts[3]!, after.name, "+") &&
    string(parts[4], "\n*** End Patch")
  );
};

// Each immediately invoked body is joined by the original allSettled. Only the
// exact drain body owns native results; image bodies and rejected-item prints
// are diagnostics, with no command or handle authority.
const joinedSelfDraining = (source: ts.SourceFile) => {
  if (source.statements.length !== 2) return false;
  const declaration = source.statements[0]!;
  const loop = source.statements[1]!;
  const reserved = new Set([
    "tools",
    "text",
    "store",
    "load",
    "image",
    "JSON",
    "String",
    "Promise",
    "undefined",
    "Error",
  ]);
  if (
    !ts.isVariableStatement(declaration) ||
    !(declaration.declarationList.flags & ts.NodeFlags.Const) ||
    declaration.declarationList.declarations.length !== 1
  )
    return false;
  const result = declaration.declarationList.declarations[0]!;
  if (
    !ts.isIdentifier(result.name) ||
    reserved.has(result.name.text) ||
    !result.initializer ||
    !ts.isAwaitExpression(result.initializer)
  )
    return false;
  const resultName = result.name.text;
  const join = result.initializer.expression;
  if (
    !ts.isCallExpression(join) ||
    !ts.isPropertyAccessExpression(join.expression) ||
    !ts.isIdentifier(join.expression.expression) ||
    join.expression.expression.text !== "Promise" ||
    join.expression.name.text !== "allSettled" ||
    join.arguments.length !== 1 ||
    !ts.isArrayLiteralExpression(join.arguments[0]!)
  )
    return false;
  let drains = 0;
  for (const item of join.arguments[0].elements) {
    if (
      !ts.isCallExpression(item) ||
      item.arguments.length !== 0 ||
      !ts.isParenthesizedExpression(item.expression) ||
      !ts.isArrowFunction(item.expression.expression)
    )
      return false;
    const fn = item.expression.expression;
    if (
      fn.parameters.length ||
      fn.typeParameters?.length ||
      fn.modifiers?.length !== 1 ||
      fn.modifiers[0]!.kind !== ts.SyntaxKind.AsyncKeyword ||
      !ts.isBlock(fn.body)
    )
      return false;
    const code = fn.body.statements
      .map((node) => node.getText(source))
      .join("\n");
    const bodyCall = { name: "exec", arguments: code };
    const body = ts.createSourceFile(
      "native-joined-body.ts",
      code,
      ts.ScriptTarget.Latest,
      true,
    );
    const native: ts.CallExpression[] = [];
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ["exec_command", "write_stdin"].includes(node.expression.name.text)
      )
        native.push(node);
      ts.forEachChild(node, visit);
    };
    visit(body);
    if (native.length) {
      if (
        ++drains !== 1 ||
        !isSelfDraining(body, native) ||
        synchronousInvocations(bodyCall, "")?.length !== 1
      )
        return false;
      continue;
    }
    if (body.statements.length !== 2 || !readOnlyDiagnostic(bodyCall))
      return false;
    const start = body.statements[0]!;
    const print = body.statements[1]!;
    if (
      !ts.isVariableStatement(start) ||
      !(start.declarationList.flags & ts.NodeFlags.Const) ||
      start.declarationList.declarations.length !== 1
    )
      return false;
    const binding = start.declarationList.declarations[0]!;
    if (
      !ts.isIdentifier(binding.name) ||
      !binding.initializer ||
      !ts.isAwaitExpression(binding.initializer)
    )
      return false;
    const view = binding.initializer.expression;
    if (
      !ts.isCallExpression(view) ||
      !ts.isPropertyAccessExpression(view.expression) ||
      !ts.isIdentifier(view.expression.expression) ||
      view.expression.expression.text !== "tools" ||
      view.expression.name.text !== "view_image" ||
      view.arguments.length !== 1 ||
      !nativeLiteral(view.arguments[0]!) ||
      !ts.isObjectLiteralExpression(view.arguments[0]!)
    )
      return false;
    const options = new Map(
      view.arguments[0].properties
        .filter(ts.isPropertyAssignment)
        .map((property) => [
          (property.name as ts.Identifier | ts.StringLiteral).text,
          property.initializer,
        ]),
    );
    if (
      !options.has("path") ||
      !ts.isStringLiteralLike(options.get("path")!) ||
      [...options.keys()].some((key) => !["path", "detail"].includes(key))
    )
      return false;
    if (
      !ts.isExpressionStatement(print) ||
      !ts.isCallExpression(print.expression) ||
      !ts.isIdentifier(print.expression.expression) ||
      print.expression.expression.text !== "image" ||
      print.expression.arguments.length !== 1
    )
      return false;
    const argument = print.expression.arguments[0]!;
    if (
      !ts.isPropertyAccessExpression(argument) ||
      argument.name.text !== "image_url" ||
      !ts.isIdentifier(argument.expression) ||
      argument.expression.text !== binding.name.text
    )
      return false;
  }
  if (
    drains !== 1 ||
    !ts.isForStatement(loop) ||
    !loop.initializer ||
    !ts.isVariableDeclarationList(loop.initializer) ||
    !(loop.initializer.flags & ts.NodeFlags.Let) ||
    loop.initializer.declarations.length !== 1
  )
    return false;
  const counter = loop.initializer.declarations[0]!;
  if (
    !ts.isIdentifier(counter.name) ||
    reserved.has(counter.name.text) ||
    counter.name.text === result.name.text ||
    !counter.initializer ||
    !ts.isNumericLiteral(counter.initializer) ||
    counter.initializer.text !== "0"
  )
    return false;
  const name = counter.name.text;
  const identifier = (node: ts.Node | undefined, value: string) =>
    !!node && ts.isIdentifier(node) && node.text === value;
  if (
    !loop.condition ||
    !ts.isBinaryExpression(loop.condition) ||
    loop.condition.operatorToken.kind !== ts.SyntaxKind.LessThanToken ||
    !identifier(loop.condition.left, name) ||
    !ts.isPropertyAccessExpression(loop.condition.right) ||
    loop.condition.right.name.text !== "length" ||
    !identifier(loop.condition.right.expression, result.name.text) ||
    !loop.incrementor ||
    !ts.isPostfixUnaryExpression(loop.incrementor) ||
    loop.incrementor.operator !== ts.SyntaxKind.PlusPlusToken ||
    !identifier(loop.incrementor.operand, name)
  )
    return false;
  const guard =
    ts.isBlock(loop.statement) && loop.statement.statements.length === 1
      ? loop.statement.statements[0]!
      : loop.statement;
  const field = (node: ts.Node, property: string) =>
    ts.isPropertyAccessExpression(node) &&
    node.name.text === property &&
    ts.isElementAccessExpression(node.expression) &&
    identifier(node.expression.expression, resultName) &&
    identifier(node.expression.argumentExpression, name);
  if (
    !ts.isIfStatement(guard) ||
    guard.elseStatement ||
    !ts.isBinaryExpression(guard.expression) ||
    guard.expression.operatorToken.kind !==
      ts.SyntaxKind.EqualsEqualsEqualsToken ||
    !field(guard.expression.left, "status") ||
    !ts.isStringLiteral(guard.expression.right) ||
    guard.expression.right.text !== "rejected"
  )
    return false;
  const print =
    ts.isBlock(guard.thenStatement) &&
    guard.thenStatement.statements.length === 1
      ? guard.thenStatement.statements[0]!
      : guard.thenStatement;
  if (
    !ts.isExpressionStatement(print) ||
    !ts.isCallExpression(print.expression) ||
    !identifier(print.expression.expression, "text") ||
    print.expression.arguments.length !== 1 ||
    !ts.isObjectLiteralExpression(print.expression.arguments[0]!) ||
    print.expression.arguments[0].properties.length !== 2
  )
    return false;
  const [index, error] = print.expression.arguments[0].properties;
  if (
    !index ||
    !ts.isShorthandPropertyAssignment(index) ||
    index.objectAssignmentInitializer ||
    index.name.text !== name ||
    !error ||
    !ts.isPropertyAssignment(error) ||
    !ts.isIdentifier(error.name) ||
    error.name.text !== "error"
  )
    return false;
  return ts.isCallExpression(error.initializer) &&
    identifier(error.initializer.expression, "String") &&
    error.initializer.arguments.length === 1 &&
    field(error.initializer.arguments[0]!, "reason")
    ? { index: name, count: join.arguments[0].elements.length }
    : false;
};

const forwardedNativeWrappers = (
  texts: string[],
  diagnostic?: { index: string; count: number },
) =>
  texts.flatMap((text): Row[] => {
    if (!text.trim()) return [];
    let value: Row;
    try {
      value = object(JSON.parse(text));
    } catch {
      assert.ok(
        /^Script (?:completed\b|running with cell ID\b)/u.test(text) &&
          text.includes("Output:\n") &&
          !text.slice(text.indexOf("Output:\n") + "Output:\n".length).trim(),
        "Joined native result needs complete original text blocks",
      );
      return [];
    }
    if (value.error !== undefined) {
      assert.ok(
        diagnostic &&
          Object.keys(value).length === 2 &&
          Object.hasOwn(value, diagnostic.index) &&
          Number.isInteger(value[diagnostic.index]) &&
          Number(value[diagnostic.index]) >= 0 &&
          Number(value[diagnostic.index]) < diagnostic.count &&
          typeof value.error === "string",
        "Joined diagnostic must retain its original index and error fields",
      );
      return [];
    }
    if (
      typeof value.output !== "string" ||
      (value.session_id === undefined && typeof value.exit_code !== "number")
    )
      assert.fail("Joined native result needs its original process wrapper");
    assert.ok(
      Object.keys(value).every((key) =>
        [
          "chunk_id",
          "wall_time_seconds",
          "session_id",
          "original_token_count",
          "output",
          "exit_code",
        ].includes(key),
      ),
      "Joined native result must retain its original process wrapper",
    );
    return [value];
  });

type OrderedInvocation = {
  operation: Exclude<NativeOperation, { kind: "cell" }>;
  throwsOnFailure: boolean;
};
const orderedNativeInvocations = (call: {
  name: string;
  arguments: string;
}): OrderedInvocation[] | null => {
  if (!/(?:^|[._])exec$/u.test(call.name)) return null;
  let input: Row;
  try {
    input = object(JSON.parse(call.arguments));
  } catch {
    input = { code: call.arguments };
  }
  const source = ts.createSourceFile(
    "native-ordered.ts",
    String(input.code ?? ""),
    ts.ScriptTarget.Latest,
    true,
  );
  const reserved = new Set([
    "tools",
    "text",
    "store",
    "load",
    "image",
    "JSON",
    "String",
    "Promise",
    "Math",
    "undefined",
    "Error",
  ]);
  let valid = true;
  const binding = (name: ts.BindingName) => {
    if (ts.isIdentifier(name)) {
      if (reserved.has(name.text)) valid = false;
    } else
      for (const element of name.elements)
        if (ts.isBindingElement(element)) binding(element.name);
  };
  const gather = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) || ts.isParameter(node))
      binding(node.name);
    ts.forEachChild(node, gather);
  };
  gather(source);
  if (!valid) return null;
  const direct = (node: ts.Statement) => {
    if (
      !ts.isExpressionStatement(node) ||
      !ts.isCallExpression(node.expression) ||
      !ts.isIdentifier(node.expression.expression) ||
      node.expression.expression.text !== "text" ||
      node.expression.arguments.length !== 1 ||
      !ts.isAwaitExpression(node.expression.arguments[0]!)
    )
      return false;
    const native = node.expression.arguments[0].expression;
    return (
      ts.isCallExpression(native) &&
      ts.isPropertyAccessExpression(native.expression) &&
      ts.isIdentifier(native.expression.expression) &&
      native.expression.expression.text === "tools" &&
      native.expression.name.text === "exec_command" &&
      native.arguments.length === 1 &&
      ts.isObjectLiteralExpression(native.arguments[0]!) &&
      nativeLiteral(native.arguments[0]!)
    );
  };
  const invocations: OrderedInvocation[] = [];
  for (let index = 0; index < source.statements.length; ) {
    const statement = source.statements[index]!;
    let end = index + 1;
    if (!direct(statement)) {
      if (!ts.isVariableStatement(statement)) return null;
      const boundary = source.statements.findIndex(
        (node, position) => position > index && direct(node),
      );
      end = boundary < 0 ? source.statements.length : boundary;
    }
    const code = source.statements
      .slice(index, end)
      .map((node) => node.getText(source))
      .join("\n");
    const operations = nativeOperations({ name: "exec", arguments: code });
    const operation = operations[0];
    if (
      operations.length !== 1 ||
      !operation ||
      operation.kind === "cell" ||
      (!direct(statement) && !operation.selfDraining) ||
      (operation.kind === "exec" &&
        (!operation.command || /[`$;&|\r\n]/u.test(operation.command))) ||
      (operation.kind === "process" &&
        (index !== 0 ||
          operation.handle === undefined ||
          operation.chars !== ""))
    )
      return null;
    invocations.push({
      operation,
      throwsOnFailure:
        !direct(statement) && ts.isIfStatement(source.statements[end - 1]!),
    });
    index = end;
  }
  return invocations.length > 1 ? invocations : null;
};

type SynchronousProof = Array<{
  operation: NativeOperation;
  wrapper: Row;
  processId: string;
  execOrdinal: number;
}>;
const synchronousProofs = new WeakMap<
  NativeTrace,
  {
    proofs: Map<number, SynchronousProof>;
    forwardedOutputs: boolean;
    traceChecksum: string;
    proofChecksum: string;
  }
>();
const nativeProjectionChecksum = (trace: NativeTrace) =>
  sha256(
    JSON.stringify({
      records: trace.records,
      calls: [...trace.calls.entries()],
      outputs: trace.outputs,
    }),
  );
const rememberSynchronousProofs = (
  trace: NativeTrace,
  proofs: Map<number, SynchronousProof>,
  forwardedOutputs = false,
) => {
  synchronousProofs.set(trace, {
    proofs,
    forwardedOutputs,
    traceChecksum: nativeProjectionChecksum(trace),
    proofChecksum: sha256(JSON.stringify([...proofs.entries()])),
  });
};

// A code-mode diagnostic can print stored CLI JSON without launching a process.
// Only read-only helpers are eligible; aliases cannot conceal a native call.
const readOnlyDiagnostic = (call: { name: string; arguments: string }) => {
  if (!/(?:^|[._])exec$/u.test(call.name)) return false;
  let input: Row;
  try {
    input = object(JSON.parse(call.arguments));
  } catch {
    input = { code: call.arguments };
  }
  const source = ts.createSourceFile(
    "native-diagnostic.ts",
    String(input.code ?? ""),
    ts.ScriptTarget.Latest,
    true,
  );
  const bindings = new Map<
    string,
    { initializer?: ts.Expression; projected: boolean }
  >();
  let valid = true;
  const bind = (
    name: ts.BindingName,
    initializer: ts.Expression | undefined,
    projected = false,
  ) => {
    if (ts.isIdentifier(name)) {
      if (bindings.has(name.text)) valid = false;
      bindings.set(name.text, { initializer, projected });
    } else {
      for (const element of name.elements)
        if (ts.isBindingElement(element)) bind(element.name, initializer, true);
    }
  };
  const gather = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) || ts.isParameter(node))
      bind(node.name, node.initializer);
    ts.forEachChild(node, gather);
  };
  gather(source);
  const helpers = new Set([
    "tools",
    "text",
    "store",
    "load",
    "image",
    "String",
    "JSON",
    "Promise",
    "Error",
    "undefined",
  ]);
  if ([...bindings.keys()].some((name) => helpers.has(name))) valid = false;
  const webRequest = (value: ts.Expression) => {
    const string = (node: ts.Expression) =>
      ts.isStringLiteralLike(node) && node.text.length > 0;
    const number = (node: ts.Expression) =>
      ts.isNumericLiteral(node) &&
      Number.isSafeInteger(Number(node.text)) &&
      Number(node.text) >= 0;
    const fields = (
      node: ts.Expression,
      allowed: Record<string, (value: ts.Expression) => boolean>,
      required: string[] = [],
    ) =>
      ts.isObjectLiteralExpression(node) &&
      required.every((key) =>
        node.properties.some(
          (property) =>
            property.name &&
            (ts.isIdentifier(property.name) ||
              ts.isStringLiteral(property.name)) &&
            property.name.text === key,
        ),
      ) &&
      node.properties.every(
        (property) =>
          ts.isPropertyAssignment(property) &&
          (ts.isIdentifier(property.name) ||
            ts.isStringLiteral(property.name)) &&
          Object.hasOwn(allowed, property.name.text) &&
          allowed[property.name.text]!(property.initializer),
      );
    const requests = (node: ts.Expression, search: boolean) =>
      ts.isArrayLiteralExpression(node) &&
      node.elements.length > 0 &&
      node.elements.every((entry) =>
        fields(
          entry,
          search
            ? {
                q: string,
                domains: (domain) =>
                  ts.isArrayLiteralExpression(domain) &&
                  domain.elements.every(string),
                recency: number,
              }
            : { ref_id: string, lineno: number },
          [search ? "q" : "ref_id"],
        ),
      );
    // Only published search/read options are admitted, as literal data. Web
    // results remain diagnostics and cannot establish a native process origin.
    return (
      ts.isObjectLiteralExpression(value) &&
      nativeLiteral(value) &&
      fields(value, {
        search_query: (node) => requests(node, true),
        open: (node) => requests(node, false),
        response_length: (node) =>
          ts.isStringLiteralLike(node) &&
          ["short", "medium", "long"].includes(node.text),
      }) &&
      value.properties.some(
        (property) =>
          property.name &&
          (ts.isIdentifier(property.name) ||
            ts.isStringLiteral(property.name)) &&
          ["search_query", "open"].includes(property.name.text),
      )
    );
  };
  type DataKind = "data" | "array" | "object" | "string" | "number" | "scalar";
  // Stored/parsed JSON and native read-only results contain data, not callable
  // members. Resolve local values so object methods cannot masquerade as String
  // or Array operations; callbacks are allowed only as the explicit map input.
  const data = (
    node: ts.Expression,
    seen = new Set<string>(),
  ): DataKind | undefined => {
    const read = (value: ts.Expression) => data(value, seen);
    if (ts.isParenthesizedExpression(node) || ts.isAwaitExpression(node))
      return read(node.expression);
    if (ts.isStringLiteralLike(node)) return "string";
    if (ts.isNumericLiteral(node)) return "number";
    if (
      [
        ts.SyntaxKind.TrueKeyword,
        ts.SyntaxKind.FalseKeyword,
        ts.SyntaxKind.NullKeyword,
      ].includes(node.kind)
    )
      return "scalar";
    if (ts.isIdentifier(node)) {
      if (node.text === "undefined") return "scalar";
      const binding = bindings.get(node.text);
      if (!binding || seen.has(node.text)) return undefined;
      const value = binding.initializer
        ? data(binding.initializer, new Set([...seen, node.text]))
        : "data";
      return value && (binding.projected ? "data" : value);
    }
    if (ts.isArrayLiteralExpression(node))
      return node.elements.every((value) => read(value)) ? "array" : undefined;
    if (ts.isObjectLiteralExpression(node))
      return node.properties.every((property) =>
        ts.isPropertyAssignment(property)
          ? !ts.isComputedPropertyName(property.name) &&
            !!read(property.initializer)
          : ts.isShorthandPropertyAssignment(property) && !!read(property.name),
      )
        ? "object"
        : undefined;
    if (ts.isPropertyAccessExpression(node))
      return read(node.expression)
        ? node.name.text === "length"
          ? "number"
          : "data"
        : undefined;
    if (ts.isElementAccessExpression(node))
      return read(node.expression) && read(node.argumentExpression)
        ? "data"
        : undefined;
    if (ts.isBinaryExpression(node)) {
      if (
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
      )
        return undefined;
      const left = read(node.left);
      const right = read(node.right);
      return left && right
        ? node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
          (left === "string" || right === "string")
          ? "string"
          : "scalar"
        : undefined;
    }
    if (ts.isNewExpression(node))
      return ts.isIdentifier(node.expression) &&
        node.expression.text === "Error" &&
        (node.arguments ?? []).every((value) => read(value))
        ? "object"
        : undefined;
    if (!ts.isCallExpression(node)) return undefined;
    const callee = node.expression;
    const args = node.arguments;
    if (!args.every((value) => ts.isArrowFunction(value) || read(value)))
      return undefined;
    if (ts.isIdentifier(callee)) {
      if (
        callee.text === "load" &&
        args.length === 1 &&
        ts.isStringLiteral(args[0]!)
      )
        return "data";
      if (
        callee.text === "String" &&
        args.length <= 1 &&
        args.every((value) => read(value))
      )
        return "string";
      return undefined;
    }
    if (!ts.isPropertyAccessExpression(callee)) return undefined;
    if (ts.isIdentifier(callee.expression)) {
      if (callee.expression.text === "tools") {
        if (
          callee.name.text === "view_image" &&
          args.length === 1 &&
          read(args[0]!)
        )
          return "object";
        if (
          callee.name.text === "clock__curr_time" &&
          args.length === 1 &&
          ts.isObjectLiteralExpression(args[0]!) &&
          args[0]!.properties.length === 0
        )
          return "object";
        if (
          callee.name.text === "web__run" &&
          node.questionDotToken === undefined &&
          callee.questionDotToken === undefined &&
          args.length === 1 &&
          webRequest(args[0]!)
        )
          return "object";
        return undefined;
      }
      if (
        callee.expression.text === "JSON" &&
        args.length === 1 &&
        read(args[0]!)
      )
        return callee.name.text === "parse"
          ? "data"
          : callee.name.text === "stringify"
            ? "string"
            : undefined;
      if (
        callee.expression.text === "Promise" &&
        callee.name.text === "allSettled" &&
        args.length === 1 &&
        read(args[0]!) === "array"
      )
        return "array";
    }
    const receiver = read(callee.expression);
    if (
      callee.name.text === "map" &&
      (receiver === "data" || receiver === "array") &&
      args.length === 1 &&
      ts.isArrowFunction(args[0]!) &&
      !ts.isBlock(args[0]!.body) &&
      read(args[0]!.body)
    )
      return "array";
    if (!args.every((value) => read(value))) return undefined;
    if (callee.name.text === "join" && receiver === "array" && args.length <= 1)
      return "string";
    if (receiver !== "string" && receiver !== "array") return undefined;
    if (callee.name.text === "slice" && args.length <= 2) return receiver;
    if (callee.name.text === "indexOf" && args.length >= 1 && args.length <= 2)
      return "number";
    return undefined;
  };
  const visit = (node: ts.Node) => {
    if (
      node.kind === ts.SyntaxKind.ThisKeyword ||
      ts.isDeleteExpression(node) ||
      ts.isTaggedTemplateExpression(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isImportDeclaration(node) ||
      ts.isImportEqualsDeclaration(node) ||
      ts.isExportDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node) ||
      ((ts.isForOfStatement(node) || ts.isForInStatement(node)) &&
        !ts.isVariableDeclarationList(node.initializer)) ||
      (ts.isVariableDeclaration(node) &&
        node.initializer &&
        !data(node.initializer)) ||
      (ts.isArrowFunction(node) &&
        !(
          ts.isCallExpression(node.parent) &&
          node.parent.arguments[0] === node &&
          data(node.parent)
        )) ||
      (ts.isNewExpression(node) &&
        !(
          ts.isIdentifier(node.expression) && node.expression.text === "Error"
        )) ||
      (ts.isPropertyAccessExpression(node) &&
        ["constructor", "prototype", "__proto__"].includes(node.name.text)) ||
      (ts.isBinaryExpression(node) &&
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) ||
      ((ts.isPrefixUnaryExpression(node) ||
        ts.isPostfixUnaryExpression(node)) &&
        [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(
          node.operator,
        ) &&
        !(ts.isIdentifier(node.operand) && data(node.operand) === "number"))
    )
      valid = false;
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const direct =
        ts.isIdentifier(callee) &&
        ["text", "store", "image"].includes(callee.text) &&
        node.arguments.every((value) => data(value));
      if (!direct && !data(node)) valid = false;
    }
    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      const key =
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (ts.isPropertyAssignment(parent) && parent.name === node) ||
        (ts.isBindingElement(parent) && parent.propertyName === node);
      if (!key && helpers.has(node.text)) {
        const direct =
          ts.isCallExpression(parent) && parent.expression === node;
        const member =
          ts.isPropertyAccessExpression(parent) &&
          parent.expression === node &&
          ts.isCallExpression(parent.parent) &&
          parent.parent.expression === parent;
        if (
          !(node.text === "Error"
            ? ts.isNewExpression(parent) && parent.expression === node
            : node.text === "undefined"
              ? ts.isBinaryExpression(parent) &&
                parent.right === node &&
                parent.operatorToken.kind ===
                  ts.SyntaxKind.ExclamationEqualsEqualsToken
              : ["text", "store", "load", "image", "String"].includes(node.text)
                ? direct
                : member)
        )
          valid = false;
      } else if (!key && !bindings.has(node.text) && !helpers.has(node.text))
        valid = false;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return valid;
};

// Complete stdout still needs its source forwarding proof. UI identity cannot
// turn an alias, an uncalled closure, or a rewritten result into a native call.
const unchangedNativeForwarding = (
  call: { name: string; arguments: string },
  cwd: string,
) => {
  const operations = nativeOperations(call);
  if (!/(?:^|[._])exec$/u.test(call.name))
    return operations.every((operation) =>
      operation.kind === "exec"
        ? operation.command !== undefined
        : operation.handle !== undefined &&
          (operation.kind === "cell" || operation.chars === ""),
    );
  if (
    (operations.length === 1 &&
      operations[0]!.kind !== "cell" &&
      operations[0]!.selfDraining) ||
    orderedNativeInvocations(call) ||
    synchronousInvocations(call, cwd)
  )
    return true;
  let input: Row;
  try {
    input = object(JSON.parse(call.arguments));
  } catch {
    input = { code: call.arguments };
  }
  const source = ts.createSourceFile(
    "native-original-forwarding.ts",
    String(input.code ?? ""),
    ts.ScriptTarget.Latest,
    true,
  );
  const literalCall = (node: ts.Node | undefined) =>
    node &&
    ts.isAwaitExpression(node) &&
    ts.isCallExpression(node.expression) &&
    ts.isPropertyAccessExpression(node.expression.expression) &&
    ts.isIdentifier(node.expression.expression.expression) &&
    node.expression.expression.expression.text === "tools" &&
    ["exec_command", "write_stdin"].includes(
      node.expression.expression.name.text,
    ) &&
    node.expression.arguments.length === 1 &&
    ts.isObjectLiteralExpression(node.expression.arguments[0]!) &&
    nativeLiteral(node.expression.arguments[0]!);
  const printed = (node: ts.Statement | undefined) =>
    node &&
    ts.isExpressionStatement(node) &&
    ts.isCallExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "text" &&
    node.expression.arguments.length === 1
      ? node.expression.arguments[0]
      : undefined;
  if (literalCall(printed(source.statements.at(-1)))) {
    const prefix = source.statements
      .slice(0, -1)
      .map((node) => node.getText(source))
      .join("\n");
    return readOnlyDiagnostic({ name: "exec", arguments: prefix });
  }
  // Legacy wait forwarding serializes one unchanged literal empty wait. Its
  // declaration and print are the entire cell, so no alias can mutate it.
  if (source.statements.length !== 2) return false;
  const statement = source.statements[0]!;
  if (
    !ts.isVariableStatement(statement) ||
    statement.declarationList.declarations.length !== 1
  )
    return false;
  const binding = statement.declarationList.declarations[0]!;
  const value = printed(source.statements[1]);
  if (
    !ts.isIdentifier(binding.name) ||
    [
      "tools",
      "text",
      "JSON",
      "store",
      "load",
      "image",
      "Promise",
      "String",
      "Error",
      "undefined",
    ].includes(binding.name.text) ||
    operations.length !== 1 ||
    operations[0]!.kind !== "process" ||
    !literalCall(binding.initializer) ||
    !value
  )
    return false;
  const original = (node: ts.Node) =>
    ts.isIdentifier(node) && node.text === binding.name.getText(source);
  return (
    original(value) ||
    (ts.isCallExpression(value) &&
      ts.isPropertyAccessExpression(value.expression) &&
      ts.isIdentifier(value.expression.expression) &&
      value.expression.expression.text === "JSON" &&
      value.expression.name.text === "stringify" &&
      value.arguments.length === 1 &&
      original(value.arguments[0]!))
  );
};

const proveSynchronousInvocations = (
  trace: NativeTrace,
  input: CodexUiInput,
  rows: Row[],
) => {
  const proofs = new Map<number, SynchronousProof>();
  const items = rows
    .map((row, index) => ({
      row,
      index,
      params: object(row.params),
      item: object(object(row.params).item),
    }))
    .filter(({ item }) => item.type === "commandExecution");
  const priorProcesses: Array<{
    launched: number;
    began: number;
    start: (typeof items)[number];
    end: (typeof items)[number];
  }> = [];
  const used = new Set<string>();
  for (const output of commandOutputs(trace)) {
    const call = trace.calls.get(output.callId)!;
    const operations = nativeOperations(call);
    if (operations.length === 0 && /(?:^|[._])exec$/u.test(call.name)) {
      assert.ok(
        readOnlyDiagnostic(call),
        "Code-mode output needs a read-only native diagnostic origin",
      );
      const raw = object(trace.records[output.index]!.payload);
      const blocks = raw.output ?? raw.content;
      const headers = (Array.isArray(blocks) ? blocks : [blocks]).map(
        (block) =>
          typeof block === "string" ? block : String(object(block).text ?? ""),
      );
      assert.ok(
        headers.some((value) => /^Script completed\b/mu.test(value)) &&
          headers.every(
            (value) =>
              !/^(?:Script running with cell ID|Process running with session ID)/mu.test(
                value,
              ),
          ),
        "Read-only native diagnostic needs its completed original cell",
      );
      const payload = object(trace.records[call.index]!.payload);
      const turnId =
        payload.turn_id ??
        object(payload.internal_chat_message_metadata_passthrough).turn_id;
      assert.ok(
        typeof turnId === "string" && turnId.length > 0,
        "Read-only native diagnostic has no original Root turn",
      );
      assert.equal(
        object(raw.internal_chat_message_metadata_passthrough).turn_id,
        turnId,
        "Read-only native diagnostic result changed Root turn",
      );
      const launched = time(trace.records[call.index]!.timestamp);
      assert.ok(launched <= output.timestamp);
      const turnRows = rows
        .map((row, index) => ({
          row,
          index,
          params: object(row.params),
          turn: object(object(row.params).turn),
        }))
        .filter(
          ({ params, turn }) =>
            params.threadId === input.sessionId && turn.id === turnId,
        );
      const opened = turnRows.filter(
        ({ row }) => row.method === "turn/started",
      );
      const closed = turnRows.filter(
        ({ row }) => row.method === "turn/completed",
      );
      assert.ok(
        opened.length === 1 &&
          closed.length === 1 &&
          opened[0]!.index < closed[0]!.index &&
          opened[0]!.turn.status === "inProgress" &&
          closed[0]!.turn.status === "completed" &&
          opened[0]!.turn.startedAt === closed[0]!.turn.startedAt &&
          time(opened[0]!.turn.startedAt) <= launched &&
          output.timestamp <= time(closed[0]!.turn.completedAt),
        "Read-only native diagnostic needs its complete original Root turn",
      );
      const rootItems = items.filter(
        ({ params }) => params.threadId === input.sessionId,
      );
      const starts = rootItems.filter(
        ({ row }) => row.method === "item/started",
      );
      const ends = rootItems.filter(
        ({ row }) => row.method === "item/completed",
      );
      assert.equal(
        starts.length,
        ends.length,
        "Read-only native diagnostic needs complete native command inventory",
      );
      for (const start of starts) {
        const matching = ends.filter(({ item }) => item.id === start.item.id);
        assert.equal(
          starts.filter(({ item }) => item.id === start.item.id).length,
          1,
        );
        assert.equal(matching.length, 1);
        const end = matching[0]!;
        assert.equal(start.params.turnId, end.params.turnId);
        const began = z.number().finite().parse(start.params.startedAtMs);
        const ended = z.number().finite().parse(end.params.completedAtMs);
        assert.ok(start.index < end.index && began <= ended);
        if (ended < launched || began > output.timestamp) continue;
        assert.ok(
          began < launched,
          "Read-only native diagnostic overlaps a new native command",
        );
        priorProcesses.push({ launched, began, start, end });
      }
      proofs.set(output.index, []);
      continue;
    }
    if (
      !operations.some(
        (operation) =>
          operation.kind === "process" && operation.handle === undefined,
      )
    )
      continue;
    const invocations = synchronousInvocations(call, input.workspace);
    if (!invocations) continue;
    const raw = object(trace.records[output.index]!.payload).output;
    const texts = (Array.isArray(raw) ? raw : [raw])
      .map((block) => (typeof block === "string" ? block : object(block).text))
      .filter((value): value is string => typeof value === "string");
    if (
      !texts[0]?.startsWith("Script completed\n") ||
      texts.some((value) =>
        /^Script running with cell ID|^Process running with session ID/mu.test(
          value,
        ),
      )
    )
      continue;
    const wrappers = texts.flatMap((value) => {
      try {
        const wrapper = object(JSON.parse(value));
        return typeof wrapper.output === "string" &&
          (typeof wrapper.exit_code === "number" ||
            wrapper.session_id !== undefined)
          ? [wrapper]
          : [];
      } catch {
        return [];
      }
    });
    if (
      wrappers.length !== invocations.length ||
      wrappers.some(
        (wrapper) =>
          wrapper.session_id !== undefined ||
          !Number.isInteger(wrapper.exit_code) ||
          truncated.test(String(wrapper.output)),
      )
    )
      continue;
    const origin = object(trace.records[call.index]!.payload);
    const turnId =
      origin.turn_id ??
      object(origin.internal_chat_message_metadata_passthrough).turn_id;
    assert.ok(
      typeof turnId === "string" && turnId.length > 0,
      "Synchronous native origin has no Root turn identity",
    );
    const launchAt = time(trace.records[call.index]!.timestamp);
    const within = items.filter(
      ({ params }) =>
        params.threadId === input.sessionId &&
        params.turnId === turnId &&
        Number(params.startedAtMs ?? params.completedAtMs) >= launchAt &&
        Number(params.startedAtMs ?? params.completedAtMs) <= output.timestamp,
    );
    const starts = within.filter(({ row }) => row.method === "item/started");
    const ends = within.filter(({ row }) => row.method === "item/completed");
    assert.equal(
      starts.length,
      invocations.length,
      "Synchronous native command inventory is incomplete or duplicated",
    );
    assert.equal(
      ends.length,
      invocations.length,
      "Synchronous native command inventory is incomplete or duplicated",
    );
    let previousEnd = launchAt;
    const proof: SynchronousProof = [];
    for (const [index, invocation] of invocations.entries()) {
      assert.equal(
        invocation.cwd,
        input.workspace,
        "Synchronous native command must retain the verified session cwd",
      );
      const wrapper = wrappers[index]!;
      if (invocation.conditionalOn) {
        const owner = invocations.findIndex(
          (value) => value.binding === invocation.conditionalOn,
        );
        assert.ok(
          owner >= 0 && owner < index && wrappers[owner]!.exit_code === 0,
          "Synchronous native conditional invocation has no successful original owner",
        );
      }
      const matching = starts.filter(
        ({ item }) =>
          shellBody(String(item.command)) === invocation.command &&
          item.cwd === invocation.cwd,
      );
      assert.equal(
        matching.length,
        1,
        "Synchronous native invocation has no unique original UI command",
      );
      const start = matching[0]!;
      const completions = ends.filter(({ item }) => item.id === start.item.id);
      assert.equal(
        completions.length,
        1,
        "Synchronous native command has no unique original UI completion",
      );
      const end = completions[0]!;
      assert.ok(
        !used.has(String(start.item.id)),
        "Synchronous native command was reused by another invocation",
      );
      used.add(String(start.item.id));
      for (const entry of [start, end]) {
        assert.equal(entry.params.threadId, input.sessionId);
        assert.equal(entry.params.turnId, turnId);
        assert.equal(entry.item.cwd, invocation.cwd);
        assert.equal(shellBody(String(entry.item.command)), invocation.command);
      }
      const processId = z.string().min(1).parse(end.item.processId);
      assert.equal(
        start.item.processId,
        processId,
        "Synchronous native command changed process identity",
      );
      assert.equal(
        items.filter(
          ({ row, item }) =>
            row.method === "item/completed" && item.processId === processId,
        ).length,
        1,
        "Synchronous native process has duplicate terminal results",
      );
      const started = z.number().finite().parse(start.params.startedAtMs);
      const ended = z.number().finite().parse(end.params.completedAtMs);
      assert.ok(
        start.index < end.index &&
          started >= previousEnd &&
          ended >= started &&
          ended <= output.timestamp &&
          ended - started <= invocation.yieldMs,
        "Synchronous native command order or terminal-before-yield proof is invalid",
      );
      previousEnd = ended;
      assert.equal(start.item.status, "inProgress");
      assert.equal(
        end.item.status,
        wrapper.exit_code === 0 ? "completed" : "failed",
      );
      assert.equal(
        end.item.exitCode,
        wrapper.exit_code,
        "Synchronous native exit code differs from its original UI process",
      );
      assert.equal(
        end.item.aggregatedOutput,
        wrapper.output,
        "Synchronous native stdout differs from its original UI process",
      );
      const deltas = rows
        .map((row, index) => ({ row, index, params: object(row.params) }))
        .filter(
          ({ row, params }) =>
            row.method === "item/commandExecution/outputDelta" &&
            params.itemId === start.item.id,
        );
      for (const delta of deltas) {
        assert.ok(
          start.index < delta.index && delta.index < end.index,
          "Synchronous native stdout lies outside its original process lifetime",
        );
        assert.equal(delta.params.threadId, input.sessionId);
        assert.equal(delta.params.turnId, turnId);
      }
      assert.equal(
        deltas.map(({ params }) => z.string().parse(params.delta)).join(""),
        wrapper.output,
        "Synchronous native stdout has an incomplete original UI capture",
      );
      proof.push({
        operation: {
          kind: "exec",
          command: invocation.command,
          cwd: invocation.cwd,
        },
        wrapper,
        processId,
        execOrdinal: index,
      });
    }
    proofs.set(output.index, proof);
  }
  if (priorProcesses.length) {
    const provisional = { ...trace };
    unstartedOuterProofs.set(provisional, unstartedOuterProofs.get(trace)!);
    rememberSynchronousProofs(provisional, new Map(proofs));
    const original = commandOrigins(provisional);
    for (const { launched, began, start, end } of priorProcesses) {
      assert.ok(
        items.filter(
          ({ row, item }) =>
            row.method === "item/started" && item.id === start.item.id,
        ).length === 1 &&
          items.filter(
            ({ row, item }) =>
              row.method === "item/completed" && item.id === end.item.id,
          ).length === 1 &&
          items.filter(
            ({ row, item }) =>
              row.method === "item/completed" &&
              String(item.processId) === String(end.item.processId),
          ).length === 1,
        "Read-only native diagnostic needs one unique original UI process",
      );
      const known = original.filter(
        (value) =>
          value.timestamp <= launched &&
          value.processId === String(end.item.processId),
      );
      assert.ok(
        known.length > 0 &&
          new Set(known.map((value) => value.originCallId)).size === 1,
        "Read-only native diagnostic overlaps an unknown native command",
      );
      const origin = trace.calls.get(known[0]!.originCallId)!;
      const operation = nativeOperations(origin);
      assert.ok(
        operation.length === 1 &&
          operation[0]!.kind === "exec" &&
          operation[0]!.command === shellBody(String(start.item.command)) &&
          (operation[0]!.cwd === input.workspace ||
            (operation[0]!.cwd === undefined &&
              operation[0]!.selfDraining === true)) &&
          start.item.cwd === input.workspace &&
          end.item.cwd === input.workspace &&
          end.item.command === start.item.command &&
          (start.item.processId == null ||
            String(start.item.processId) === String(end.item.processId)) &&
          time(trace.records[origin.index]!.timestamp) <= began,
        "Read-only native diagnostic needs the original prior process launch",
      );
      const originPayload = object(trace.records[origin.index]!.payload);
      assert.equal(
        originPayload.turn_id ??
          object(originPayload.internal_chat_message_metadata_passthrough)
            .turn_id,
        start.params.turnId,
      );
      const results = original.filter(
        (value) => value.processId === String(end.item.processId),
      );
      assert.equal(
        results.map((value) => value.stdout).join(""),
        end.item.aggregatedOutput,
        "Read-only native diagnostic prior process changed complete stdout",
      );
      const exits = results
        .flatMap((value) => value.objects)
        .filter((value) => typeof value.exit_code === "number");
      assert.ok(
        exits.length > 0 &&
          exits.every((value) => value.exit_code === end.item.exitCode) &&
          end.item.status ===
            (end.item.exitCode === 0 ? "completed" : "failed"),
        "Read-only native diagnostic prior process changed terminal exit",
      );
      const deltas = rows
        .map((row, index) => ({ row, index, params: object(row.params) }))
        .filter(
          ({ row, params }) =>
            row.method === "item/commandExecution/outputDelta" &&
            params.itemId === end.item.id,
        );
      assert.ok(
        deltas.every(
          ({ index, params }) =>
            start.index < index &&
            index < end.index &&
            params.threadId === input.sessionId &&
            params.turnId === start.params.turnId,
        ),
        "Read-only native diagnostic prior process changed stdout lineage",
      );
      assert.equal(
        deltas.map(({ params }) => z.string().parse(params.delta)).join(""),
        end.item.aggregatedOutput,
        "Read-only native diagnostic prior process has incomplete original stdout",
      );
    }
  }
  return proofs;
};

// A result keeps its real index/time. Only its command origin follows the
// native cell/process handles; copied CLI JSON cannot establish an origin.
function commandOrigins(trace: ReturnType<typeof nativeTrace>) {
  const synchronous = synchronousProofs.get(trace);
  if (synchronous) {
    assert.equal(
      nativeProjectionChecksum(trace),
      synchronous.traceChecksum,
      "Authenticated synchronous native evidence changed",
    );
    assert.equal(
      sha256(JSON.stringify([...synchronous.proofs.entries()])),
      synchronous.proofChecksum,
      "Authenticated synchronous native proof changed",
    );
  }
  type Owner = {
    originCallId: string;
    invocationCallId: string;
    operation: NativeOperation;
    sequence?: {
      invocations: OrderedInvocation[];
      next: number;
      processes: Map<number, string>;
    };
  };
  const cells = new Map<string, Owner>();
  const processes = new Map<string, string>();
  const originProcesses = new Map<string, string>();
  const origins = new Map<string, Owner>();
  const outputs = commandOutputs(trace)
    .map((output) => {
      const terminal = synchronous?.proofs.get(output.index);
      if (terminal?.length === 0)
        return {
          ...output,
          originCallId: output.callId,
          originCommand: undefined,
          processId: undefined,
          stdout: "",
          objects: [] as Row[],
        };
      const failure = unstartedOuterProofs.get(trace)?.get(output.index);
      if (failure !== undefined) {
        assert.equal(
          outerFailureChecksum(trace, output.index),
          failure,
          "Authenticated failed outer evidence changed",
        );
        return {
          ...output,
          originCallId: output.callId,
          originCommand: undefined,
          processId: undefined,
          stdout: "",
          objects: [] as Row[],
        };
      }
      const rawResult = object(trace.records[output.index]!.payload);
      const blocks =
        rawResult.output ??
        rawResult.content ??
        trace.records[output.index]!.content;
      const nativeTexts = (Array.isArray(blocks) ? blocks : [blocks]).flatMap(
        (block) =>
          typeof block === "string"
            ? [block]
            : typeof object(block).text === "string"
              ? [String(object(block).text)]
              : [],
      );
      assert.ok(
        nativeTexts.every(
          (value) =>
            !/^Script (?:completed|running|failed)\b/u.test(value) ||
            !/(?:^|\n)(?:Final output|Output):\n\s*\S/u.test(value),
        ),
        "Native Script header cannot contain a result payload",
      );
      if (terminal)
        return terminal.map(
          ({ wrapper, processId, operation, execOrdinal }) => ({
            ...output,
            originCallId: output.callId,
            originCommand:
              operation.kind === "exec" ? operation.command : undefined,
            originCwd: operation.kind === "exec" ? operation.cwd : undefined,
            originExecOrdinal: execOrdinal,
            processId,
            stdout: String(wrapper.output),
            nativeExitCodes: [Number(wrapper.exit_code)],
            objects: outputObjects(wrapper),
          }),
        );
      const call = trace.calls.get(output.callId)!;
      let owner = origins.get(output.callId);
      const operation = nativeOperations(call).find(
        (value) => value.kind === "cell",
      );
      if (!owner && operation?.kind === "cell")
        owner = cells.get(operation.handle ?? "");
      const ordered =
        owner?.sequence?.invocations ?? orderedNativeInvocations(call);
      if (ordered) {
        if (!owner) {
          const first = ordered[0]!.operation;
          const origin =
            first.kind === "process"
              ? processes.get(first.handle ?? "")
              : output.callId;
          assert.ok(origin, "Native wait has no original process handle");
          owner = {
            originCallId: origin,
            invocationCallId: output.callId,
            operation: first,
            sequence: {
              invocations: ordered,
              next: 0,
              processes: new Map(),
            },
          };
        }
        assert.ok(
          owner.sequence,
          "Ordered native result lost its original sequence",
        );
        origins.set(output.callId, owner);
        const sequence = owner.sequence;
        const running = nativeTexts.flatMap((value) =>
          [
            ...value
              .split("Output:\n")[0]!
              .matchAll(/^Script running with cell ID (\S+)/gmu),
          ].map((match) => match[1]!),
        );
        assert.ok(running.length <= 1, "Ambiguous native cell result");
        const wrappers = forwardedNativeWrappers(nativeTexts);
        const results = wrappers.map((wrapper) => {
          const ordinal = sequence.next;
          const invocation = sequence.invocations[ordinal];
          assert.ok(invocation, "Ordered native result set is duplicated");
          const current = invocation.operation;
          assert.ok(
            !(
              wrapper.session_id !== undefined &&
              typeof wrapper.exit_code === "number"
            ),
            "A completed native process cannot retain a running handle",
          );
          if (current.kind === "exec")
            owner!.originCallId = owner!.invocationCallId;
          owner!.operation = current;
          let process =
            current.kind === "process"
              ? current.handle
              : sequence.processes.get(ordinal);
          if (wrapper.session_id !== undefined) {
            assert.ok(
              typeof wrapper.session_id === "string" ||
                typeof wrapper.session_id === "number",
              "Native process result has no original handle",
            );
            process = String(wrapper.session_id);
            assert.ok(
              sequence.processes.get(ordinal) === undefined ||
                sequence.processes.get(ordinal) === process,
              "Ordered invocation changed its original process handle",
            );
            sequence.processes.set(ordinal, process);
            if (current.kind === "process")
              assert.equal(
                process,
                current.handle,
                "Native process wait returned a different handle",
              );
            if (!current.selfDraining)
              assert.equal(
                ordinal,
                sequence.invocations.length - 1,
                "Ordered native pending result must be its last invocation",
              );
            const existing = processes.get(process);
            assert.ok(
              existing === undefined || existing === owner!.originCallId,
              "Native process handle changed origin",
            );
            processes.set(process, owner!.originCallId);
            originProcesses.set(owner!.originCallId, process);
          }
          if (typeof wrapper.exit_code === "number") {
            if (invocation.throwsOnFailure)
              assert.equal(
                wrapper.exit_code,
                0,
                "Ordered failed drain cannot execute a following invocation",
              );
            if (process) processes.delete(process);
          }
          const result = {
            ...output,
            originCallId: owner!.originCallId,
            originCommand:
              current.kind === "exec" ? current.command : undefined,
            originCwd: current.kind === "exec" ? current.cwd : undefined,
            originExecOrdinal:
              current.kind === "exec"
                ? sequence.invocations
                    .slice(0, ordinal)
                    .filter(({ operation }) => operation.kind === "exec").length
                : undefined,
            processId: process,
            stdout: String(wrapper.output),
            nativeExitCodes:
              typeof wrapper.exit_code === "number" ? [wrapper.exit_code] : [],
            objects: outputObjects(wrapper),
            orderedBatch: true,
            orderedInvocationCallId: owner!.invocationCallId,
            orderedOrdinal: ordinal,
            orderedExitCode:
              typeof wrapper.exit_code === "number"
                ? wrapper.exit_code
                : undefined,
          };
          if (!current.selfDraining || typeof wrapper.exit_code === "number")
            sequence.next += 1;
          return result;
        });
        if (running[0]) {
          assert.ok(
            !cells.has(running[0]) || cells.get(running[0]) === owner,
            "Native cell handle changed origin",
          );
          cells.set(running[0], owner);
        } else {
          if (operation?.kind === "cell") cells.delete(operation.handle!);
          assert.equal(
            sequence.next,
            sequence.invocations.length,
            "Ordered native result set is incomplete",
          );
        }
        return results.length
          ? results
          : [
              {
                ...output,
                originCallId: owner.originCallId,
                originCommand: undefined,
                processId:
                  owner.operation.kind === "process"
                    ? owner.operation.handle
                    : undefined,
                stdout: "",
                objects: [] as Row[],
                orderedBatch: true,
                orderedInvocationCallId: owner.invocationCallId,
                orderedOrdinal: sequence.next,
                orderedExitCode: undefined,
              },
            ];
      }
      if (!owner) {
        const operations = nativeOperations(call);
        const waits = operations.filter(
          (operation) => operation.kind !== "exec",
        );
        assert.ok(waits.length <= 1, "Ambiguous native handle wait invocation");
        const operation = waits[0] ??
          operations[0] ?? { kind: "exec" as const };
        let originCallId = output.callId;
        if (operation.kind === "cell") {
          const original = cells.get(operation.handle ?? "");
          assert.ok(original, "Native wait has no original cell handle");
          owner = original;
        } else {
          if (operation.kind === "process") {
            assert.equal(
              operation.chars,
              "",
              "Production process waits must be read-only",
            );
            const original = processes.get(operation.handle ?? "");
            assert.ok(original, "Native wait has no original process handle");
            originCallId = original;
          }
          owner = { originCallId, invocationCallId: output.callId, operation };
        }
        origins.set(output.callId, owner);
      }
      const raw = object(trace.records[output.index]!.payload);
      const result =
        raw.output ?? raw.content ?? trace.records[output.index]!.content;
      const directPacket =
        /(?:^|[._])(?:exec_command|write_stdin)$/u.test(call.name) &&
        typeof result === "string" &&
        result.startsWith("Chunk ID: ");
      const direct = directPacket
        ? /^Chunk ID: \S+\nWall time: \d+(?:\.\d+)? seconds\nProcess (?:exited with code -?\d+|running with session ID \S+)\n(?:Original token count: \d+\n)?(?:Final output|Output):\n([\s\S]*)$/u.exec(
            String(result),
          )
        : null;
      if (directPacket)
        assert.ok(
          direct,
          "Native direct result needs its exact process header",
        );
      const texts = (Array.isArray(result) ? result : [result]).flatMap(
        (block) =>
          typeof block === "string"
            ? [block]
            : typeof object(block).text === "string"
              ? [String(object(block).text)]
              : [],
      );
      const headers = texts.map(
        (value) => value.split(/(?:Final output|Output):\n/u)[0]!,
      );
      const cell = headers.flatMap((value) =>
        [...value.matchAll(/^Script running with cell ID (\S+)/gmu)].map(
          (match) => match[1]!,
        ),
      );
      assert.ok(cell.length <= 1, "Ambiguous native cell result");
      if (cell[0]) {
        assert.ok(
          !cells.has(cell[0]) || cells.get(cell[0]) === owner,
          "Native cell handle changed origin",
        );
        cells.set(cell[0], owner);
      } else {
        const operation = nativeOperations(call).find(
          (value) => value.kind === "cell",
        );
        if (operation?.kind === "cell") cells.delete(operation.handle!);
      }
      const batchResult = indexedBatchResult(
        trace.calls.get(owner.invocationCallId)!,
        texts,
      );
      if (batchResult) owner.operation = batchResult.operation;
      const joinedWrappers =
        owner.operation.kind === "exec" && owner.operation.joinedDiagnostics
          ? forwardedNativeWrappers(texts, owner.operation.joinedDiagnostics)
          : undefined;
      // A primitive packet's stdout may quote process-like JSON. Its single
      // host header supplies process state; quoted data cannot supply wrappers.
      const wrappers =
        direct !== null
          ? []
          : (batchResult?.wrappers ??
            joinedWrappers ??
            output.objects.filter(
              (value) =>
                typeof value.output === "string" &&
                (value.session_id !== undefined ||
                  typeof value.exit_code === "number"),
            ));
      const pending = [
        ...wrappers
          .filter((value) => value.session_id !== undefined)
          .map((value) => String(value.session_id)),
        ...headers.flatMap((value) =>
          [...value.matchAll(/^Process running with session ID (\S+)/gmu)].map(
            (match) => match[1]!,
          ),
        ),
      ];
      assert.ok(new Set(pending).size <= 1, "Ambiguous native process result");
      for (const process of pending) {
        if (owner.operation.kind === "process")
          assert.equal(
            process,
            owner.operation.handle,
            "Native process wait returned a different handle",
          );
        const existing = processes.get(process);
        assert.ok(
          existing === undefined || existing === owner.originCallId,
          "Native process handle changed origin",
        );
        processes.set(process, owner.originCallId);
        originProcesses.set(owner.originCallId, process);
      }
      const exits = [
        ...wrappers
          .filter((value) => typeof value.exit_code === "number")
          .map((value) => Number(value.exit_code)),
        ...headers.flatMap((value) =>
          [...value.matchAll(/^Process exited with code (-?\d+)/gmu)].map(
            (match) => Number(match[1]!),
          ),
        ),
      ];
      if (exits.length) {
        const selfDraining =
          owner.operation.kind !== "cell" && owner.operation.selfDraining;
        if (selfDraining) {
          const exitIndex = wrappers.findIndex(
            (value) => typeof value.exit_code === "number",
          );
          assert.ok(
            exitIndex === wrappers.length - 1 &&
              wrappers.every(
                (value) =>
                  !(
                    value.session_id !== undefined &&
                    typeof value.exit_code === "number"
                  ),
              ),
            "Self-draining result must end at its completed original process",
          );
        }
        assert.ok(
          (pending.length === 0 || selfDraining) && cell.length === 0,
          "A completed native process cannot retain a running handle",
        );
        if (owner.operation.kind === "process")
          processes.delete(owner.operation.handle!);
        if (selfDraining) {
          const process = originProcesses.get(owner.originCallId);
          if (process && processes.get(process) === owner.originCallId)
            processes.delete(process);
        }
      }
      const originalExecs = nativeOperations(
        trace.calls.get(owner.originCallId)!,
      ).filter((operation) => operation.kind === "exec");
      const matchingExecs = originalExecs.filter(
        (operation) =>
          owner.operation.kind === "exec" &&
          operation.command === owner.operation.command,
      );
      return {
        ...output,
        originCallId: owner.originCallId,
        originCommand:
          owner.operation.kind === "exec" ? owner.operation.command : undefined,
        originCwd:
          owner.operation.kind === "exec" ? owner.operation.cwd : undefined,
        originExecOrdinal:
          batchResult?.execOrdinal ??
          (owner.operation.kind === "exec" && matchingExecs.length === 1
            ? originalExecs.indexOf(matchingExecs[0]!)
            : undefined),
        processId:
          owner.operation.kind === "process"
            ? owner.operation.handle
            : originProcesses.get(owner.originCallId),
        stdout:
          direct !== null
            ? direct[1]!
            : wrappers.length
              ? wrappers.map((value) => String(value.output)).join("")
              : texts
                  .flatMap((value) =>
                    value.includes("Final output:\n")
                      ? [
                          value.slice(
                            value.indexOf("Final output:\n") +
                              "Final output:\n".length,
                          ),
                        ]
                      : [],
                  )
                  .join(""),
        nativeExitCodes: exits,
        objects: [
          ...(direct !== null
            ? output.objects.filter(
                (value) =>
                  value.session_id === undefined &&
                  value.exit_code === undefined &&
                  value.cell_id === undefined,
              )
            : synchronous?.forwardedOutputs || !wrappers.length
              ? output.objects
              : outputObjects(wrappers)),
          ...exits.map((exit_code): Row => ({ exit_code })),
        ],
        ...(batchResult ? { indexedBatch: true } : {}),
        ...(joinedWrappers ? { joinedBatch: true } : {}),
      };
    })
    .flat();
  const isProduction = (callId: string) =>
    callCommands(trace.calls.get(callId)!).some((command) =>
      /npm\s+run\s+project:/u.test(command),
    );
  assert.ok(
    [...processes.values()].every((origin) => !isProduction(origin)) &&
      [...cells.values()].every(
        (owner) =>
          !isProduction(owner.originCallId) ||
          owner.operation.kind === "process",
      ),
    `Production command needs its completed original handle chain or explicit completed native failure: ${JSON.stringify(
      {
        processes: [...processes.entries()].filter(([, origin]) =>
          isProduction(origin),
        ),
        cells: [...cells.entries()].filter(
          ([, owner]) =>
            isProduction(owner.originCallId) &&
            owner.operation.kind !== "process",
        ),
      },
    )}`,
  );
  return outputs;
}

export type CodexUiInput = {
  rpc: string;
  sessionId: string;
  workspace: string;
};
const shellBody = (command: string) => {
  const wrapped = /^\S+\s+-(?:lc|c)\s+'([\s\S]*)'$/u.exec(command);
  if (wrapped)
    return wrapped[1]!.replaceAll("'\\''", "'").replaceAll("'\"'\"'", "'");
  const double = /^\S+\s+-(?:lc|c)\s+"((?:[^"\\$`]|\\["\\$`])*)"$/u.exec(
    command,
  );
  return double ? double[1]!.replace(/\\(["\\$`])/gu, "$1") : command;
};
const truncated = /…\d+ tokens truncated…/u;

// The original transcript remains unchanged. Native UI stdout can restore a
// truncated tool result only through its proved original command process.
export function authenticateCodexCommands(
  trace: ReturnType<typeof nativeTrace>,
  input: CodexUiInput,
) {
  const original = nativeTrace(
    "codex",
    trace.records.map((record) => JSON.stringify(record)).join("\n"),
  );
  assert.deepEqual(
    [...trace.calls.entries()],
    [...original.calls.entries()],
    "Native command projection differs from its original records",
  );
  assert.deepEqual(
    trace.outputs,
    original.outputs,
    "Native result projection differs from its original records",
  );
  const meta = trace.records.filter((record) => record.type === "session_meta");
  assert.equal(meta.length, 1);
  assert.equal(object(meta[0]!.payload).id, input.sessionId);
  assert.equal(object(meta[0]!.payload).cwd, input.workspace);
  const rows = input.rpc
    .trim()
    .split("\n")
    .map((line) => object(JSON.parse(line)));
  const failedOuter = proveUnstartedOuterFailures(trace, input, rows);
  unstartedOuterProofs.set(trace, failedOuter.proofs);
  const synchronous = proveSynchronousInvocations(trace, input, rows);
  rememberSynchronousProofs(trace, synchronous);
  const native = commandOrigins(trace);
  const completed = rows
    .map((row, index) => ({
      row,
      index,
      params: object(row.params),
      item: object(object(row.params).item),
    }))
    .filter(
      ({ row, item }) =>
        row.method === "item/completed" && item.type === "commandExecution",
    );
  const rootCommands = completed
    .filter(({ params }) => params.threadId === input.sessionId)
    .map(({ item }) => shellBody(String(item.command)));
  const originalCommands = [...trace.calls.values()].flatMap(callCommands);
  for (const action of [
    "create",
    "revise",
    "produce:prepare",
    "produce:continue",
  ]) {
    const available = productionCommands(originalCommands, action);
    for (const command of productionCommands(rootCommands, action)) {
      const match = available.indexOf(command);
      assert.ok(
        match >= 0,
        "Native UI contains an unaccounted public mutation invocation",
      );
      available.splice(match, 1);
    }
  }
  // All proof classes reserve the same original UI process for one literal
  // launch. A known wait inherits that launch; a new exec cannot inherit its
  // owner by declaring the same PID or printing identical stdout.
  const uiOwners = new Map<string, string>();
  const claimUiOwner = (item: Row, owner: string) => {
    assert.ok(
      typeof item.id === "string" && item.processId != null,
      "Native invocation needs a unique original UI owner",
    );
    for (const key of [
      JSON.stringify(["item", item.id]),
      JSON.stringify(["process", String(item.processId)]),
    ]) {
      const existing = uiOwners.get(key);
      assert.ok(
        existing === undefined || existing === owner,
        "Native invocation needs a unique original UI owner",
      );
      uiOwners.set(key, owner);
    }
  };
  const owners = new Map<(typeof native)[number], string>();
  const launches = new Map<string, { owner: string; callId: string }>();
  const forwarding = new Set<string>();
  for (const result of native) {
    if (
      !result.objects.length &&
      !result.stdout &&
      !("nativeExitCodes" in result && result.nativeExitCodes.length)
    )
      continue;
    for (const callId of new Set([result.callId, result.originCallId])) {
      if (forwarding.has(callId)) continue;
      const call = trace.calls.get(callId)!;
      assert.ok(
        "indexedBatch" in result ||
          unchangedNativeForwarding(call, input.workspace),
        "Native source needs its unchanged literal forwarding",
      );
      forwarding.add(callId);
    }
  }
  for (const result of native) {
    if (result.originCommand === undefined) continue;
    assert.ok(
      "originExecOrdinal" in result &&
        Number.isInteger(result.originExecOrdinal) &&
        Number(result.originExecOrdinal) >= 0,
      "Native launch needs its exact original exec ordinal",
    );
    const owner = JSON.stringify([
      result.originCallId,
      result.originExecOrdinal,
    ]);
    owners.set(result, owner);
    if (result.processId !== undefined) {
      const known = launches.get(result.processId);
      assert.ok(
        known === undefined || known.owner === owner,
        "Native invocation needs a unique original UI owner",
      );
      launches.set(result.processId, { owner, callId: result.originCallId });
    }
  }
  for (const result of native) {
    if (owners.has(result) || result.processId === undefined) continue;
    const launch = launches.get(result.processId);
    assert.ok(
      launch && launch.callId === result.originCallId,
      "Native wait lost its exact original launch owner",
    );
    owners.set(result, launch.owner);
  }
  const groups = new Map<string, typeof native>();
  for (const [result, owner] of owners)
    groups.set(owner, [...(groups.get(owner) ?? []), result]);
  for (const [owner, group] of groups) {
    const first = group.find((result) => result.originCommand !== undefined)!;
    const origin = trace.calls.get(first.originCallId)!;
    const payload = object(trace.records[origin.index]!.payload);
    const turnId =
      payload.turn_id ??
      object(payload.internal_chat_message_metadata_passthrough).turn_id;
    if (rootCommands.length)
      assert.ok(
        typeof turnId === "string" && turnId.length > 0,
        "Native launch has no original Root turn identity",
      );
    const endedAt = Math.max(...group.map((result) => result.timestamp));
    const matches = completed.filter(
      ({ params, item }) =>
        params.threadId === input.sessionId &&
        params.turnId === turnId &&
        shellBody(String(item.command)) === first.originCommand &&
        item.cwd ===
          ("originCwd" in first
            ? (first.originCwd ?? input.workspace)
            : input.workspace) &&
        (first.processId === undefined ||
          String(item.processId) === first.processId) &&
        time(trace.records[origin.index]!.timestamp) <=
          Number(params.completedAtMs) &&
        Number(params.completedAtMs) <= endedAt,
    );
    assert.ok(
      rootCommands.length ? matches.length === 1 : matches.length <= 1,
      "Native launch has no unique original UI owner",
    );
    if (matches[0]) {
      const item = matches[0].item;
      const stdout = group.map((result) => result.stdout).join("");
      const exits = group.flatMap((result) =>
        "nativeExitCodes" in result ? result.nativeExitCodes : [],
      );
      if (exits.length) {
        assert.equal(
          exits.length,
          1,
          "Native process needs one original terminal",
        );
        assert.equal(
          item.exitCode,
          exits[0],
          "Native exit differs from its original UI process",
        );
        assert.equal(
          item.status,
          exits[0] === 0 ? "completed" : "failed",
          "Native terminal status differs from its original UI process",
        );
        if (!truncated.test(stdout))
          assert.equal(
            stdout,
            item.aggregatedOutput,
            "Native stdout differs from its complete original UI process",
          );
      }
      claimUiOwner(item, owner);
    }
  }
  let commandResults = [...synchronous.values()].reduce(
    (count, invocations) => count + invocations.length,
    0,
  );
  const orderedGroups = new Map<string, typeof native>();
  for (const result of native) {
    if (!("orderedBatch" in result)) continue;
    const key = JSON.stringify([
      result.orderedInvocationCallId,
      result.orderedOrdinal,
    ]);
    orderedGroups.set(key, [...(orderedGroups.get(key) ?? []), result]);
  }
  const orderedItems = new Set<string>();
  const orderedTimes = new Map<
    string,
    Array<{ ordinal: number; start: number; end: number }>
  >();
  for (const group of orderedGroups.values()) {
    const first = group[0]!;
    assert.ok("orderedBatch" in first);
    const commands = first.originCommand
      ? [first.originCommand]
      : [
          ...new Set(
            native
              .filter(
                (value) =>
                  first.processId !== undefined &&
                  value.processId === first.processId &&
                  value.originCallId === first.originCallId,
              )
              .map((value) => value.originCommand)
              .filter((value): value is string => typeof value === "string"),
          ),
        ];
    assert.equal(
      commands.length,
      1,
      "Ordered native wait lost its unique original literal command",
    );
    const command = commands[0]!;
    const origin = trace.calls.get(first.originCallId)!;
    const originPayload = object(trace.records[origin.index]!.payload);
    const turnId =
      originPayload.turn_id ??
      object(originPayload.internal_chat_message_metadata_passthrough).turn_id;
    assert.ok(
      typeof turnId === "string" && turnId.length > 0,
      "Ordered native origin has no Root turn identity",
    );
    const stream =
      first.processId !== undefined
        ? native.filter(
            (value) =>
              value.processId === first.processId &&
              value.originCallId === first.originCallId,
          )
        : group;
    const exits = stream.flatMap((value) =>
      "orderedExitCode" in value && typeof value.orderedExitCode === "number"
        ? [value.orderedExitCode]
        : value.objects
            .filter(
              (wrapper) =>
                typeof wrapper.output === "string" &&
                typeof wrapper.exit_code === "number",
            )
            .map((wrapper) => Number(wrapper.exit_code)),
    );
    assert.equal(
      exits.length,
      1,
      "Ordered native command needs one original terminal",
    );
    const endedAt = Math.max(...stream.map((value) => value.timestamp));
    const matches = completed.filter(
      ({ params, item }) =>
        params.threadId === input.sessionId &&
        params.turnId === turnId &&
        shellBody(String(item.command)) === command &&
        item.cwd === input.workspace &&
        (first.processId === undefined ||
          String(item.processId) === first.processId) &&
        time(trace.records[origin.index]!.timestamp) <=
          Number(params.completedAtMs) &&
        Number(params.completedAtMs) <= endedAt,
    );
    assert.equal(
      matches.length,
      1,
      "Ordered native invocation needs one unique original UI command",
    );
    const end = matches[0]!;
    const uiOwner = owners.get(first);
    assert.ok(uiOwner, "Ordered native result lost its original launch owner");
    claimUiOwner(end.item, uiOwner);
    const starts = rows
      .map((row, index) => ({
        row,
        index,
        params: object(row.params),
        item: object(object(row.params).item),
      }))
      .filter(
        ({ row, item }) =>
          row.method === "item/started" && item.id === end.item.id,
      );
    assert.equal(
      starts.length,
      1,
      "Ordered native command needs one original UI start",
    );
    assert.equal(
      completed.filter(
        ({ item }) =>
          item.id === end.item.id ||
          String(item.processId) === String(end.item.processId),
      ).length,
      1,
      "Ordered native command has duplicate terminal results",
    );
    const start = starts[0]!;
    for (const entry of [start, end]) {
      assert.equal(entry.params.threadId, input.sessionId);
      assert.equal(entry.params.turnId, turnId);
      assert.equal(entry.item.type, "commandExecution");
      assert.equal(entry.item.cwd, input.workspace);
      assert.equal(shellBody(String(entry.item.command)), command);
    }
    assert.ok(
      start.item.processId == null ||
        String(start.item.processId) === String(end.item.processId),
      "Ordered native command changed original process identity",
    );
    const began = z.number().finite().parse(start.params.startedAtMs);
    const ended = z.number().finite().parse(end.params.completedAtMs);
    assert.ok(
      start.index < end.index &&
        time(trace.records[origin.index]!.timestamp) <= began &&
        began <= ended &&
        ended <= endedAt,
      "Ordered native command lies outside its original process lifetime",
    );
    assert.equal(start.item.status, "inProgress");
    assert.equal(end.item.status, exits[0] === 0 ? "completed" : "failed");
    assert.equal(
      end.item.exitCode,
      exits[0],
      "Ordered native exit differs from its original UI process",
    );
    const stdout = stream.map((value) => value.stdout).join("");
    assert.equal(
      end.item.aggregatedOutput,
      stdout,
      "Ordered native stdout differs from its original UI process",
    );
    const deltas = rows
      .map((row, index) => ({ row, index, params: object(row.params) }))
      .filter(
        ({ row, params }) =>
          row.method === "item/commandExecution/outputDelta" &&
          params.itemId === end.item.id,
      );
    for (const delta of deltas) {
      assert.ok(
        start.index < delta.index && delta.index < end.index,
        "Ordered native stdout lies outside its original process lifetime",
      );
      assert.equal(delta.params.threadId, input.sessionId);
      assert.equal(delta.params.turnId, turnId);
    }
    if (deltas.length)
      assert.equal(
        deltas.map(({ params }) => z.string().parse(params.delta)).join(""),
        stdout,
        "Ordered native stdout has an incomplete original UI capture",
      );
    orderedItems.add(String(end.item.id));
    const timings = orderedTimes.get(first.orderedInvocationCallId) ?? [];
    timings.push({ ordinal: first.orderedOrdinal, start: began, end: ended });
    orderedTimes.set(first.orderedInvocationCallId, timings);
  }
  for (const timings of orderedTimes.values()) {
    timings.sort((a, b) => a.ordinal - b.ordinal);
    for (let index = 1; index < timings.length; index++)
      assert.ok(
        timings[index - 1]!.end <= timings[index]!.start,
        "Ordered native commands do not retain their original sequence",
      );
  }
  commandResults += orderedItems.size;
  const replacements = new Map<number, Row[]>();
  for (const result of native) {
    if (!truncated.test(result.stdout)) continue;
    const origin = trace.calls.get(result.originCallId)!;
    if (
      !callCommands(origin).some((command) =>
        /npm\s+run\s+project:/u.test(command),
      )
    )
      continue;
    const operations = nativeOperations(origin).filter(
      (operation) => operation.kind === "exec",
    );
    assert.equal(
      operations.length,
      1,
      "Truncated result has no unique literal command origin",
    );
    const operation = operations[0]!;
    assert.ok(
      operation.kind === "exec" && operation.command && operation.cwd,
      "Truncated result needs literal command and cwd",
    );
    assert.equal(operation.cwd, input.workspace);
    assert.ok(
      result.processId,
      "Truncated result has no proved original process handle",
    );
    const matching = completed.filter(
      ({ item }) => String(item.processId) === result.processId,
    );
    assert.equal(
      matching.length,
      1,
      "Native UI needs one completed original process result",
    );
    const completion = matching[0]!;
    const uiOwner = owners.get(result);
    assert.ok(
      uiOwner,
      "Truncated native result lost its original launch owner",
    );
    claimUiOwner(completion.item, uiOwner);
    assert.equal(
      completed.filter(({ item }) => item.id === completion.item.id).length,
      1,
      "Native UI command item has duplicate completions",
    );
    assert.equal(completion.params.threadId, input.sessionId);
    const originPayload = object(trace.records[origin.index]!.payload);
    const turnId =
      originPayload.turn_id ??
      object(originPayload.internal_chat_message_metadata_passthrough).turn_id;
    assert.ok(
      typeof turnId === "string" && turnId.length > 0,
      "Native command origin has no Root turn identity",
    );
    assert.equal(completion.params.turnId, turnId);
    const starts = rows
      .map((row, index) => ({
        row,
        index,
        params: object(row.params),
        item: object(object(row.params).item),
      }))
      .filter(
        ({ row, item }) =>
          row.method === "item/started" && item.id === completion.item.id,
      );
    assert.equal(
      starts.length,
      1,
      "Native UI needs one original command start",
    );
    const start = starts[0]!;
    assert.ok(
      start.item.processId == null ||
        String(start.item.processId) === result.processId,
      "Native UI start has a different original process handle",
    );
    assert.ok(
      start.index < completion.index,
      "Native UI completion precedes its command start",
    );
    for (const entry of [start, completion]) {
      assert.equal(entry.params.threadId, input.sessionId);
      assert.equal(entry.params.turnId, turnId);
      assert.equal(entry.item.type, "commandExecution");
      assert.equal(entry.item.cwd, operation.cwd);
      assert.equal(shellBody(String(entry.item.command)), operation.command);
    }
    assert.equal(start.item.status, "inProgress");
    assert.equal(completion.item.status, "completed");
    assert.equal(completion.item.exitCode, 0);
    assert.ok(
      result.objects.some((value) => value.exit_code === 0),
      "Original command process has no successful terminal",
    );
    const started = z.number().finite().parse(start.params.startedAtMs);
    const ended = z.number().finite().parse(completion.params.completedAtMs);
    assert.ok(
      time(trace.records[origin.index]!.timestamp) <= started &&
        started <= ended &&
        ended <= result.timestamp,
      "Native UI command lies outside original launch-to-result order",
    );
    const deltas = rows
      .map((row, index) => ({ row, index, params: object(row.params) }))
      .filter(
        ({ row, params }) =>
          row.method === "item/commandExecution/outputDelta" &&
          params.itemId === completion.item.id,
      );
    for (const delta of deltas) {
      assert.ok(
        start.index < delta.index && delta.index < completion.index,
        "Native UI stdout falls outside its command lifetime",
      );
      assert.equal(delta.params.threadId, input.sessionId);
      assert.equal(delta.params.turnId, turnId);
    }
    const stdout = z.string().min(1).parse(completion.item.aggregatedOutput);
    assert.equal(
      deltas.map(({ params }) => z.string().parse(params.delta)).join(""),
      stdout,
      "Native UI outputDelta differs from complete aggregatedOutput",
    );
    const observed = native
      .filter(
        (value) =>
          value.originCallId === result.originCallId &&
          value.index <= result.index,
      )
      .map((value) => value.stdout)
      .join("");
    const pieces = observed.split(/…\d+ tokens truncated…/u);
    assert.ok(
      stdout.startsWith(pieces[0]!) && stdout.endsWith(pieces.at(-1)!),
      "Native UI stdout contradicts original visible bytes",
    );
    let offset = 0;
    for (const piece of pieces) {
      const position = stdout.indexOf(piece, offset);
      assert.ok(
        position >= offset,
        "Native UI stdout contradicts original visible byte order",
      );
      offset = position + piece.length;
    }
    replacements.set(result.index, [
      ...result.objects.filter(
        (value) =>
          typeof value.output === "string" &&
          typeof value.exit_code === "number",
      ),
      ...outputObjects(stdout),
      { exit_code: 0 },
    ]);
    commandResults++;
  }
  const forwardedObjects = new Map(
    native
      .filter(
        (value) => !("orderedBatch" in value) && !synchronous.has(value.index),
      )
      .map((value) => [value.index, value.objects]),
  );
  for (const result of native.filter((value) => "orderedBatch" in value))
    forwardedObjects.set(result.index, [
      ...(forwardedObjects.get(result.index) ?? []),
      ...result.objects,
    ]);
  const synchronousObjects = new Map(
    [...synchronous.entries()].map(([index, invocations]) => [
      index,
      invocations.flatMap(({ wrapper }) => outputObjects(wrapper)),
    ]),
  );
  const outputs = trace.outputs.map((result) =>
    failedOuter.proofs.has(result.index)
      ? { ...result, objects: [] as Row[] }
      : replacements.has(result.index)
        ? { ...result, objects: replacements.get(result.index)! }
        : forwardedObjects.has(result.index)
          ? { ...result, objects: forwardedObjects.get(result.index)! }
          : synchronousObjects.has(result.index)
            ? { ...result, objects: synchronousObjects.get(result.index)! }
            : result,
  );
  const preparedIdentity = (value: Row) => [
    value.attemptId,
    value.storyId,
    value.revisionId,
  ];
  const uiPrepared = completed
    .filter(
      ({ params, item }) =>
        params.threadId === input.sessionId &&
        productionCommands([shellBody(String(item.command))], "produce:prepare")
          .length > 0,
    )
    .flatMap(({ item }) => outputObjects(item.aggregatedOutput))
    .filter((value) => value.status === "project-production-prepared")
    .map(preparedIdentity);
  const nativePrepared = outputs
    .flatMap((result) => result.objects)
    .filter((value) => value.status === "project-production-prepared")
    .map(preparedIdentity);
  assert.deepEqual(
    uiPrepared,
    nativePrepared,
    "Native UI must retain every produced attempt with its original native result",
  );
  const authenticated = { ...trace, outputs };
  unstartedOuterProofs.set(authenticated, failedOuter.proofs);
  rememberSynchronousProofs(authenticated, synchronous, true);
  return {
    trace: authenticated,
    ...(failedOuter.failures.length
      ? { failedOuterTools: failedOuter.failures }
      : {}),
    ...(commandResults === 0
      ? {}
      : {
          uiEvidence: {
            checksum: sha256(input.rpc),
            sessionId: input.sessionId,
            commandResults,
          },
        }),
  };
}
const flag = (command: string, name: string) => {
  const values = [
    ...command.matchAll(
      new RegExp(
        `(?:^|\\s)--${name}(?:=|\\s+)(?:"([^"\\s]+)"|'([^'\\s]+)'|([^\\s]+))`,
        "gu",
      ),
    ),
  ];
  assert.ok(values.length <= 1, `Duplicate --${name} in production command`);
  return values[0]?.slice(1).find((value) => value !== undefined) ?? null;
};

const DeliveryTupleSchema = z
  .object({ revisionId: z.string().min(1), deliveryBuildId: z.string().min(1) })
  .strict();
export const ProductionAttemptIdentitySchema = z
  .object({
    attemptId: z.string().min(1),
    storyId: z.string().min(1),
    revisionId: z.string().min(1),
    candidateId: z.string().min(1).nullable(),
    base: DeliveryTupleSchema.nullable(),
    deliveryBuildId: z.string().min(1),
  })
  .strict();

// Multiple attempts are accepted only as a complete public revision chain.
// Call identity, rather than prose or copied output, authenticates each step.
export function auditProductionAttempts(trace: ReturnType<typeof nativeTrace>) {
  const outputs = commandOrigins(trace).flatMap(
    ({ objects, timestamp, index, callId, originCallId, originCommand }) =>
      objects.map((value) => ({
        value,
        timestamp,
        index,
        callId,
        originCallId,
        originCommand,
      })),
  );
  const prepared = outputs.filter(
    ({ value }) => value.status === "project-production-prepared",
  );
  const invocations = (action: string) =>
    [...trace.calls.entries()].flatMap(([callId, call]) =>
      productionCommands(callCommands(call), action).map((command) => ({
        callId,
        index: call.index,
        command,
      })),
    );
  const preparationCalls = invocations("produce:prepare");
  const continuations = invocations("produce:continue");
  const fromInvocation = (
    result: { originCallId: string; originCommand?: string },
    call: { callId: string; command: string },
    action: string,
  ) =>
    call.callId === result.originCallId &&
    (result.originCommand === undefined ||
      productionCommands([result.originCommand], action).includes(
        call.command,
      ));
  const fromAction = (
    result: { originCallId: string; originCommand?: string },
    action: string,
  ) => invocations(action).some((call) => fromInvocation(result, call, action));
  if (prepared.length <= 1) {
    if (synchronousProofs.has(trace)) {
      for (const result of prepared)
        assert.ok(
          fromAction(result, "produce:prepare"),
          "Prepared attempt has no original native preparation command",
        );
      for (const result of outputs.filter(
        ({ value }) => value.status === "ready" && value.mode === "subagents",
      ))
        assert.ok(
          fromAction(result, "execution:resolve"),
          "Attempt has no successful native resolution command",
        );
    }
    return null;
  }
  const creations = outputs.filter(
    (result) =>
      ["project-created", "project-create-current"].includes(
        String(result.value.status),
      ) && fromAction(result, "create"),
  );
  assert.ok(
    creations.some(({ value }) => value.status === "project-created"),
    "A revision chain needs successful fresh creation",
  );
  const creationIdentity = z
    .string()
    .min(1)
    .parse(creations[0]!.value.creationIdentity);
  for (const creation of creations) {
    assert.equal(
      creation.value.creationIdentity,
      creationIdentity,
      "Fresh creation identity must remain unchanged",
    );
    assert.equal(creation.value.storyId, prepared[0]!.value.storyId);
    assert.ok(
      creation.index < prepared[0]!.index,
      "Fresh creation must precede production",
    );
    const command = invocations("create").find((call) =>
      fromInvocation(creation, call, "create"),
    )!;
    assert.equal(flag(command.command, "project"), creation.value.storyId);
  }
  for (const call of preparationCalls.filter(
    (call) =>
      !prepared.some((result) =>
        fromInvocation(result, call, "produce:prepare"),
      ),
  )) {
    assert.ok(
      outputs.some(
        (result) =>
          fromInvocation(result, call, "produce:prepare") &&
          typeof result.value.exit_code === "number" &&
          result.value.exit_code !== 0,
      ),
      "An unprepared invocation must have an explicit completed native failure",
    );
  }
  assert.equal(
    continuations.length,
    prepared.length,
    "Every attempt must start its continuation exactly once",
  );
  const identities = new Set<string>();
  const candidates = new Set<string>();
  let previous: {
    revisionId: string;
    deliveryBuildId: string;
    fixedIndex: number;
    fixedAt: number;
  } | null = null;
  const attempts = [];
  for (const [ordinal, preparation] of prepared.entries()) {
    const value = preparation.value;
    const attemptId = z.string().min(1).parse(value.attemptId);
    const storyId = z.string().min(1).parse(value.storyId);
    const revisionId = z.string().min(1).parse(value.revisionId);
    assert.ok(
      !identities.has(attemptId),
      "Duplicate prepared attempt identity",
    );
    identities.add(attemptId);
    const prepare = preparationCalls.filter((call) =>
      fromInvocation(preparation, call, "produce:prepare"),
    );
    assert.ok(
      prepare.length > 0 &&
        new Set(prepare.map((call) => call.command)).size === 1,
      "Prepared attempt must originate from its exact public prepare",
    );
    assert.equal(flag(prepare[0]!.command, "project"), storyId);
    const candidateId = flag(prepare[0]!.command, "candidate");
    const lower: number = previous?.fixedIndex ?? -1;
    const between = (result: { index: number }): boolean =>
      result.index > lower && result.index < prepare[0]!.index;
    const resolves = outputs.filter(
      (result) =>
        between(result) &&
        result.value.status === "ready" &&
        fromAction(result, "execution:resolve"),
    );
    assert.equal(
      resolves.length,
      1,
      "Every attempt needs its own successful native resolution",
    );
    const resolve = resolves[0]!;
    assert.equal(
      resolve.value.mode,
      "subagents",
      "A native revision chain cannot change execution mode",
    );
    const inspections = outputs.filter(
      (result) =>
        between(result) &&
        result.value.contractVersion === "production-inspection-v1" &&
        result.value.storyId === storyId &&
        fromAction(result, "produce:inspect") &&
        invocations("produce:inspect").some(
          (call) =>
            fromInvocation(result, call, "produce:inspect") &&
            flag(call.command, "project") === storyId &&
            flag(call.command, "candidate") === candidateId,
        ),
    );
    assert.ok(
      inspections.length > 0,
      "Every attempt needs its own public inspect",
    );
    const inspect = inspections.at(-1)!;
    const inspectCall = invocations("produce:inspect").find((call) =>
      fromInvocation(inspect, call, "produce:inspect"),
    )!;
    assert.equal(inspect.value.storyId, storyId);
    assert.equal(flag(inspectCall.command, "project"), storyId);
    assert.equal(flag(inspectCall.command, "candidate"), candidateId);
    assert.ok(
      resolve.index < inspectCall.index && inspect.index < prepare[0]!.index,
      "Resolution and inspect must precede their prepare",
    );
    const base: z.infer<typeof DeliveryTupleSchema> | null =
      previous === null
        ? null
        : {
            revisionId: previous.revisionId,
            deliveryBuildId: previous.deliveryBuildId,
          };
    if (ordinal === 0)
      assert.equal(
        candidateId,
        null,
        "Fresh production cannot start with a revision candidate",
      );
    else {
      assert.ok(
        candidateId && !candidates.has(candidateId),
        "Each later attempt needs a fresh public revision candidate",
      );
      candidates.add(candidateId);
      const matchingBase = (result: { index: number; value: Row }) =>
        between(result) &&
        result.value.storyId === storyId &&
        result.value.baseRevisionId === base!.revisionId &&
        result.value.baseDeliveryBuildId === base!.deliveryBuildId;
      const created = outputs
        .filter(
          (result) =>
            matchingBase(result) &&
            result.value.candidateId === candidateId &&
            result.index < resolve.index &&
            [
              "project-revision-candidate-created",
              "project-revision-candidate-current",
            ].includes(String(result.value.status)) &&
            fromAction(result, "revise"),
        )
        .at(-1);
      assert.ok(
        created,
        "Revision needs matching public candidate creation from the preceding successful Delivery",
      );
      const valid = outputs
        .filter(
          (result) =>
            matchingBase(result) &&
            result.value.status === "project-revision-valid" &&
            result.value.candidateId === candidateId &&
            result.index < created.index &&
            fromAction(result, "revise:validate"),
        )
        .at(-1);
      assert.ok(valid, "Revision needs matching public validation");
      const context = outputs
        .filter(
          (result) =>
            matchingBase(result) &&
            result.value.status === "project-revision-context" &&
            result.index < valid.index &&
            fromAction(result, "revise:context"),
        )
        .at(-1);
      assert.ok(context, "Revision needs its matching public base context");
    }
    const continuation = continuations.filter(
      (call) => flag(call.command, "attempt") === attemptId,
    );
    assert.equal(
      continuation.length,
      1,
      "Every attempt must start its continuation exactly once",
    );
    const continueCall = continuation[0]!;
    assert.equal(
      continueCall.command,
      value.continuationCommand,
      "Use the exact prepare continuation command",
    );
    assert.equal(flag(continueCall.command, "project"), storyId);
    assert.equal(flag(continueCall.command, "revision"), revisionId);
    assert.equal(flag(continueCall.command, "candidate"), candidateId);
    assert.ok(
      continueCall.index > preparation.index,
      "Continuation predates its prepared attempt",
    );
    const upper = prepared[ordinal + 1]?.index ?? Infinity;
    const fixed = outputs.filter(
      (result) =>
        result.index > continueCall.index &&
        result.index < upper &&
        (candidateId === null
          ? [
              "project-production-complete",
              "project-production-current",
            ].includes(String(result.value.status)) &&
            result.value.revisionId === revisionId &&
            result.value.attemptRecorded === true
          : result.value.status === "project-revision-complete" &&
            object(result.value.production).attemptId === attemptId),
    );
    assert.equal(
      fixed.length,
      1,
      "Every attempt needs its successful fixed delivery result",
    );
    const completed = fixed[0]!;
    assert.equal(
      completed.originCallId,
      continueCall.callId,
      "Fixed delivery must originate from its exact continuation command",
    );
    assert.ok(
      fromInvocation(completed, continueCall, "produce:continue"),
      "Fixed delivery must belong to its original command process",
    );
    let deliveryBuildId: string;
    if (candidateId === null)
      deliveryBuildId = z
        .string()
        .min(1)
        .parse(object(completed.value.delivery).deliveryBuildId);
    else {
      assert.equal(completed.value.storyId, storyId);
      assert.equal(completed.value.candidateId, candidateId);
      assert.deepEqual(
        completed.value.base,
        base,
        "Promoted revision base is stale",
      );
      const production = object(completed.value.production);
      assert.ok(
        ["project-production-complete", "project-production-current"].includes(
          String(production.status),
        ),
      );
      assert.equal(production.state, "succeeded");
      assert.equal(production.deliveryStatus, "verified");
      assert.equal(production.revisionId, revisionId);
      deliveryBuildId = z.string().min(1).parse(production.deliveryBuildId);
      assert.deepEqual(
        completed.value.expected,
        { revisionId, deliveryBuildId },
        "Revision fixed result must match its promotion tuple",
      );
      assert.ok(
        ["project-revision-promoted", "project-revision-current"].includes(
          String(object(completed.value.promotion).status),
        ),
        "Revision must finish public promotion",
      );
    }
    attempts.push({
      ...ProductionAttemptIdentitySchema.parse({
        attemptId,
        storyId,
        revisionId,
        candidateId,
        base,
        deliveryBuildId,
      }),
      preparation,
      resolve,
      inspect,
      fixedIndex: completed.index,
      fixedAt: completed.timestamp,
      lowerAt: previous?.fixedAt ?? -Infinity,
    });
    previous = {
      revisionId,
      deliveryBuildId,
      fixedIndex: completed.index,
      fixedAt: completed.timestamp,
    };
  }
  return attempts;
}

const NativeAttemptSchema = ProductionAttemptIdentitySchema.extend({
  workerTransport: z.enum(["shared-workspace", "controller-io"]),
  modeSource: z.enum(["builtin-default", "settings"]),
  concurrencySource: z.enum(["builtin-default", "settings"]),
  requestedMaxConcurrency: z.literal(4),
  effectiveMaxConcurrency: z.number().int().min(1).max(4),
  peakActiveChildren: z.number().int().min(0).max(4),
  peakBoundTasks: z.number().int().min(0).max(4),
  fourWayBoundOverlapMs: z.number().nonnegative(),
  refillAdmissions: z.number().int().nonnegative(),
  dirtyTaskCount: z.number().int().nonnegative(),
  productionChildCount: z.number().int().nonnegative(),
  probeChildCount: z.number().int().nonnegative(),
  dirtyTaskRevisions: z.array(z.string().min(1)),
  childSessionIds: z.array(z.string().min(1)),
}).strict();

export const NativeExecutionSchema = z
  .object({
    mode: z.literal("subagents"),
    workerTransport: z.enum(["shared-workspace", "controller-io"]),
    modeSource: z.enum(["builtin-default", "settings"]),
    concurrencySource: z.enum(["builtin-default", "settings"]),
    requestedMaxConcurrency: z.literal(4),
    effectiveMaxConcurrency: z.number().int().min(1).max(4),
    peakActiveChildren: z.number().int().min(2).max(4),
    peakBoundTasks: z.number().int().min(0).max(4).optional(),
    fourWayBoundOverlapMs: z.number().nonnegative().optional(),
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
            attemptId: z.string().min(1).optional(),
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
    attempts: z.array(NativeAttemptSchema).min(2).optional(),
    uiEvidence: z
      .object({
        checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
        sessionId: z.string().min(1),
        commandResults: z.number().int().positive(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((execution, context) => {
    const attempts = execution.attempts;
    if (attempts === undefined) {
      if (
        execution.childEvidence.some((child) => child.attemptId !== undefined)
      )
        context.addIssue({
          code: "custom",
          message: "Attempt-bound children require grouped evidence",
        });
      return;
    }
    const fail = (valid: boolean, message: string) => {
      if (!valid) context.addIssue({ code: "custom", message });
    };
    const first = attempts[0]!;
    fail(
      execution.attemptId === first.attemptId,
      "Summary must identify the first fresh attempt",
    );
    for (const key of [
      "workerTransport",
      "modeSource",
      "concurrencySource",
      "effectiveMaxConcurrency",
      "peakBoundTasks",
      "fourWayBoundOverlapMs",
    ] as const)
      fail(
        execution[key] === first[key],
        `Summary ${key} must describe fresh production`,
      );
    fail(
      first.dirtyTaskCount >= 5 &&
        first.effectiveMaxConcurrency === 4 &&
        first.peakBoundTasks === 4 &&
        first.fourWayBoundOverlapMs > 0 &&
        first.refillAdmissions > 0,
      "Fresh production must retain four-way overlap and later admission",
    );
    for (const key of [
      "dirtyTaskCount",
      "productionChildCount",
      "probeChildCount",
      "refillAdmissions",
    ] as const)
      fail(
        execution[key] ===
          attempts.reduce((total, attempt) => total + attempt[key], 0),
        `Grouped ${key} total is inconsistent`,
      );
    fail(
      execution.peakActiveChildren ===
        Math.max(...attempts.map((attempt) => attempt.peakActiveChildren)),
      "Grouped concurrency summary is inconsistent",
    );
    fail(
      new Set(attempts.map((attempt) => attempt.attemptId)).size ===
        attempts.length,
      "Attempt identities must be unique",
    );
    fail(
      new Set(execution.childEvidence.map((child) => child.sessionId)).size ===
        execution.childEvidence.length,
      "Child sessions must be fresh and unique",
    );
    fail(
      execution.childEvidence.length ===
        execution.productionChildCount + execution.probeChildCount,
      "All children must appear in grouped evidence",
    );
    for (const [index, attempt] of attempts.entries()) {
      const previous = attempts[index - 1];
      fail(
        index === 0
          ? attempt.base === null && attempt.candidateId === null
          : attempt.candidateId !== null &&
              isDeepStrictEqual(attempt.base, {
                revisionId: previous!.revisionId,
                deliveryBuildId: previous!.deliveryBuildId,
              }) &&
              attempt.storyId === first.storyId,
        "Attempt groups must form the public revision chain",
      );
      const children = execution.childEvidence.filter(
        (child) => child.attemptId === attempt.attemptId,
      );
      fail(
        children.length === attempt.childSessionIds.length &&
          isDeepStrictEqual(
            children.map((child) => child.sessionId).sort(),
            [...attempt.childSessionIds].sort(),
          ),
        "Attempt child exports are inconsistent",
      );
      const tasks = children
        .flatMap((child) =>
          child.taskRevision === null ? [] : [child.taskRevision],
        )
        .sort();
      fail(
        attempt.dirtyTaskCount === attempt.dirtyTaskRevisions.length &&
          attempt.productionChildCount === attempt.dirtyTaskCount &&
          tasks.length === attempt.productionChildCount &&
          children.length - tasks.length === attempt.probeChildCount &&
          new Set(tasks).size === tasks.length &&
          isDeepStrictEqual(tasks, [...attempt.dirtyTaskRevisions].sort()),
        "Every dirty task needs exactly one fresh child in its attempt",
      );
      fail(
        attempt.peakActiveChildren <= attempt.effectiveMaxConcurrency &&
          attempt.peakBoundTasks <= attempt.peakActiveChildren,
        "Attempt concurrency exceeds its resolved capacity",
      );
    }
    fail(
      execution.childEvidence.every((child) =>
        attempts.some((attempt) => attempt.attemptId === child.attemptId),
      ),
      "Unknown child attempt identity",
    );
  });

export const NativeChildInput = z
  .object({
    transcriptFile: z.string().min(1),
    sessionFile: z.string().min(1).optional(),
  })
  .strict();

export function assertFourWayExecution(
  execution: z.infer<typeof NativeExecutionSchema>,
) {
  assert.equal(
    execution.effectiveMaxConcurrency,
    4,
    "Release acceptance requires effective capacity four",
  );
  assert.equal(
    execution.peakBoundTasks,
    4,
    "Release acceptance requires four overlapping bound tasks",
  );
  assert.ok(
    (execution.fourWayBoundOverlapMs ?? 0) > 0,
    "Four-way task overlap must have positive duration",
  );
}

type ExecutionChild = {
  sessionId: string;
  transcriptChecksum: string;
  sessionChecksum: string | null;
  taskRevision: string | null;
  attemptId: string;
  started: number;
  ended: number;
  lastAgentMessage: string | null;
  boundAt: number | null;
  committedAt: number | null;
};

const overlap = (intervals: Array<{ start: number; end: number }>) => {
  let active = 0,
    peak = 0,
    fourWayMs = 0,
    previous = 0;
  for (const event of intervals
    .filter(({ start, end }) => end > start)
    .flatMap(({ start, end }) => [
      { at: start, change: 1 },
      { at: end, change: -1 },
    ])
    .sort((a, b) => a.at - b.at || a.change - b.change)) {
    if (active === 4) fourWayMs += event.at - previous;
    active += event.change;
    peak = Math.max(peak, active);
    previous = event.at;
  }
  return { peak, fourWayMs };
};
const executionMetrics = (children: ExecutionChild[]) => {
  const workers = children.filter((child) => child.taskRevision !== null);
  // The hosts' common timestamp domain proves real bound-task overlap.
  const bound = overlap(
    workers.map((child) => ({
      start: child.boundAt!,
      end: child.committedAt!,
    })),
  );
  return {
    peakActiveChildren: overlap(
      children.map((child) => ({ start: child.started, end: child.ended })),
    ).peak,
    peakBoundTasks: bound.peak,
    fourWayBoundOverlapMs: bound.fourWayMs,
    productionChildCount: workers.length,
    probeChildCount: children.length - workers.length,
    refillAdmissions: workers.filter((child) =>
      workers.some((earlier) => earlier.ended <= child.started),
    ).length,
  };
};

export async function auditNativeExecution(input: {
  host: "codex" | "hermes";
  transcript: string;
  sessionId: string;
  sessionSource?: string;
  workspace: string;
  startedAt: string;
  endedAt: string;
  storyId: string;
  nativeChildren: z.infer<typeof NativeChildInput>[];
  delegationFile?: string;
  hermesRuntimeRoot?: string;
  codexUi?: CodexUiInput;
}) {
  assert.ok(input.codexUi === undefined || input.host === "codex");
  const original = nativeTrace(input.host, input.transcript);
  const ui = input.codexUi
    ? authenticateCodexCommands(original, input.codexUi)
    : undefined;
  const root = ui?.trace ?? original;
  const grouped = auditProductionAttempts(root);
  const outputs = commandOutputs(root).flatMap(({ objects, timestamp }) =>
    objects.map((value) => ({ value, timestamp })),
  );
  const resolves = outputs.filter(
    ({ value }) => value.status === "ready" && value.mode === "subagents",
  );
  const prepared = outputs.filter(
    ({ value }) => value.status === "project-production-prepared",
  );
  assert.ok(
    prepared.length > 0,
    "Expected a production attempt in the fresh run",
  );
  assert.equal(
    resolves.length,
    prepared.length,
    "Every production attempt needs one successful native subagents resolution",
  );
  const plans = prepared.map((preparation, index) => {
    const group = grouped?.[index];
    const resolve = group?.resolve ?? resolves[0]!;
    const resolution = resolve.value;
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
    const tasks = z
      .array(z.object({ taskRevision: z.string().min(1) }).passthrough())
      .min(index === 0 ? 5 : 0)
      .parse(preparation.value.dirtyAgentTasks);
    assert.equal(preparation.value.storyId, input.storyId);
    const expected = tasks.map((task) => task.taskRevision).sort();
    assert.equal(new Set(expected).size, expected.length);
    return {
      preparation,
      resolve,
      resolution,
      sources,
      capacity,
      tasks,
      expected,
      group,
    };
  });
  const { preparation, resolution, sources, capacity } = plans[0]!;
  assert.equal(
    new Set(plans.map((plan) => plan.preparation.value.attemptId)).size,
    plans.length,
    "Duplicate prepared attempt identity",
  );
  assert.ok(
    !outputs.some(({ value }) => committed(value)),
    "Root must not commit child-owned artifacts",
  );
  const codexSpawns =
    input.host === "codex" ? codexSpawnReceipts(root, input.sessionId) : null;
  const children: ExecutionChild[] = [];
  for (const paths of input.nativeChildren) {
    const transcript = await readFile(paths.transcriptFile, "utf8");
    const trace =
      input.host === "codex"
        ? codexChildTrace(transcript, root)
        : nativeTrace(input.host, transcript);
    let id: string;
    let started: number;
    let ended: number;
    let lastAgentMessage: string | null = null;
    let sessionChecksum: string | null = null;
    if (input.host === "codex") {
      const metas = trace.records.filter(
        (record) => record.type === "session_meta",
      );
      assert.equal(metas.length, 1);
      const meta = object(metas[0]!.payload);
      id = z.string().min(1).parse(meta.id);
      if (codexSpawns?.native) {
        assert.ok(
          codexSpawns.childIds.has(id),
          "Codex child is missing from native spawn receipts",
        );
      }
      const spawn = object(object(object(meta.source).subagent).thread_spawn);
      assert.equal(
        spawn.parent_thread_id,
        input.sessionId,
        "Codex child is not a native direct descendant",
      );
      assert.equal(spawn.depth, 1);
      if (codexSpawns?.native) {
        if (spawn.agent_path !== null && spawn.agent_path !== undefined)
          z.string().min(1).parse(spawn.agent_path);
      } else {
        const agentPath = z.string().min(1).parse(spawn.agent_path);
        assert.ok(
          codexSpawns?.legacy.has(agentPath),
          "Codex child has no native spawn response",
        );
      }
      assert.equal(meta.cwd, input.workspace);
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
      const final = complete.at(-1)!;
      ended = time(final.timestamp);
      lastAgentMessage = z
        .string()
        .nullable()
        .parse(object(final.payload).last_agent_message ?? null);
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
          source: z.string(),
          cwd: z.string().nullable(),
          started_at: z.number(),
          ended_at: z.number(),
          message_count: z.number(),
          tool_call_count: z.number(),
        })
        .passthrough()
        .parse(JSON.parse(bytes.toString("utf8")));
      id = session.id;
      // Hermes TUI's session context overrides platform="subagent" with the
      // parent's source. Native parentage and task bind/commit remain authority.
      assert.equal(
        session.source,
        input.sessionSource === "tui" ? "tui" : "subagent",
        "Hermes child source does not match its native parent surface",
      );
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
    const timedResults = commandOutputs(trace).flatMap(
      ({ objects, timestamp }) =>
        objects.map((value) => ({ value, timestamp })),
    );
    const results = timedResults.map(({ value }) => value);
    const binds = results.filter(
      (value) => value.status === "task-worker-bound",
    );
    let taskRevision: string | null = null;
    let attemptId: string;
    let boundAt: number | null = null;
    let committedAt: number | null = null;
    if (binds.length === 0) {
      assert.ok(
        !results.some(committed),
        "Capability probe cannot commit a production artifact",
      );
      const plan = plans.find(
        (plan) =>
          ended <= plan.resolve.timestamp &&
          started >= (plan.group?.lowerAt ?? time(input.startedAt)),
      );
      assert.ok(
        plan,
        "A child without task binding must complete its capability probe before successful resolution",
      );
      attemptId = z.string().min(1).parse(plan.preparation.value.attemptId);
      assert.ok(
        trace.calls.size > 0,
        "Probe child did not exercise a native tool",
      );
    } else {
      const bound = binds[0]!;
      taskRevision = z.string().parse(bound.taskRevision);
      attemptId = z.string().min(1).parse(bound.attemptId);
      const plan = plans.find(
        (plan) => plan.preparation.value.attemptId === attemptId,
      );
      assert.ok(plan, "Child bound an unknown production attempt");
      assert.ok(
        binds.every(
          (value) =>
            value.taskRevision === taskRevision &&
            value.attemptId === attemptId &&
            value.storyId === input.storyId &&
            value.transport === plan.resolution.workerTransport,
        ),
        "One child must own only one task and attempt with its resolved scope",
      );
      assert.ok(
        plan.expected.includes(taskRevision),
        "Child task does not belong to its prepared attempt",
      );
      assert.equal(bound.storyId, input.storyId);
      assert.equal(bound.transport, plan.resolution.workerTransport);
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
        started >= plan.preparation.timestamp,
        "Production child predates its prepared task",
      );
      if (plan.group)
        assert.ok(
          ended <= plan.group.fixedAt,
          "Production child lacks a terminal before its fixed delivery",
        );
      boundAt = timedResults.find(
        ({ value }) => value.status === "task-worker-bound",
      )!.timestamp;
      committedAt = timedResults.find(({ value }) =>
        committed(value),
      )!.timestamp;
      assert.ok(
        boundAt >= started &&
          committedAt >= boundAt &&
          committedAt <= ended &&
          timedResults
            .filter(
              ({ value }) =>
                value.status === "task-worker-bound" || committed(value),
            )
            .every(
              ({ timestamp }) => timestamp >= boundAt! && timestamp <= ended,
            ),
        "Task bind and commit results fall outside their native child lifetime",
      );
    }
    children.push({
      sessionId: id,
      transcriptChecksum: sha256(transcript),
      sessionChecksum,
      taskRevision,
      attemptId,
      started,
      ended,
      lastAgentMessage,
      boundAt,
      committedAt,
    });
  }
  assert.equal(
    new Set(children.map((child) => child.sessionId)).size,
    children.length,
    "Duplicate child evidence",
  );
  const spawnedCount =
    input.host === "codex"
      ? codexSpawns!.native
        ? codexSpawns!.childIds.size
        : codexSpawns!.legacy.size
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
  for (const plan of plans)
    assert.deepEqual(
      children
        .filter((child) => child.attemptId === plan.preparation.value.attemptId)
        .flatMap((child) =>
          child.taskRevision === null ? [] : [child.taskRevision],
        )
        .sort(),
      plan.expected,
      "Every dirty task needs exactly one native child commit",
    );
  const peak = overlap(
    children.map((child) => ({ start: child.started, end: child.ended })),
  ).peak;
  assert.ok(
    peak <= capacity,
    "Native child concurrency exceeded the resolved capacity",
  );
  const productionChildren = children.filter(
    (child) => child.taskRevision !== null,
  );
  const metrics = plans.map((plan) => {
    const metrics = executionMetrics(
      children.filter(
        (child) => child.attemptId === plan.preparation.value.attemptId,
      ),
    );
    assert.ok(
      metrics.peakActiveChildren <= plan.capacity,
      "Native child concurrency exceeded the resolved attempt capacity",
    );
    return metrics;
  });
  const { peakBoundTasks, fourWayBoundOverlapMs } = metrics[0]!;
  const refillAdmissions = metrics.reduce(
    (count, metrics) => count + metrics.refillAdmissions,
    0,
  );
  const attempts = grouped?.map((group, index) => {
    const plan = plans[index]!;
    const owned = children.filter(
      (child) => child.attemptId === group.attemptId,
    );
    return {
      ...ProductionAttemptIdentitySchema.parse({
        attemptId: group.attemptId,
        storyId: group.storyId,
        revisionId: group.revisionId,
        candidateId: group.candidateId,
        base: group.base,
        deliveryBuildId: group.deliveryBuildId,
      }),
      workerTransport: plan.resolution.workerTransport,
      modeSource: plan.sources.mode,
      concurrencySource: plan.sources.maxConcurrency,
      requestedMaxConcurrency: 4,
      effectiveMaxConcurrency: plan.capacity,
      ...metrics[index],
      dirtyTaskCount: plan.tasks.length,
      dirtyTaskRevisions: plan.expected,
      childSessionIds: owned.map((child) => child.sessionId),
    };
  });
  const notifications = await hermesNotifications(input, root);
  const codexMessages =
    input.host === "codex"
      ? codexCompletionMessages(root, input.sessionId, children)
      : [];
  return {
    execution: NativeExecutionSchema.parse({
      mode: "subagents",
      workerTransport: resolution.workerTransport,
      modeSource: sources.mode,
      concurrencySource: sources.maxConcurrency,
      requestedMaxConcurrency: 4,
      effectiveMaxConcurrency: capacity,
      peakActiveChildren: peak,
      peakBoundTasks,
      fourWayBoundOverlapMs,
      dirtyTaskCount: plans.reduce(
        (count, plan) => count + plan.tasks.length,
        0,
      ),
      productionChildCount: productionChildren.length,
      probeChildCount: children.length - productionChildren.length,
      refillAdmissions,
      attemptId: preparation.value.attemptId,
      childEvidence: children.map(
        ({
          sessionId,
          transcriptChecksum,
          sessionChecksum,
          taskRevision,
          attemptId,
        }) => ({
          sessionId,
          transcriptChecksum,
          sessionChecksum,
          taskRevision,
          ...(grouped ? { attemptId } : {}),
        }),
      ),
      delegationChecksum: notifications.delegationChecksum,
      notificationFormatterChecksum:
        notifications.notificationFormatterChecksum,
      ...(attempts ? { attempts } : {}),
      ...(ui?.uiEvidence ? { uiEvidence: ui.uiEvidence } : {}),
    }),
    allowedNativeMessages:
      input.host === "codex" ? codexMessages : notifications.messages,
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
