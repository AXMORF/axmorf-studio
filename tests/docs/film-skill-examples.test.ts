import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const skill = ".agents/skills/axmorf-film/references";

test("landscape Skill example stays identical to the compiled gallery source", async () => {
  const source = await readFile(`${skill}/examples.md`, "utf8");
  const example = source.match(/```tsx\n([\s\S]*?)```/u)?.[1];
  const gallery = await readFile(
    "packages/studio/src/remotion/compositions/capability-gallery/AxiomStoryExample.tsx",
    "utf8",
  );
  assert.equal(
    example?.replace(
      'from "@axmorf/studio/remotion"',
      'from "../../../remotion"',
    ),
    gallery,
  );
});

test("all six recipe cards compile against the public runtime API", async () => {
  const source = await readFile(`${skill}/recipes.md`, "utf8");
  const snippets = [...source.matchAll(/```tsx\n([\s\S]*?)```/gu)];
  assert.equal(snippets.length, 6);
  const files = new Map(
    snippets.map((match, i) => [
      path.resolve(`tests/docs/__recipe-card-${i}.tsx`),
      match[1],
    ]),
  );
  const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    process.cwd(),
  );
  const host = ts.createCompilerHost(parsed.options);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
    const text = files.get(fileName);
    return text === undefined
      ? originalGetSourceFile(fileName, languageVersion, onError, shouldCreate)
      : ts.createSourceFile(
          fileName,
          text,
          languageVersion,
          true,
          ts.ScriptKind.TSX,
        );
  };
  const program = ts.createProgram([...files.keys()], parsed.options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => process.cwd(),
      getCanonicalFileName: (name) => name,
      getNewLine: () => "\n",
    }),
  );
});
