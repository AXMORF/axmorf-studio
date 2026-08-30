import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildProducerTaskSpec,
  deriveCoverCompositionBaseId,
} from "@axmorf/studio/contracts";
import { checkCoverTask } from "../../scripts/project-production/application/cover-task-check";
import { createTaskWorkspace } from "../../scripts/project-production/adapters/task-workspace";

const checksum = (value: string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}` as const;
const storyId = "story-example";
const compositionId = deriveCoverCompositionBaseId(storyId);

const cover4x3 = `
const Cover4x3 = () => <div style={{width: 1600, height: 1200}} />;
export default Cover4x3;
`;
const cover3x4 = `
const Cover3x4 = () => <div style={{width: 1200, height: 1600}} />;
export default Cover3x4;
`;
const rootSource = ({
  width4x3 = 1600,
}: { readonly width4x3?: number } = {}) => `
import {Composition} from "remotion";
import Cover4x3 from "./Cover4x3";
import Cover3x4 from "./Cover3x4";
export const CoverRoot = () => (
  <>
    <Composition id="${compositionId}DeliveryCover4x3V2" component={Cover4x3} width={${width4x3}} height={1200} fps={30} durationInFrames={1} />
    <Composition id="${compositionId}DeliveryCover3x4V2" component={Cover3x4} width={1200} height={1600} fps={30} durationInFrames={1} />
  </>
);
`;
const indexSource = `
import {registerRoot} from "remotion";
import {CoverRoot} from "./Root";
registerRoot(CoverRoot);
`;

type CoverSources = Readonly<{
  "Cover4x3.tsx": string;
  "Cover3x4.tsx": string;
  "Root.tsx": string;
  "index.ts": string;
}>;

const validSources = (): CoverSources => ({
  "Cover4x3.tsx": cover4x3,
  "Cover3x4.tsx": cover3x4,
  "Root.tsx": rootSource(),
  "index.ts": indexSource,
});

const createCoverWorkspace = async ({
  rootDir,
  sources = validSources(),
}: {
  readonly rootDir: string;
  readonly sources?: CoverSources;
}) => {
  const contextBytes = "{}\n";
  const task = buildProducerTaskSpec({
    taskKind: "cover-owner",
    storyId,
    semanticId: null,
    revisionId: `revision-${"1".repeat(64)}`,
    dependencyArtifacts: [],
    inputFingerprints: [
      {
        id: "read:inputs/context.json",
        fingerprint: checksum(contextBytes),
      },
    ],
    declaredReadSet: ["inputs/context.json"],
    declaredOutputSet: [
      "src/Cover3x4.tsx",
      "src/Cover4x3.tsx",
      "src/Root.tsx",
      "src/index.ts",
    ],
    validatorPolicyVersion: "cover-owner-validator-v1",
  });
  const workspace = await createTaskWorkspace({
    rootDir,
    task,
    seedFiles: { "inputs/context.json": contextBytes },
  });
  await mkdir(join(workspace, "src"), { recursive: true });
  for (const [fileName, source] of Object.entries(sources)) {
    await writeFile(join(workspace, "src", fileName), source);
  }
  return task;
};

test("Cover task accepts two independent fixed-size Composition sources", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-cover-task-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const task = await createCoverWorkspace({ rootDir });

  assert.equal(
    (await checkCoverTask({ rootDir, taskRevision: task.taskRevision })).status,
    "task-workspace-valid",
  );
});

test("Cover task rejects asset-backed source", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-cover-asset-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const task = await createCoverWorkspace({
    rootDir,
    sources: {
      ...validSources(),
      "Cover4x3.tsx": `const Cover4x3 = () => <img />; export default Cover4x3;`,
    },
  });

  await assert.rejects(
    checkCoverTask({ rootDir, taskRevision: task.taskRevision }),
    /code-only boundary|code-only graphics/iu,
  );
});

test("Cover task rejects network-backed source", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-cover-network-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const task = await createCoverWorkspace({
    rootDir,
    sources: {
      ...validSources(),
      "Cover3x4.tsx": `const endpoint = "https://example.com/cover"; const Cover3x4 = () => <div>{endpoint}</div>; export default Cover3x4;`,
    },
  });

  await assert.rejects(
    checkCoverTask({ rootDir, taskRevision: task.taskRevision }),
    /network access|remote resources/iu,
  );
});

test("Cover task rejects a Composition with the wrong fixed dimensions", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-cover-dimensions-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const task = await createCoverWorkspace({
    rootDir,
    sources: { ...validSources(), "Root.tsx": rootSource({ width4x3: 1599 }) },
  });

  await assert.rejects(
    checkCoverTask({ rootDir, taskRevision: task.taskRevision }),
    /two independent fixed one-frame Compositions/u,
  );
});

test("Cover task cannot take ownership of a GlobalVisual layer", async (context) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-cover-global-visual-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const task = await createCoverWorkspace({
    rootDir,
    sources: {
      ...validSources(),
      "Cover4x3.tsx": `${cover4x3}\nconst GlobalVisualBaseLayer = null;\nvoid GlobalVisualBaseLayer;`,
    },
  });

  await assert.rejects(
    checkCoverTask({ rootDir, taskRevision: task.taskRevision }),
    /GlobalVisualBaseLayer/u,
  );
});
