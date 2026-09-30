import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { bundle } from "@remotion/bundler";
import {
  ensureBrowser,
  getCompositions,
  openBrowser,
  renderMedia,
  renderStill,
} from "@remotion/renderer";

import {
  SCENE_THEME_CASES,
  SCENE_THEME_CHECKPOINTS,
  SCENE_THEME_PROOF,
  checkpointFileName,
} from "../../../proofs/scene-theme/source/matrix";
import {
  checksum,
  collectBrowserEvidence,
  collectProofSourceEvidence,
  collectRemotionVersions,
  fileEvidence,
  inspectDecorationStill,
  inspectPng,
  inspectVideo,
} from "./evidence";

const rootDir = process.cwd();
const outputDirectory = SCENE_THEME_PROOF.outputDirectory;
const outDir = join(rootDir, outputDirectory);
const command = process.argv[2];
if (
  process.argv.length !== 3 ||
  (command !== "render" && command !== "check")
) {
  throw new Error(
    "Expected exactly render or check. Run render with host permissions.",
  );
}

const source = await collectProofSourceEvidence(rootDir);
const versions = await collectRemotionVersions();
const declaredVersion = (
  JSON.parse(await readFile(join(rootDir, "package.json"), "utf8")) as {
    dependencies: { remotion: string };
  }
).dependencies.remotion;
if (versions.remotion !== declaredVersion) {
  throw new Error(
    `Installed Remotion ${versions.remotion} differs from declared ${declaredVersion}.`,
  );
}

const browserStatus =
  command === "render"
    ? await ensureBrowser({
        browserExecutable: process.env.SCENE_THEME_PROOF_BROWSER_EXECUTABLE,
        logLevel: "info",
      })
    : {
        path: (
          JSON.parse(await readFile(join(outDir, "manifest.json"), "utf8")) as {
            host: { browser: { executable: string } };
          }
        ).host.browser.executable,
      };
if (!("path" in browserStatus))
  throw new Error("Proof browser preparation did not yield an executable.");
const browserEnvironment = await collectBrowserEvidence(browserStatus.path);

if (command === "render") {
  await mkdir(outDir, { recursive: true });
  // This proof has no assets; avoid copying unrelated Workspace public media.
  const publicDir = join(outDir, "empty-public");
  await mkdir(publicDir, { recursive: true });
  process.stdout.write(
    "Bundling fixed Scene theme proof. No providers or Project production.\n",
  );
  const serveUrl = await bundle({
    entryPoint: join(rootDir, "proofs/scene-theme/source/index.ts"),
    rootDir,
    outDir: join(outDir, "bundle"),
    publicDir,
    enableCaching: false,
  });
  process.stdout.write(
    `Bundle complete. Opening ${browserEnvironment.version}.\n`,
  );
  const browser = await openBrowser("chrome", {
    browserExecutable: browserStatus.path,
    logLevel: "error",
  });
  try {
    const compositions = await getCompositions(serveUrl, {
      puppeteerInstance: browser,
      logLevel: "error",
    });
    for (const scenario of SCENE_THEME_CASES) {
      const composition = compositions.find(({ id }) => id === scenario.id);
      if (
        !composition ||
        composition.width !== scenario.width ||
        composition.height !== scenario.height ||
        composition.durationInFrames !== SCENE_THEME_PROOF.durationInFrames ||
        composition.fps !== SCENE_THEME_PROOF.fps
      ) {
        throw new Error(
          `Proof composition differs from the fixed matrix: ${scenario.id}`,
        );
      }
      const scenarioDir = join(outDir, scenario.id);
      await mkdir(scenarioDir, { recursive: true });
      process.stdout.write(
        `${scenario.id}: rendering ${SCENE_THEME_CHECKPOINTS.length} full-size checkpoints.\n`,
      );
      for (const checkpoint of SCENE_THEME_CHECKPOINTS) {
        const props = {
          theme: scenario.theme,
          referenceCase: checkpoint.referenceCase,
        };
        await renderStill({
          serveUrl,
          composition: { ...composition, props },
          inputProps: props,
          output: join(scenarioDir, checkpointFileName(checkpoint)),
          frame: checkpoint.frame,
          scale: 1,
          imageFormat: "png",
          puppeteerInstance: browser,
          logLevel: "error",
        });
      }
      process.stdout.write(
        `${scenario.id}: rendering all 360 frames at scale 0.5.\n`,
      );
      await renderMedia({
        serveUrl,
        composition,
        outputLocation: join(scenarioDir, "animation.mp4"),
        codec: "h264",
        pixelFormat: "yuv420p",
        scale: 0.5,
        crf: 18,
        concurrency: 2,
        puppeteerInstance: browser,
        logLevel: "error",
      });
    }
  } finally {
    await browser.close({ silent: true });
  }
}

