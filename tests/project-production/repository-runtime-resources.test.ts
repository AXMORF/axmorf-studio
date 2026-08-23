import assert from "node:assert/strict";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveRepositoryRuntimeExecutionResources } from "../../scripts/project-production/adapters/repository-runtime-resources";

type ResolverDependencies = NonNullable<
  Parameters<typeof resolveRepositoryRuntimeExecutionResources>[1]
>;

test("read-only repository runtime resolution rejects before a browser download can write", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "rsp-runtime-readonly-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const downloadMarker = join(directory, "browser-download-started");
  let ensureCalls = 0;

  await assert.rejects(
    resolveRepositoryRuntimeExecutionResources(
      { mode: "read-only" },
      {
        ensureBrowser: (async (
          options: Parameters<ResolverDependencies["ensureBrowser"]>[0],
        ) => {
          ensureCalls += 1;
          options?.onBrowserDownload?.({ chromeMode: "headless-shell" });
          await writeFile(downloadMarker, "unexpected\n");
          return { type: "no-browser" };
        }) as never,
      },
    ),
    /unavailable during read-only inspection/u,
  );
  assert.equal(ensureCalls, 1);
  await assert.rejects(access(downloadMarker), /ENOENT/u);
});
