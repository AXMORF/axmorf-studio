import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  authorGpsM7Scene,
  runM7GpsAuthorCli,
} from "../../scripts/project-tools/gps-relativity/historical-scene-authoring";
import {
  GPS_M7_MEANING_IDS,
  buildGpsM7FrozenInputs,
} from "../../scripts/project-tools/gps-relativity/scene-inputs";
import { serializeCanonicalJson } from "../../src/contracts";

const rootDir = process.cwd();

test("M7 author CLI isolates one meaning and reserves all mode for read-only collection", async () => {
  const calls: unknown[] = [];
  const stdout: string[] = [];
  await runM7GpsAuthorCli(["--meaning", "net-drift", "--write"], {
    rootDir,
    stdout: (line) => stdout.push(line),
    author: async (input) => {
      calls.push(input);
      return input;
    },
  });
  assert.deepEqual(calls, [{ meaningId: "net-drift", mode: "write" }]);
  calls.length = 0;
  await runM7GpsAuthorCli(["--all", "--check"], {
    rootDir,
    stdout: (line) => stdout.push(line),
    author: async (input) => {
      calls.push(input);
      return input;
    },
  });
  assert.deepEqual(
    calls,
    GPS_M7_MEANING_IDS.map((meaningId) => ({ meaningId, mode: "check" })),
  );
  await assert.rejects(
    runM7GpsAuthorCli(["--all", "--write"], {
      rootDir,
      stdout: () => undefined,
      author: async () => undefined,
    }),
  );
});

test("five frozen SceneTaskInputs are current and own non-overlapping roots", async () => {
  const frozen = await buildGpsM7FrozenInputs(rootDir);
  const sceneRoots = new Set<string>();
  const publicRoots = new Set<string>();
  for (const task of frozen.tasks) {
    const persisted = JSON.parse(
      await readFile(
        join(
          rootDir,
          `src/projects/gps-relativity/scenes/${task.meaningId}/task-input.generated.json`,
        ),
        "utf8",
      ),
    );
    assert.equal(
      serializeCanonicalJson(persisted),
      serializeCanonicalJson(task),
    );
    sceneRoots.add(task.allowedDirectories.sceneRoot);
    publicRoots.add(task.allowedDirectories.publicAssetRoot);
  }
  assert.equal(sceneRoots.size, GPS_M7_MEANING_IDS.length);
  assert.equal(publicRoots.size, GPS_M7_MEANING_IDS.length);
});

test("all five authored Scenes pass their isolated current gate", async () => {
  for (const meaningId of GPS_M7_MEANING_IDS) {
    const result = await authorGpsM7Scene({
      rootDir,
      meaningId,
      mode: "check",
    });
    assert.equal(result.meaningId, meaningId);
  }
});

test("authoring entries stay outside normal Root and ProjectRegistry", async () => {
  const [rootSource, registrySource, indexSource] = await Promise.all([
    readFile(join(rootDir, "src/Root.tsx"), "utf8"),
    readFile(
      join(rootDir, "src/projects/project-registry.generated.ts"),
      "utf8",
    ),
    readFile(join(rootDir, "src/index.ts"), "utf8"),
  ]);
  for (const source of [rootSource, registrySource, indexSource]) {
    assert.doesNotMatch(source, /M7Gps.*Authoring|m7-authoring/u);
  }
});
