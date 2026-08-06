import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("real production preflight requires host permissions and sandbox failures stay diagnostic", async () => {
  const [agentGuide, orchestration, workflow, packageJsonText] = await Promise.all([
    readFile(new URL("../../AGENTS.md", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../../docs/guides/PRODUCTION_ORCHESTRATION.md",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../.agents/skills/remotion-story-producer-video/references/direct-production-workflow.md",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../../package.json", import.meta.url), "utf8"),
  ]);

  for (const source of [agentGuide, orchestration]) {
    const compact = source.replaceAll("\n", " ");
    assert.match(compact, /真实.*preflight.*宿主权限/u);
    assert.match(compact, /沙箱.*不能.*VoxCPM.*不可用/u);
    assert.match(compact, /不.*降低.*Chromium.*sandbox/u);
  }

  const compactGuide = agentGuide.replaceAll("\n", " ");
  assert.match(compactGuide, /`npm run check`.*首次.*宿主权限/u);
  assert.match(compactGuide, /`npm run compositions`.*首次.*宿主权限/u);

  const compactWorkflow = workflow.replaceAll("\n", " ");
  assert.match(compactWorkflow, /`npm run check`.*host permissions/u);
  assert.match(compactWorkflow, /`npm run compositions`.*host permissions/u);

  const packageJson = JSON.parse(packageJsonText) as {
    readonly scripts: Readonly<Record<string, string>>;
  };
  assert.equal(
    packageJson.scripts.check,
    "npm run check:static && npm run check:host",
  );
  assert.match(packageJson.scripts["check:static"] ?? "", /npm run test/u);
  assert.doesNotMatch(
    packageJson.scripts["check:static"] ?? "",
    /compositions|remotion\s+(?:still|render)/u,
  );
  assert.match(
    packageJson.scripts["check:host"] ?? "",
    /npm run compositions/u,
  );
});
