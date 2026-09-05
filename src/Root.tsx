import "./index.css";
import { createRemotionRoot } from "@axmorf/studio/remotion";

import { projectRegistry } from "./projects/project-registry.generated";
import sceneTemplateAudioProjection from "./remotion/catalog/scene-template-audio.generated.json";

export const RemotionRoot: React.FC = () =>
  createRemotionRoot(projectRegistry, { sceneTemplateAudioProjection });
