import type { FC } from "react";
import { Composition, registerRoot } from "remotion";

const BrowserProbe: FC = () => null;

const BrowserPreflightRoot: FC = () => (
  <Composition
    component={BrowserProbe}
    durationInFrames={1}
    fps={30}
    height={16}
    id="RemotionBrowserPreflight"
    width={16}
  />
);

registerRoot(BrowserPreflightRoot);
