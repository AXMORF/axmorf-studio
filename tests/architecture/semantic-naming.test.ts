import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { findMilestoneNamingViolations } from "../../scripts/architecture/semantic-naming";

test("active repository names describe domains instead of old milestones", async () => {
  assert.deepEqual(await findMilestoneNamingViolations(process.cwd()), []);
});

test("semantic naming guard rejects milestone APIs but permits SVG and M4A syntax", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-semantic-naming-"));
  const retiredMilestone = ["m", 6].join("");
  const retiredReceipt = ["M", 3, "Receipt"].join("");
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  await Promise.all([
    mkdir(join(rootDir, "src/contracts"), { recursive: true }),
    mkdir(join(rootDir, "docs/archive"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(join(rootDir, "AGENTS.md"), "Current rules.\n"),
    writeFile(join(rootDir, "README.md"), "Current overview.\n"),
    writeFile(join(rootDir, "package.json"), "{}\n"),
    writeFile(
      join(rootDir, `src/contracts/${retiredMilestone}-runtime.ts`),
      `export const ${retiredReceipt} = "legacy";\n`,
    ),
    writeFile(
      join(rootDir, "src/contracts/vector.ts"),
      'export const path = "M272 18H368"; export const audio = "voice.M4A";\n',
    ),
    writeFile(
      join(rootDir, "docs/archive/history.md"),
      [1, 3, 6, 8, 9].map((number) => `M${number}`).join(" "),
    ),
  ]);

  assert.deepEqual(await findMilestoneNamingViolations(rootDir), [
    `src/contracts/${retiredMilestone}-runtime.ts: milestone name in active path`,
  ]);
});
