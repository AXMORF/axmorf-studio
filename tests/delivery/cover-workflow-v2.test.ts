import assert from "node:assert/strict";
import { basename, join } from "node:path";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import test, { type TestContext } from "node:test";

import type { ProcessRunner } from "../../scripts/baseline/evidence";
import { runDeliveryCoverCheck } from "../../scripts/delivery/application/cover-check";
import { runDeliveryCoverFreeze } from "../../scripts/delivery/application/cover-freeze";
import { loadCurrentDeliveryCoverResult } from "../../scripts/delivery/application/cover-inputs";
import { runDeliveryCoverSubmit } from "../../scripts/delivery/application/cover-submit";

const sha = (value: string) => `sha256:${value.repeat(64)}`;

const fakePng = (width: number, height: number) => {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set(new TextEncoder().encode("IHDR"), 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
};

const processRunner = (calls: string[]): ProcessRunner => async (command, args) => {
  calls.push(`${basename(command)} ${args.join(" ")}`);
  if (basename(command) === "remotion") {
    const compositionId = String(args[2]);
    const output = String(args[3]);
    await writeFile(
      output,
      fakePng(
        compositionId.endsWith("Cover4x3V2") ? 1600 : 1200,
        compositionId.endsWith("Cover4x3V2") ? 1200 : 1600,
      ),
    );
    return { status: 0, stdout: "", stderr: "" };
  }
  if (basename(command) === "ffmpeg") {
    return { status: 0, stdout: "", stderr: "" };
  }
  throw new Error(`Unexpected process: ${command}`);
};

const writeJson = async (path: string, value: unknown) => {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
};

const createProject = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-cover-workflow-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const project = join(rootDir, "src/projects/cover-proof");
  await writeJson(join(project, "story.json"), {
    schemaVersion: 1,
    storyId: "cover-proof",
    title: "纯代码封面",
    beats: [
      {
        meaningId: "cover-meaning",
        narrativePurpose: "解释封面边界",
        ttsChunks: [{ chunkId: "cover-chunk", ttsText: "封面独立制作。" }],
        explicitPauses: [],
      },
    ],
  });
  await writeJson(join(project, "visual-style.json"), {
    schemaVersion: 1,
    storyId: "cover-proof",
    styleProfileId: "comic-editorial",
    resourceCatalogFingerprint: sha("1"),
    artDirection: {
      medium: "纯代码漫画图形",
      palette: "暖黄深蓝",
      lighting: "平面高对比",
      texture: "代码绘制网点",
      compositionGrammar: "大标题图形叙事",
      motionLanguage: "静态",
      typography: "粗体中文",
    },
    continuityRules: ["两个比例保持同一品牌"],
    forbiddenTreatments: ["禁止图片"],
  });
  const cover = join(project, "delivery/cover");
  await mkdir(cover, { recursive: true });
  await writeFile(
    join(cover, "Cover4x3.tsx"),
    `import {AbsoluteFill} from "remotion"; export default function Cover4x3(){return <AbsoluteFill style={{backgroundColor:"#f5c542"}}><div>纯代码封面</div></AbsoluteFill>}`,
  );
  await writeFile(
    join(cover, "Cover3x4.tsx"),
    `import {AbsoluteFill} from "remotion"; export default function Cover3x4(){return <AbsoluteFill style={{backgroundColor:"#14213d"}}><div>独立竖版</div></AbsoluteFill>}`,
  );
  await writeFile(
    join(cover, "Root.tsx"),
    `import {Composition} from "remotion";\nimport Cover4x3 from "./Cover4x3";\nimport Cover3x4 from "./Cover3x4";\nexport const CoverRoot=()=> <><Composition id="CoverProofDeliveryCover4x3V2" component={Cover4x3} width={1600} height={1200} fps={30} durationInFrames={1}/><Composition id="CoverProofDeliveryCover3x4V2" component={Cover3x4} width={1200} height={1600} fps={30} durationInFrames={1}/></>;\n`,
  );
  await writeFile(
    join(cover, "index.ts"),
    `import {registerRoot} from "remotion";\nimport {CoverRoot} from "./Root";\nregisterRoot(CoverRoot);\n`,
  );
  return { rootDir, project, cover };
};

