import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import { validateVisualShellSourceGraph } from "../../scripts/production/visual-shell-source-validator";

const createRoot = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-visual-shell-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  const shellDir = join(rootDir, "src/projects/story-example/visual-shell");
  await mkdir(shellDir, { recursive: true });
  return { rootDir, shellDir };
};

test("accepts a project-local static decorative VisualShell graph", async (context) => {
  const { rootDir, shellDir } = await createRoot(context);
  await writeFile(
    join(shellDir, "motif.tsx"),
    'import {AbsoluteFill} from "remotion";\nexport const Motif = () => <AbsoluteFill style={{opacity: 0.2}} />;\n',
  );
  await writeFile(
    join(shellDir, "VisualShell.tsx"),
    'import type {PropsWithChildren} from "react";\nimport {AbsoluteFill} from "remotion";\nimport {Motif} from "./motif";\nexport default function VisualShell({children}: PropsWithChildren) { return <AbsoluteFill><Motif />{children}</AbsoluteFill>; }\n',
  );

  const result = await validateVisualShellSourceGraph({
    rootDir,
    storyId: "story-example",
  });
  assert.match(result.visualShellSourceGraphFingerprint, /^sha256:[a-f0-9]{64}$/u);
  assert.deepEqual(
    result.sourcePaths,
    [
      "src/projects/story-example/visual-shell/motif.tsx",
      "src/projects/story-example/visual-shell/VisualShell.tsx",
    ],
  );
});

test("rejects missing symlinked cross-boundary or executable VisualShell sources", async (context) => {
  await context.test("missing", async (child) => {
    const { rootDir } = await createRoot(child);
    await assert.rejects(
      () => validateVisualShellSourceGraph({ rootDir, storyId: "story-example" }),
      /missing|regular file/i,
    );
  });

  await context.test("symlink", async (child) => {
    const { rootDir, shellDir } = await createRoot(child);
    const target = join(rootDir, "outside.tsx");
    await writeFile(target, "export default () => null;\n");
    await symlink(target, join(shellDir, "VisualShell.tsx"));
    await assert.rejects(
      () => validateVisualShellSourceGraph({ rootDir, storyId: "story-example" }),
      /symbolic|regular file/i,
    );
  });

  for (const [label, source] of [
    ["cross project", 'import Other from "../scenes/opening/Renderer"; export default Other;'],
    ["visible text", "export default () => <div>Production title</div>;"],
    ["caption", 'import {CaptionLayer} from "../../../remotion/runtime/captions"; export default CaptionLayer;'],
    ["scene dsl", "const Shot = () => null; export default Shot;"],
    ["audio", 'import {Audio} from "remotion"; export default Audio;'],
    ["network", 'fetch("https://example.com"); export default () => null;'],
    ["filesystem", 'import fs from "node:fs"; export default fs;'],
    ["dynamic import", 'void import("./motif"); export default () => null;'],
    ["css animation", 'export default () => <div style={{animation: "spin 1s"}} />;'],
  ] as const) {
    await context.test(label, async (child) => {
      const { rootDir, shellDir } = await createRoot(child);
      await writeFile(join(shellDir, "VisualShell.tsx"), `${source}\n`);
      await assert.rejects(() =>
        validateVisualShellSourceGraph({ rootDir, storyId: "story-example" }),
      );
    });
  }
});
