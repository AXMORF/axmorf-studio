import "./index.css";
import { createRemotionRoot } from "@axmorf/studio/remotion";

import { filmRegistry } from "./films/index";
import sceneTemplateAudioProjection from "./remotion/catalog/scene-template-audio.generated.json";

export const RemotionRoot: React.FC = () =>
  createRemotionRoot({ films: filmRegistry, sceneTemplateAudioProjection });
