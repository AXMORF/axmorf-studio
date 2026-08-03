import type {FC} from "react";
import {Composition} from "remotion";

import WorkflowCreateAuthoringComposition from "./Composition";

export const WorkflowCreateAuthoringRoot: FC = () => (
  <Composition
    id="ProductComicVertical-workflow-create-Authoring"
    component={WorkflowCreateAuthoringComposition}
    durationInFrames={730}
    fps={30}
    width={1080}
    height={1920}
  />
);
