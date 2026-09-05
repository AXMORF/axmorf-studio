import "./index.css";

import { createRemotionRoot } from "@axmorf/studio/remotion";
import type { FC } from "react";
import { registerRoot } from "remotion";

import { projectRegistry } from "./projects/project-registry.generated";
import sceneTemplateAudioProjection from "./remotion/catalog/scene-template-audio.generated.json";

const RemotionRoot: FC = () =>
  createRemotionRoot(projectRegistry, { sceneTemplateAudioProjection });

registerRoot(RemotionRoot);
