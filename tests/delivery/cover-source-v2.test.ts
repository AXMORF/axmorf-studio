import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import { collectDeliveryCoverSourceGraph } from "../../scripts/delivery/adapters/cover-source";

const createRoot = async (context: TestContext) => {
  const rootDir = await mkdtemp(join(tmpdir(), "rsp-cover-source-"));
  context.after(() => rm(rootDir, { recursive: true, force: true }));
  return rootDir;
};

const writeCoverSource = async ({
  rootDir,
  cover4x3 = "export default function Cover4x3(){return <div style={{backgroundColor:'#fff'}}>四比三</div>}",
  cover3x4 = "export default function Cover3x4(){return <div style={{backgroundColor:'#000'}}>三比四</div>}",
}: {
  readonly rootDir: string;
  readonly cover4x3?: string;
  readonly cover3x4?: string;
}) => {
  const directory = join(rootDir, "src/projects/cover-proof/delivery/cover");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "Cover4x3.tsx"), cover4x3);
  await writeFile(join(directory, "Cover3x4.tsx"), cover3x4);
  await writeFile(
    join(directory, "Root.tsx"),
    `import {Composition} from "remotion";\nimport Cover4x3 from "./Cover4x3";\nimport Cover3x4 from "./Cover3x4";\nexport const CoverRoot=()=> <><Composition id="CoverProofDeliveryCover4x3V2" component={Cover4x3} width={1600} height={1200} fps={30} durationInFrames={1}/><Composition id="CoverProofDeliveryCover3x4V2" component={Cover3x4} width={1200} height={1600} fps={30} durationInFrames={1}/></>;\n`,
  );
  await writeFile(
    join(directory, "index.ts"),
    `import {registerRoot} from "remotion";\nimport {CoverRoot} from "./Root";\nregisterRoot(CoverRoot);\n`,
  );
};

test("Cover source graph accepts only two independent code-only compositions", async (context) => {
  const rootDir = await createRoot(context);
  await writeCoverSource({ rootDir });
  const graph = await collectDeliveryCoverSourceGraph({ rootDir, storyId: "cover-proof", compositionId: "CoverProof" });
  assert.equal(graph.files.length, 4);
  assert.deepEqual(graph.compositions.map(({ width, height }) => [width, height]), [[1600, 1200], [1200, 1600]]);
});

test("Cover source rejects image audio video network remote font and production outputs", async (context) => {
  const forbidden = [
    `import {Img} from "remotion"; export default()=> <Img src="x"/>;`,
    `import {Audio} from "remotion"; export default()=> <Audio src="x"/>;`,
    `import {Html5Audio} from "remotion"; export default()=> <Html5Audio src="x"/>;`,
    `import {Video} from "remotion"; export default()=> <Video src="x"/>;`,
    `import {Html5Video} from "remotion"; export default()=> <Html5Video src="x"/>;`,
    `export default()=> <div style={{backgroundImage:"url(https://example.com/x.png)"}}/>;`,
    `import {loadFont} from "@remotion/google-fonts/NotoSansSC"; loadFont(); export default()=> <div/>;`,
    `import Scene from "../../../scenes/problem/Renderer"; export default()=> <Scene/>;`,
    `import Global from "../../../global-visual/GlobalVisualLayers"; export default()=> <Global/>;`,
    `export default()=> { fetch("https://example.com"); return <div/>; };`,
    `export default()=> { globalThis["fet" + "ch"]("x"); return <div/>; };`,
    `export default()=> { const Picture=globalThis["Im" + "age"]; return <Picture/>; };`,
    `import React from "react"; export default()=> React.createElement("img", {src:"x"});`,
    `export default()=> { const css=["u","rl(x)"].join(""); return <div style={{background:css}}/>; };`,
    `export default()=> <div style={{backgroundImage:"linear-gradient(#fff,#000)"}}/>;`,
    `export default()=> <link href={\`ht${"tps"}://example.com/x.css\`}/>;`,
    `export default()=> <div style={{["backgroundImage"]:\`u${"rl"}(ht${"tps"}://example.com/x)\`}}/>;`,
    `export default()=> { const props={src:"x"}; return <div {...props}/>; };`,
    `export default()=> { const paint={backgroundImage:"none"}; return <div style={{...paint}}/>; };`,
    `export default()=> { const bg=\`u${"rl"}(ht${"tps"}://example.com/x)\`; return <div style={{background:bg}}/>; };`,
    `export default()=> { (()=>{}).constructor("return fetch('ht' + 'tps://example.com/x')")(); return <div/>; };`,
    `export default()=> <div style={{background:'image-set("local.png" 1x)'}}/>;`,
  ];
  for (const source of forbidden) {
    await test(String(forbidden.indexOf(source)), async (subtest) => {
      const rootDir = await createRoot(subtest);
      await writeCoverSource({ rootDir, cover4x3: source });
      await assert.rejects(() => collectDeliveryCoverSourceGraph({ rootDir, storyId: "cover-proof", compositionId: "CoverProof" }));
    });
  }
  void context;
});

test("Cover source rejects shared Composition and mechanical reuse", async (context) => {
  const rootDir = await createRoot(context);
  await writeCoverSource({
    rootDir,
    cover3x4: `export {default} from "./Cover4x3";`,
  });
  await assert.rejects(() => collectDeliveryCoverSourceGraph({ rootDir, storyId: "cover-proof", compositionId: "CoverProof" }));
});
