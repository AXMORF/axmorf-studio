export const SCENE_TEMPLATE_OPTIONS = [
  {
    id: "axmorf-brand-reveal-v1",
    name: "AXMORF 品牌展示",
    description: "标志与字标的简洁揭示动画。",
  },
  {
    id: "axmorf-source-follow-v1",
    name: "AXMORF 资料与关注",
    description: "资料来源卡片与品牌关注收束动画。",
  },
] as const;

export type SceneTemplateId = (typeof SCENE_TEMPLATE_OPTIONS)[number]["id"];
