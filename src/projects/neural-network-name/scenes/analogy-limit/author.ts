import {mkdir, readFile, writeFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";

import {
  buildNotApplicableFidelityReceipt,
  buildSceneSoundPlan,
  buildSceneSyncAnchors,
  buildSceneVisualPlan,
  buildShotPlanSet,
  buildShotRecipeSelection,
  serializeCanonicalJson,
} from "../../../../contracts";

const run = async () => {
const rootDir = resolve(import.meta.dirname, "../../../../..");
const sceneRoot = import.meta.dirname;
const assignment = JSON.parse(
  await readFile(
    resolve(
      rootDir,
      "src/projects/neural-network-name/production/scene-assignments/analogy-limit.generated.json",
    ),
    "utf8",
  ),
);
const task = assignment.taskInput;
const durationInFrames = task.timingBeat.endFrame - task.timingBeat.startFrame;

const visual = buildSceneVisualPlan({
  taskInputFingerprint: task.taskInputFingerprint,
  meaningId: task.meaningId,
  semanticObjective:
    "用并排结构类比收束名称由来，并明确人工网络只借鉴了连接方式，不是真实大脑。",
  subject: "珊瑚橙生物神经元与鼠尾草绿人工分层节点网络",
  primaryAction:
    "两侧连线依次生长，中间相似记号出现后被一笔划成非等同边界。",
  causalLink:
    "相似连接结构解释命名灵感，随后的划线修正防止把人工网络误认为电脑中的大脑。",
  primaryComposition:
    "安全区中央左右并列单个生物神经元和三层人工节点，中轴保留相似与修正手势的清晰留白。",
  styleRealization: [
    "使用深炭色不规则圆角线、珊瑚橙、鼠尾草绿与靛蓝有限色板。",
    "仅绘制透明底上的 Beat 语义图形，不拥有纸张背景、纹理、字幕或全帧装饰。",
    "用逐笔描线、节点半径展开和静稳收束体现手绘科普节奏。",
  ],
  continuity:
    "回收橙色生物结构、绿色人工节点和靛蓝连接语义，以中轴留白完成全片结论。",
  orderedShotIds: ["analogy-correction"],
  visualResourceIds: [],
  recipeDecision: "empty",
  fallbackIntent: "完全使用 Scene 内自绘 SVG 语义图，不依赖外部资源。",
});

const shots = buildShotPlanSet({
  taskInputFingerprint: task.taskInputFingerprint,
  meaningId: task.meaningId,
  sceneDurationInFrames: durationInFrames,
  shots: [
    {
      shotId: "analogy-correction",
      order: 0,
      primaryRange: {startFrame: 0, endFrame: durationInFrames},
      purpose: "在一个稳定构图中完成灵感类比与非等同澄清。",
      action:
        "生物与人工连线同步绘出，相似记号短暂停留，随后手绘斜线将其修正并稳定收束。",
      visualResourceIds: [],
      syncAnchorIds: ["similarity-visible", "boundary-corrected"],
    },
  ],
});

const anchors = buildSceneSyncAnchors({
  taskInputFingerprint: task.taskInputFingerprint,
  meaningId: task.meaningId,
  sceneDurationInFrames: durationInFrames,
  anchors: [
    {
      eventId: "similarity-visible",
      sceneLocalFrame: 90,
      purpose: "旁白进入结构灵感时，两侧连接和相似记号已清晰可见。",
    },
    {
      eventId: "boundary-corrected",
      sceneLocalFrame: 154,
      purpose: "旁白强调不是电脑中的大脑时，非等同划线完成。",
    },
  ],
});

const sound = buildSceneSoundPlan({
  taskInputFingerprint: task.taskInputFingerprint,
  meaningId: task.meaningId,
  sceneDurationInFrames: durationInFrames,
  ambience: null,
  cues: [],
});
const selection = buildShotRecipeSelection({
  taskInputFingerprint: task.taskInputFingerprint,
  selections: [],
});
const fidelity = buildNotApplicableFidelityReceipt({
  selectionFingerprint: selection.selectionFingerprint,
  reason: "empty",
});

const artifacts: readonly [string, unknown][] = [
  ["task-input.generated.json", task],
  ["visual-plan.json", visual],
  ["shot-plan.json", shots],
  ["sync-anchors.json", anchors],
  ["sound-plan.json", sound],
  ["selected-resources.json", {schemaVersion: 1, selectedResources: []}],
  ["shot-recipe-selection.json", selection],
  ["generated/reference-fidelity.generated.json", fidelity],
];

for (const [relativePath, value] of artifacts) {
  const destination = resolve(sceneRoot, relativePath);
  await mkdir(dirname(destination), {recursive: true});
  await writeFile(destination, `${serializeCanonicalJson(value)}\n`, "utf8");
}
};

void run();
