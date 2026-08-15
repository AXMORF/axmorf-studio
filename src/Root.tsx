import "./index.css";
import { Composition, Folder } from "remotion";

import { projectRegistry } from "./projects/project-registry.generated";
import type { ProjectRegistryEntry } from "./projects/project-registry.generated";
import {
  BrandRevealTemplatePreview,
  SourceFollowTemplatePreview,
} from "./remotion/compositions/scene-template-previews/SceneTemplatePreviews";
import { CapabilityGallery } from "./remotion/compositions/capability-gallery/CapabilityGallery";

export const createRemotionRoot = (
  entries: readonly ProjectRegistryEntry[],
) => {
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
        <Composition
          id="DefaultIntroPreview"
          component={BrandRevealTemplatePreview}
          durationInFrames={60}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="DefaultOutroPreview"
          component={SourceFollowTemplatePreview}
          durationInFrames={240}
          fps={30}
          width={1080}
          height={1920}
        />
      </Folder>
      <Folder name="Stories">
        {entries.map((entry) => (
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

export const RemotionRoot: React.FC = () => createRemotionRoot(projectRegistry);
