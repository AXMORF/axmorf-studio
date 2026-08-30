import "./index.css";
import { createRemotionRoot } from "@axmorf/studio/remotion";

import { projectRegistry } from "./projects/project-registry.generated";

export const RemotionRoot: React.FC = () => createRemotionRoot(projectRegistry);
