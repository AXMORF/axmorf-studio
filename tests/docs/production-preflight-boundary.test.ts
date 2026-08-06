import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("real production preflight requires host permissions and sandbox failures stay diagnostic", async () => {
  const [agentGuide, orchestration] = await Promise.all([
    readFile(new URL("../../AGENTS.md", import.meta.url), "utf8"),
    readFile(
      new URL("../../docs/PRODUCTION_ORCHESTRATION.md", import.meta.url),
      "utf8",
    ),
  ]);

  for (const source of [agentGuide, orchestration]) {
    const compact = source.replaceAll("\n", " ");
    assert.match(compact, /真实.*preflight.*宿主权限/u);
    assert.match(compact, /沙箱.*不能.*VoxCPM.*不可用/u);
    assert.match(compact, /不.*降低.*Chromium.*sandbox/u);
  }
});
