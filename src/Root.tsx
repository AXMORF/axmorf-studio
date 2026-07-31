import "./index.css";
import { Composition, Folder } from "remotion";

import { CapabilityGallery } from "./remotion/compositions/capability-gallery/CapabilityGallery";

export const RemotionRoot: React.FC = () => {
  return (
    <Folder name="System">
      <Composition
        id="CapabilityGallery"
        component={CapabilityGallery}
        durationInFrames={150}
        fps={30}
        width={1920}
        height={1080}
      />
    </Folder>
  );
};
