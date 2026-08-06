import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  checkMarkdownLinks,
  isActiveDocumentationPath,
} from "../../scripts/docs/check-links";

test("default documentation scope excludes historical archive snapshots", () => {
  assert.equal(isActiveDocumentationPath("docs/README.md"), true);
  assert.equal(isActiveDocumentationPath("docs/guides/REVIEW_MODEL.md"), true);
  assert.equal(
    isActiveDocumentationPath("docs/archive/implementation-plans/old.md"),
    false,
  );
});

const withFixture = async (
  files: Readonly<Record<string, string>>,
  run: (rootDir: string) => Promise<void>,
) => {
  const rootDir = await mkdtemp(path.join(tmpdir(), "rsp-doc-links-"));
  try {
    for (const [relativePath, contents] of Object.entries(files)) {
      const destination = path.join(rootDir, relativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, contents, "utf8");
    }
    await run(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
};

test("local relative files and current or target heading anchors pass without network", async () => {
  await withFixture(
    {
      "README.md": [
        "# Home",
        "",
        "[Current](#local-section)",
        "[Target](docs/guide.md#中文-heading)",
        "[External](https://example.invalid/not-requested)",
        "",
        "## Local section",
      ].join("\n"),
      "docs/guide.md": "# 中文 Heading\n",
    },
    async (rootDir) => {
      const result = await checkMarkdownLinks({
        markdownPaths: ["README.md", "docs/guide.md"],
        rootDir,
      });

      assert.deepEqual(result, {
        externalLinkCount: 1,
        fileCount: 2,
        localLinkCount: 2,
      });
    },
  );
});

test("missing local file fails closed", async () => {
  await withFixture(
    { "README.md": "[Missing](docs/missing.md)\n" },
    async (rootDir) => {
      await assert.rejects(
        () =>
          checkMarkdownLinks({
            markdownPaths: ["README.md"],
            rootDir,
          }),
        /missing local target.*docs\/missing\.md/i,
      );
    },
  );
});

test("missing heading anchor fails closed", async () => {
  await withFixture(
    {
      "README.md": "[Missing anchor](docs/guide.md#not-here)\n",
      "docs/guide.md": "# Present\n",
    },
    async (rootDir) => {
      await assert.rejects(
        () =>
          checkMarkdownLinks({
            markdownPaths: ["README.md", "docs/guide.md"],
            rootDir,
          }),
        /missing heading anchor.*not-here/i,
      );
    },
  );
});

test("repository escape fails before reading the target", async () => {
  await withFixture(
    { "docs/guide.md": "[Escape](../../outside.md)\n" },
    async (rootDir) => {
      await assert.rejects(
        () =>
          checkMarkdownLinks({
            markdownPaths: ["docs/guide.md"],
            rootDir,
          }),
        /escapes repository/i,
      );
    },
  );
});
