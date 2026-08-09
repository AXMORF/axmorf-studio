import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  checkDocumentedNpmScripts,
  checkMarkdownLinks,
  isActiveDocumentationPath,
  isCurrentOperationalDocumentationPath,
  runDocsLinkCheck,
} from "../../scripts/docs/check-links";

const execFileAsync = promisify(execFile);

test("default documentation scope excludes historical archive snapshots", () => {
  assert.equal(isActiveDocumentationPath("docs/README.md"), true);
  assert.equal(isActiveDocumentationPath("docs/guides/REVIEW_MODEL.md"), true);
  assert.equal(
    isActiveDocumentationPath("docs/archive/implementation-plans/old.md"),
    false,
  );
});

test("npm script checks exclude historical evidence and proposals", () => {
  assert.equal(isCurrentOperationalDocumentationPath("docs/README.md"), true);
  assert.equal(
    isCurrentOperationalDocumentationPath("docs/guides/LOCAL_DELIVERY.md"),
    true,
  );
  assert.equal(
    isCurrentOperationalDocumentationPath("docs/evidence/old.md"),
    false,
  );
  assert.equal(
    isCurrentOperationalDocumentationPath("docs/promotions/future.md"),
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

test("documented npm scripts must exist in package.json", async () => {
  await withFixture(
    {
      "package.json": `${JSON.stringify({ scripts: { check: "true" } })}\n`,
      "README.md": "npm run check\nnpm run missing:script\n",
      "docs/evidence/old.md": "npm run removed:historical\n",
    },
    async (rootDir) => {
      await assert.rejects(
        () =>
          checkDocumentedNpmScripts({
            markdownPaths: [
              "README.md",
              "docs/evidence/old.md",
            ],
            rootDir,
          }),
        /README\.md:2: unknown package script.*missing:script/i,
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

test("default scope ignores tracked Markdown removed from the current Project set", async () => {
  await withFixture(
    {
      "README.md": "# Current\n",
      "package.json": `${JSON.stringify({ scripts: {} })}\n`,
      "src/projects/removable/incident.md": "[Missing](missing.md)\n",
    },
    async (rootDir) => {
      await execFileAsync("git", ["init", "-q"], { cwd: rootDir });
      await execFileAsync("git", ["add", "README.md", "src/projects/removable/incident.md"], {
        cwd: rootDir,
      });
      await rm(path.join(rootDir, "src/projects/removable"), {
        recursive: true,
      });
      const result = await runDocsLinkCheck(rootDir);
      assert.equal(result.fileCount, 1);
    },
  );
});
