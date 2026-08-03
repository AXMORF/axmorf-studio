import type { FC } from "react";
import { Composition } from "remotion";

import WorkflowResultAuthoringComposition from "./Composition";

export const WorkflowResultAuthoringRoot: FC = () => (
  <Composition
    id="ProductComicVertical-workflow-result-Authoring"
    component={WorkflowResultAuthoringComposition}
    durationInFrames={548}
    fps={30}
    width={1080}
    height={1920}
  />
);