const cases = [];
for (const scenario of SCENE_THEME_CASES) {
  const stills = [];
  for (const checkpoint of SCENE_THEME_CHECKPOINTS) {
    const localPath = `${outputDirectory}/${scenario.id}/${checkpointFileName(checkpoint)}`;
    stills.push({
      ...checkpoint,
      ...(await fileEvidence(rootDir, localPath)),
      ...(await inspectPng(
        join(rootDir, localPath),
        scenario.width,
        scenario.height,
      )),
      ...(checkpoint.section === "body"
        ? {
            decoration: await inspectDecorationStill(
              join(rootDir, localPath),
              scenario.width,
              scenario.height,
              scenario.theme,
              checkpoint.sceneFrame,
            ),
          }
        : {}),
    });
  }
  const localPath = `${outputDirectory}/${scenario.id}/animation.mp4`;
  const video = {
    ...(await fileEvidence(rootDir, localPath)),
    ...(await inspectVideo(join(rootDir, localPath), {
      width: scenario.width / 2,
      height: scenario.height / 2,
      fps: SCENE_THEME_PROOF.fps,
      durationInFrames: SCENE_THEME_PROOF.durationInFrames,
    })),
  };
  cases.push({ ...scenario, stills, video });
}
if (
  (await collectProofSourceEvidence(rootDir)).fingerprint !== source.fingerprint
) {
  throw new Error(
    "Proof source changed while rendering. Evidence was not promoted.",
  );
}

const evidence = {
  schemaVersion: 1,
  proofId: "scene-theme-v1",
  status: "rendered-review-required",
  visualReview: "not-recorded",
  scope:
    "Fixed templates and actual SceneViewport/CompositionAssembly with a synthetic body. No provider, narration, Project or Delivery.",
  source,
  versions,
  host: {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    browser: browserEnvironment,
  },
  timeline: SCENE_THEME_PROOF,
  cases,
};
const manifest = {
  ...evidence,
  evidenceFingerprint: checksum(JSON.stringify(evidence)),
};
const manifestPath = join(outDir, "manifest.json");
if (command === "check") {
  const persisted = JSON.parse(await readFile(manifestPath, "utf8"));
  if (JSON.stringify(persisted) !== JSON.stringify(manifest)) {
    throw new Error(
      "Proof evidence is stale or bytes differ. Render again before visual review.",
    );
  }
} else {
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const escapeHtml = (value: string) =>
    value.replace(
      /[&<>"']/gu,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character]!,
    );
  const sections = cases
    .map(
      (
        scenario,
      ) => `<section><h2>${scenario.id}</h2><p>${scenario.width} × ${scenario.height}; background ${scenario.theme.background}</p>
    <video controls preload="metadata" src="${scenario.id}/animation.mp4"></video><div class="matrix">${scenario.stills
      .map(
        (still) =>
          `<figure><a href="${scenario.id}/${checkpointFileName(still)}"><img loading="lazy" src="${scenario.id}/${checkpointFileName(still)}"></a><figcaption>${escapeHtml(`${still.section} ${still.sceneFrame} · ${still.referenceCase} · ${still.purpose}`)}</figcaption></figure>`,
      )
      .join("")}</div></section>`,
    )
    .join("");
  await writeFile(
    join(outDir, "index.html"),
    `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Scene theme render proof</title>
    <style>body{font:16px system-ui;margin:32px;background:#eee;color:#171717}section{margin:48px 0}video{max-width:100%;max-height:70vh;background:#222}.matrix{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px}figure{margin:0}img{width:100%;display:block}figcaption{padding:8px 0}a{color:inherit}</style>
    <h1>Scene theme render proof</h1><p>仅记录真实渲染与机械媒体检查。视觉评审尚未记录，颜色数值或视频可解码不代表视觉通过。</p>
    <p>全分辨率 PNG 可点击查看；4 个 12 秒视频以 0.5 倍分辨率保留完整帧序列。重点检查最大缩放裁剪、引用文字、首尾与正文衔接。</p><p>Source: <code>${source.fingerprint}</code> · <a href="manifest.json">manifest.json</a></p>${sections}</html>\n`,
  );
}
process.stdout.write(
  `${command === "check" ? "Verified" : "Rendered"} ${cases.length * SCENE_THEME_CHECKPOINTS.length} stills and ${cases.length} full-animation videos. Visual review required.\n${manifestPath}\n`,
);
