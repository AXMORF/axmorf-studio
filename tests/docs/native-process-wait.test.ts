import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function runExample(exitCode: number) {
  const source = await readFile(
    ".agents/skills/axmorf-video/references/execution-capabilities.md",
    "utf8",
  );
  const code =
    /```javascript\n(\/\/ axmorf-original-process-wait[\s\S]*?)\n```/u.exec(
      source,
    )?.[1];
  assert.ok(code, "Ship the executable original-handle wait example");
  const events: unknown[] = [];
  const results = [
    { output: "", session_id: 17 },
    { output: "still running", session_id: 17 },
    { output: "terminal result", exit_code: exitCode },
  ];
  let starts = 0;
  let waits = 0;
  const tools = {
    exec_command: async () => {
      starts += 1;
      return results[0];
    },
    write_stdin: async (input: {
      session_id: number;
      chars: string;
      yield_time_ms: number;
    }) => {
      assert.equal(input.session_id, 17);
      assert.equal(input.chars, "");
      assert.ok(input.yield_time_ms >= 30000);
      waits += 1;
      return results[waits];
    },
  };
  const execute = new Function(
    "tools",
    "text",
    `return (async () => {${code}\n})()`,
  );
  if (exitCode === 0)
    await execute(tools, (event: unknown) => events.push(event));
  else
    await assert.rejects(
      execute(tools, (event: unknown) => events.push(event)),
      /Command failed/u,
    );
  assert.equal(starts, 1, "A wait window must never restart the process");
  assert.equal(
    waits,
    2,
    "Empty output and a partial completion must retain the pending handle",
  );
  assert.deepEqual(
    events,
    results,
    "Forward complete results including the running handle and final exit code",
  );
}

test("shipped Codex wait example survives empty and repeated yielded windows", () =>
  runExample(0));
test("shipped Codex wait example reports process failure without retry", () =>
  runExample(2));