test("Cover freeze reads only StorySpec VisualStyleSpec and fixed CoverSpec", async (context) => {
  const fixture = await createProject(context);
  const frozen = await runDeliveryCoverFreeze({
    rootDir: fixture.rootDir,
    projectId: "cover-proof",
  });
  assert.equal(frozen.status, "cover-inputs-frozen");
  const assignment = JSON.parse(
    await readFile(join(fixture.cover, "assignment.generated.json"), "utf8"),
  ) as { inputs: readonly { kind: string }[] };
  assert.deepEqual(assignment.inputs.map(({ kind }) => kind), [
    "story-spec",
    "visual-style-spec",
    "fixed-cover-spec",
  ]);
  const repeated = await runDeliveryCoverFreeze({
    rootDir: fixture.rootDir,
    projectId: "cover-proof",
  });
  assert.equal(repeated.noOp, true);
});

test("Cover check and submit render both exact PNGs, check thumbnails, and seal immutable result", async (context) => {
  const fixture = await createProject(context);
  await runDeliveryCoverFreeze({ rootDir: fixture.rootDir, projectId: "cover-proof" });
  const calls: string[] = [];
  const checked = await runDeliveryCoverCheck({
    rootDir: fixture.rootDir,
    projectId: "cover-proof",
    runProcess: processRunner(calls),
  });
  assert.equal(checked.status, "ready-to-submit");
  assert.equal(calls.filter((call) => call.startsWith("remotion ")).length, 2);
  assert.equal(calls.filter((call) => call.includes("scale=320:240")).length, 1);
  assert.equal(calls.filter((call) => call.includes("scale=240:320")).length, 1);

  const submitted = await runDeliveryCoverSubmit({
    rootDir: fixture.rootDir,
    projectId: "cover-proof",
    runProcess: processRunner(calls),
  });
  assert.equal(submitted.status, "cover-ready");
  const loaded = await loadCurrentDeliveryCoverResult({
    rootDir: fixture.rootDir,
    projectId: "cover-proof",
    runProcess: processRunner(calls),
  });
  assert.equal(loaded.result.resultFingerprint, submitted.resultFingerprint);
  const before = (await stat(loaded.resultPath)).mtimeMs;
  const repeated = await runDeliveryCoverSubmit({
    rootDir: fixture.rootDir,
    projectId: "cover-proof",
    runProcess: processRunner(calls),
  });
  assert.equal(repeated.noOp, true);
  assert.equal((await stat(loaded.resultPath)).mtimeMs, before);
});

test("Cover missing malformed stale source or media fails closed", async (context) => {
  const fixture = await createProject(context);
  await assert.rejects(() =>
    runDeliveryCoverCheck({
      rootDir: fixture.rootDir,
      projectId: "cover-proof",
      runProcess: processRunner([]),
    }),
  );
  await runDeliveryCoverFreeze({ rootDir: fixture.rootDir, projectId: "cover-proof" });
  const assignmentPath = join(fixture.cover, "assignment.generated.json");
  const assignmentBytes = await readFile(assignmentPath);
  await writeFile(assignmentPath, "{malformed");
  await assert.rejects(() =>
    runDeliveryCoverCheck({
      rootDir: fixture.rootDir,
      projectId: "cover-proof",
      runProcess: processRunner([]),
    }),
  );
  await writeFile(assignmentPath, Uint8Array.from(assignmentBytes));
  const storyPath = join(fixture.project, "story.json");
  const storyBytes = await readFile(storyPath);
  const changedStory = JSON.parse(storyBytes.toString("utf8")) as Record<
    string,
    unknown
  >;
  changedStory.title = "封面 assignment 已漂移";
  await writeFile(storyPath, `${JSON.stringify(changedStory)}\n`);
  await assert.rejects(() =>
    runDeliveryCoverCheck({
      rootDir: fixture.rootDir,
      projectId: "cover-proof",
      runProcess: processRunner([]),
    }),
  );
  await writeFile(storyPath, Uint8Array.from(storyBytes));
  await runDeliveryCoverSubmit({
    rootDir: fixture.rootDir,
    projectId: "cover-proof",
    runProcess: processRunner([]),
  });
  const loaded = await loadCurrentDeliveryCoverResult({
    rootDir: fixture.rootDir,
    projectId: "cover-proof",
    runProcess: processRunner([]),
  });
  const resultRoot = join(fixture.rootDir, loaded.resultRoot);
  const packagePath = join(resultRoot, "cover-package.generated.json");
  const resultPath = join(resultRoot, "cover-result.generated.json");
  const widePath = join(resultRoot, "cover-4x3.png");
  const [packageBytes, resultBytes, wideBytes] = await Promise.all([
    readFile(packagePath),
    readFile(resultPath),
    readFile(widePath),
  ]);
  await rm(packagePath);
  await assert.rejects(() =>
    loadCurrentDeliveryCoverResult({
      rootDir: fixture.rootDir,
      projectId: "cover-proof",
      runProcess: processRunner([]),
    }),
  );
  await writeFile(packagePath, Uint8Array.from(packageBytes));
  await writeFile(resultPath, "{malformed");
  await assert.rejects(() =>
    loadCurrentDeliveryCoverResult({
      rootDir: fixture.rootDir,
      projectId: "cover-proof",
      runProcess: processRunner([]),
    }),
  );
  await writeFile(resultPath, Uint8Array.from(resultBytes));
  const driftedWide = new Uint8Array(wideBytes.byteLength + 1);
  driftedWide.set(Uint8Array.from(wideBytes));
  await writeFile(widePath, driftedWide);
  await assert.rejects(() =>
    loadCurrentDeliveryCoverResult({
      rootDir: fixture.rootDir,
      projectId: "cover-proof",
      runProcess: processRunner([]),
    }),
  );
  await writeFile(widePath, Uint8Array.from(wideBytes));
  await writeFile(join(fixture.cover, "Cover3x4.tsx"), "export default () => <div>漂移</div>;");
  await assert.rejects(() =>
    loadCurrentDeliveryCoverResult({
      rootDir: fixture.rootDir,
      projectId: "cover-proof",
      runProcess: processRunner([]),
    }),
  );
});

