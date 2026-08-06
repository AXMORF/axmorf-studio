import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  parseProjectValidationArgs,
  parseProjectVerificationProfiles,
  resolveProfileSteps,
} from "../../scripts/project-validation/profiles";
import { resolveProjectVerificationInvocation } from "../../scripts/project-validation/adapters";

const loadProfiles = async () =>
  parseProjectVerificationProfiles(
    JSON.parse(
      await readFile(
        join(process.cwd(), "scripts/project-validation/formal-projects.json"),
        "utf8",
      ),
    ),
  );

test("formal project verification profiles are static, ordered, and complete", async () => {
  const profiles = await loadProfiles();
  assert.deepEqual(
    profiles.projects.map(({ projectId }) => projectId),
    ["gps-relativity", "product-comic-vertical"],
  );
  assert.deepEqual(resolveProfileSteps(profiles, "gps-relativity", "full"), [
    "narrative",
    "scene-audio",
    "scene-inputs",
    "scene-evidence",
    "global-audio",
    "final-inputs",
    "final-assembly",
    "final-evidence",
    "approval",
    "final",
  ]);
  assert.deepEqual(
    resolveProfileSteps(profiles, "product-comic-vertical", "full"),
    [
      "narrative",
      "scene-audio",
      "global-audio",
      "scene-evidence",
      "final-assembly",
      "final-evidence",
      "approval",
      "final",
    ],
  );
  assert.deepEqual(
    resolveProfileSteps(profiles, "gps-relativity", "evidence"),
    ["scene-evidence", "final-evidence"],
  );
  assert.deepEqual(
    resolveProfileSteps(profiles, "product-comic-vertical", "approval"),
    ["approval"],
  );
});

test("project validation CLI accepts only exact static forms", () => {
  assert.deepEqual(parseProjectValidationArgs(["--all"]), {
    target: "all",
    scope: "full",
  });
  assert.deepEqual(
    parseProjectValidationArgs(["evidence", "--project", "gps-relativity"]),
    { target: "gps-relativity", scope: "evidence" },
  );
  assert.deepEqual(
    parseProjectValidationArgs([
      "--project",
      "gps-relativity",
      "--scope",
      "evidence",
    ]),
    { target: "gps-relativity", scope: "evidence" },
  );
  assert.throws(() =>
    parseProjectValidationArgs(["--project", "gps-relativity"]),
  );
  assert.throws(() =>
    parseProjectValidationArgs([
      "--project",
      "gps-relativity",
      "--scope",
      "repair",
    ]),
  );
});

test("every declared verification step has a repository-local static adapter", async () => {
  const profiles = await loadProfiles();
  for (const { projectId, steps } of profiles.projects) {
    for (const step of steps) {
      const invocation = resolveProjectVerificationInvocation({
        projectId,
        step,
      });
      assert.match(invocation.script, /^scripts\/[a-z0-9./-]+\.ts$/u);
      await access(join(process.cwd(), invocation.script));
    }
  }
  assert.throws(() =>
    resolveProjectVerificationInvocation({
      projectId: "unregistered-project",
      step: "scene-audio",
    }),
  );
});
