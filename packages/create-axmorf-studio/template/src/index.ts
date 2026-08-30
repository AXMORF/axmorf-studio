import "./index.css";

import { createRemotionRoot } from "@axmorf/studio/remotion";
import type { FC } from "react";
import { registerRoot } from "remotion";

import { projectRegistry } from "./projects/project-registry.generated";

const RemotionRoot: FC = () => createRemotionRoot(projectRegistry);

registerRoot(RemotionRoot);