test("Cover paths reject symbolic links in delivery cover and results parents", async (context) => {
  const freezeFixture = await createProject(context);
  const redirectedDelivery = join(freezeFixture.rootDir, "redirected-delivery");
  await mkdir(redirectedDelivery);
  await rm(join(freezeFixture.project, "delivery"), {
    recursive: true,
    force: true,
  });
  await symlink(redirectedDelivery, join(freezeFixture.project, "delivery"), "dir");
  await assert.rejects(
    () =>
      runDeliveryCoverFreeze({
        rootDir: freezeFixture.rootDir,
        projectId: "cover-proof",
      }),
    /symbolic links|unsafe/iu,
  );
  assert.deepEqual(await readdir(redirectedDelivery), []);

  const resultFixture = await createProject(context);
  await runDeliveryCoverFreeze({
    rootDir: resultFixture.rootDir,
    projectId: "cover-proof",
  });
  const redirectedResults = join(resultFixture.rootDir, "redirected-results");
  await mkdir(redirectedResults);
  await symlink(redirectedResults, join(resultFixture.cover, "results"), "dir");
  await assert.rejects(
    () =>
      runDeliveryCoverSubmit({
        rootDir: resultFixture.rootDir,
        projectId: "cover-proof",
        runProcess: processRunner([]),
      }),
    /symbolic links|unsafe/iu,
  );
  assert.deepEqual(await readdir(redirectedResults), []);
});

test("Cover submit leaves no immutable result when the final source recheck fails", async (context) => {
  const fixture = await createProject(context);
  const frozen = await runDeliveryCoverFreeze({
    rootDir: fixture.rootDir,
    projectId: "cover-proof",
  });
  const calls: string[] = [];
  const baseRunner = processRunner(calls);
  let thumbnailCount = 0;
  const driftingRunner: ProcessRunner = async (command, args) => {
    const result = await baseRunner(command, args);
    if (basename(command) === "ffmpeg" && ++thumbnailCount === 2) {
      await writeFile(
        join(fixture.cover, "Cover4x3.tsx"),
        `export default function Cover4x3(){return <div>最终复验前漂移</div>}`,
      );
    }
    return result;
  };
  await assert.rejects(
    () =>
      runDeliveryCoverSubmit({
        rootDir: fixture.rootDir,
        projectId: "cover-proof",
        runProcess: driftingRunner,
      }),
    /drifted before immutable promotion/iu,
  );
  await assert.rejects(() =>
    stat(
      join(
        fixture.cover,
        "results",
        frozen.assignmentFingerprint.slice(7),
      ),
    ),
  );
  assert.deepEqual(await readdir(join(fixture.cover, ".staging")), []);
});
