import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  TaskExecutionContractSchema,
  buildProducerTaskSpec,
  serializeCanonicalJson,
} from "../../src/contracts";
import { createTaskWorkspace } from "../../scripts/project-production/adapters/task-workspace";
import { finalizeAgentTaskWorkspace } from "../../scripts/project-production/application/finalize-agent-task";
import { createProductionLocations, createRepositoryProductionLocations } from "../../scripts/project-production/application/production-locations";
import { buildTaskExecutionContract } from "../../scripts/project-production/application/task-execution-contract";
import { createScenePackageInput } from "../fixtures/scene/package-input";

const checksum = (value: string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}` as const;

test("Agent Scene task contract is immutable, self-describing, and finalize computes derived artifacts", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-task-contract-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const locations = createProductionLocations({
    ...createRepositoryProductionLocations({ repositoryRoot: rootDir }),
    runtimeResources: join(import.meta.dirname, "../.."),
  });
  const fixture = createScenePackageInput();
  const taskContext = { scene: { taskInput: fixture.task } };
  const taskContract = buildTaskExecutionContract({
    taskKind: "scene-owner",
    context: taskContext,
  });
  const contextBytes = `${serializeCanonicalJson(taskContext)}\n`;
  const contractBytes = `${serializeCanonicalJson(taskContract)}\n`;
  const task = buildProducerTaskSpec({
    taskKind: "scene-owner",
    storyId: fixture.task.storyId,
    semanticId: fixture.task.meaningId,
    revisionId: `revision-${"1".repeat(64)}`,
    dependencyArtifacts: [],
    inputFingerprints: [
      { id: "read:inputs/context.json", fingerprint: checksum(contextBytes) },
      {
        id: "read:inputs/task-contract.json",
        fingerprint: checksum(contractBytes),
      },
    ],
    declaredReadSet: ["inputs/context.json", "inputs/task-contract.json"],
    declaredOutputSet: taskContract.outputs.map(({ path }) => path).sort(),
    validatorPolicyVersion: "scene-owner-validator-v2",
  });
  const workspace = await createTaskWorkspace({
    locations,
    task,
    seedFiles: {
      "inputs/context.json": contextBytes,
      "inputs/task-contract.json": contractBytes,
    },
  });
  for (const output of taskContract.outputs) {
    if (output.example === undefined) continue;
    const destination = join(workspace, output.path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(
      destination,
      output.format === "json"
        ? `${JSON.stringify(output.example)}\n`
        : String(output.example),
    );
  }

  const result = await finalizeAgentTaskWorkspace({
    locations,
    taskRevision: task.taskRevision,
  });
  assert.equal(result.status, "agent-task-finalized");
  assert.equal(result.checkStatus, "task-workspace-valid");
  assert.equal(
    TaskExecutionContractSchema.parse(
      JSON.parse(
        await readFile(join(workspace, "inputs/task-contract.json"), "utf8"),
      ),
    ).taskKind,
    "scene-owner",
  );
  const visual = JSON.parse(
    await readFile(join(workspace, "src/visual-plan.json"), "utf8"),
  ) as { readonly visualPlanFingerprint?: unknown };
  assert.match(String(visual.visualPlanFingerprint), /^sha256:[0-9a-f]{64}$/u);
  const fidelity = JSON.parse(
    await readFile(
      join(workspace, "src/generated/reference-fidelity.generated.json"),
      "utf8",
    ),
  ) as { readonly status?: unknown };
  assert.equal(fidelity.status, "not-applicable");

  const visualPath = join(workspace, "src/visual-plan.json");
  const outsidePath = join(rootDir, "outside-visual.json");
  const outsideBytes = await readFile(visualPath, "utf8");
  await writeFile(outsidePath, outsideBytes);
  await rm(visualPath);
  await symlink(outsidePath, visualPath);
  await assert.rejects(
    finalizeAgentTaskWorkspace({
      locations,
      taskRevision: task.taskRevision,
    }),
    /regular file/u,
  );
  assert.equal(await readFile(outsidePath, "utf8"), outsideBytes);
});
