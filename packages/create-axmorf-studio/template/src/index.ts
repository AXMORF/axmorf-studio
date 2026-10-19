import "./index.css";

import { createRemotionRoot } from "@axmorf/studio/remotion";
import type { FC } from "react";
import { registerRoot } from "remotion";

import { filmRegistry } from "./films/index";
import sceneTemplateAudioProjection from "./remotion/catalog/scene-template-audio.generated.json";

const RemotionRoot: FC = () =>
  createRemotionRoot({ films: filmRegistry, sceneTemplateAudioProjection });

registerRoot(RemotionRoot);
