import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import {
  FilmMusicSpecSchema,
  FilmMusicAlignmentSchema,
} from "@axmorf/studio/contracts";
import { generateScore } from "../../scripts/films/score/synth-score.mjs";
import {
  SCORE_ANCHOR_TOLERANCE_FRAMES,
  scoreOnsets,
} from "../../scripts/films/score/storyboard-score.mjs";

const skill = ".agents/skills/axmorf-film/references";

test("the default music guide generates a usable score with positive sections and exact drop", async () => {
  const source = await readFile(`${skill}/music.md`, "utf8");
  const example = JSON.parse(source.match(/```json\n([\s\S]*?)```/u)![1]);
  const music = FilmMusicSpecSchema.parse(example.music);
  const { timeline, audio } = generateScore({
    ...music.score,
    fps: 30,
    durationInFrames: 900,
  });
  assert.ok(timeline.durationInFrames >= 900);
  assert.ok(audio.length > 44);
  const alignment = FilmMusicAlignmentSchema.parse(timeline.alignment);
  assert.equal(timeline.bpm, 100.48);
  assert.ok(
    alignment.boundaries.every(
      (b) => Math.abs(b.residualFrames) <= SCORE_ANCHOR_TOLERANCE_FRAMES,
    ),
  );
  assert.deepEqual(
    alignment.boundaries.map((b) => b.actualFrame),
    [0, 215, 502, 573, 717],
  );
  assert.ok(scoreOnsets(timeline).hits.includes(576));
  assert.equal(music.underSpeechVolume, 0.145);
});

test("landscape Skill example stays identical to the compiled gallery source", async () => {
  const source = await readFile(`${skill}/examples.md`, "utf8");
  assert.equal(
    await readFile(
      `packages/create-axmorf-studio/template/${skill}/examples.md`,
      "utf8",
    ),
    source,
    "New Workspaces must receive the same landscape example as the repository.",
  );
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

test("all recipe cards and direction snippets compile against the public runtime API", async () => {
  const recipes = await readFile(`${skill}/recipes.md`, "utf8");
  const direction = await readFile(`${skill}/direction.md`, "utf8");
  const recipeSnippets = [...recipes.matchAll(/```tsx\n([\s\S]*?)```/gu)];
  const directionSnippets = [...direction.matchAll(/```tsx\n([\s\S]*?)```/gu)];
  assert.equal(recipeSnippets.length, 6);
  assert.equal(directionSnippets.length, 1);
  const snippets = [...recipeSnippets, ...directionSnippets];
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

test("direction example stays identical to the typechecked gallery source", async () => {
  const direction = await readFile(`${skill}/direction.md`, "utf8");
  const example = direction.match(/```tsx\n([\s\S]*?)```/u)?.[1];
  assert.equal(
    example?.replace(
      'from "@axmorf/studio/remotion"',
      'from "../../../remotion"',
    ),
    await readFile(
      "packages/studio/src/remotion/compositions/capability-gallery/RhythmDirectionExample.tsx",
      "utf8",
    ),
  );
});

test("repository and creator share every Skill file and matching Claude discovery adapters", async () => {
  const root = ".agents/skills/axmorf-film";
  const template = "packages/create-axmorf-studio/template";
  const paths = async (directory: string): Promise<string[]> => {
    const entries = await readdir(directory, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      if (entry.isDirectory())
        files.push(
          ...(await paths(`${directory}/${entry.name}`)).map(
            (p) => `${entry.name}/${p}`,
          ),
        );
      else files.push(entry.name);
    }
    return files.sort();
  };
  assert.deepEqual(await paths(root), await paths(`${template}/${root}`));
  for (const file of await paths(root))
    assert.equal(
      await readFile(`${root}/${file}`, "utf8"),
      await readFile(`${template}/${root}/${file}`, "utf8"),
      file,
    );
  const adapter = await readFile(".claude/skills/axmorf-film/SKILL.md", "utf8");
  assert.equal(
    adapter,
    await readFile(`${template}/.claude/skills/axmorf-film/SKILL.md`, "utf8"),
  );
  const canonical = await readFile(`${root}/SKILL.md`, "utf8");
  assert.equal(adapter.split("---")[1], canonical.split("---")[1]);
  assert.ok(adapter.includes(`${root}/SKILL.md`));
});
