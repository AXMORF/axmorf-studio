import "./index.css";
import { Composition, Folder } from "remotion";

import { projectRegistry } from "./projects/project-registry.generated";
import { CapabilityGallery } from "./remotion/compositions/capability-gallery/CapabilityGallery";

export const RemotionRoot: React.FC = () => {
  return (
    <>
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
      <Folder name="Stories">
        {projectRegistry.map((entry) => (
          <Composition
            key={entry.id}
            id={entry.id}
            lazyComponent={entry.load}
            durationInFrames={entry.durationInFrames}
            fps={entry.fps}
            width={entry.width}
            height={entry.height}
            defaultProps={entry.defaultProps}
          />
        ))}
      </Folder>
    </>
  );
};
