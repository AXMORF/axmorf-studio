import type {FC} from "react";
import {Composition} from "remotion";

import WorkflowInputAuthoringComposition from "./Composition";

const Root: FC = () => (
  <Composition
    id="ProductComicVertical-workflow-input-Authoring"
    component={WorkflowInputAuthoringComposition}
    durationInFrames={557}
    fps={30}
    width={1080}
    height={1920}
  />
);

export default Root;
