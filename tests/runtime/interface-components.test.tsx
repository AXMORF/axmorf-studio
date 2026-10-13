import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Internals } from "remotion";

import {
  CodePanel,
  InterfaceWindow,
  RepositoryCard,
  TerminalPanel,
  resolveInterfaceFontSize,
  resolveTerminalReveal,
  tokenizeCodeLine,
} from "../../packages/studio/src/remotion/capabilities/visual-components";

const render = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <Internals.CanUseRemotionHooksProvider>
      <Internals.TimelineContext.Provider
        value={{
          frame: {},
          playing: false,
          rootId: "test",
          imperativePlaying: { current: false },
          audioAndVideoTags: { current: [] },
        }}
      >
        {node}
      </Internals.TimelineContext.Provider>
    </Internals.CanUseRemotionHooksProvider>,
  );

const fontSizes = (markup: string) =>
  [...markup.matchAll(/font-size:(\d+(?:\.\d+)?)px/gu)].map((match) =>
    Number(match[1]),
  );

test("interface text never renders below the frozen minimum font size", () => {
  assert.equal(resolveInterfaceFontSize(30, 18), 30);
  assert.equal(resolveInterfaceFontSize(30, 44), 44);
  assert.throws(() => resolveInterfaceFontSize(0), /positive minFontSizePx/u);

  const markup = render(
    <InterfaceWindow
      width={900}
      height={700}
      minFontSizePx={30}
      chromeFontSizePx={12}
      url="example.com/docs"
    >
      <TerminalPanel
        frame={400}
        minFontSizePx={30}
        fontSizePx={10}
        lines={[{ kind: "command", text: "npm test" }]}
      />
      <CodePanel
        frame={400}
        minFontSizePx={30}
        fontSizePx={14}
        fileName="a.ts"
        code={"const a = 1;"}
      />
      <RepositoryCard
        owner="o"
        name="n"
        description="d"
        topics={["t"]}
        width={800}
        minFontSizePx={30}
        fontSizePx={8}
        stars="1.2k"
      />
    </InterfaceWindow>,
  );
  const sizes = fontSizes(markup);
  assert.ok(sizes.length > 10);
  assert.ok(
    sizes.every((size) => size >= 30),
    `sizes: ${sizes.join(",")}`,
  );
  assert.match(markup, /example\.com\/docs/u);
  assert.match(markup, /1\.2k/u);
});

test("terminal commands type out before following lines appear", () => {
  const lines = [
    { kind: "command", text: "npx run" },
    { kind: "output", text: "done" },
  ] as const;
  const options = { startFrame: 10, charsPerFrame: 1, lineDelayFrames: 5 };
  const before = resolveTerminalReveal(lines, 9, options);
  assert.equal(before[0]!.visible, false);
  const typing = resolveTerminalReveal(lines, 13, options);
  assert.equal(typing[0]!.visibleText, "npx");
  assert.equal(typing[0]!.typing, true);
  assert.equal(typing[1]!.visible, false);
  // The command ends at frame 17 and the output appears after the line delay.
  assert.equal(typing[1]!.startFrame, 22);
  const done = resolveTerminalReveal(lines, 22, options);
  assert.equal(done[0]!.visibleText, "npx run");
  assert.equal(done[1]!.visible, true);
  assert.throws(
    () => resolveTerminalReveal(lines, 0, { charsPerFrame: 0 }),
    /charsPerFrame/u,
  );
});

test("code tokenizer separates keywords, strings, numbers and comments", () => {
  assert.deepEqual(tokenizeCodeLine('const x = "a # b"; // note 2'), [
    { kind: "keyword", text: "const" },
    { kind: "plain", text: " " },
    { kind: "plain", text: "x" },
    { kind: "plain", text: " = " },
    { kind: "string", text: '"a # b"' },
    { kind: "plain", text: "; " },
    { kind: "comment", text: "// note 2" },
  ]);
  assert.deepEqual(tokenizeCodeLine("return 42"), [
    { kind: "keyword", text: "return" },
    { kind: "plain", text: " " },
    { kind: "number", text: "42" },
  ]);
});

test("code highlights fade in and dim unfocused lines", () => {
  const props = {
    code: "a\nb\nc",
    minFontSizePx: 24,
    framesPerLine: 0,
    highlights: [{ fromLine: 2, toLine: 2, startFrame: 10 }],
  };
  const before = render(<CodePanel {...props} frame={9} />);
  assert.doesNotMatch(before, /opacity:0\.45/u);
  const after = render(<CodePanel {...props} frame={30} />);
  assert.equal((after.match(/opacity:0\.45/gu) ?? []).length, 2);
});
