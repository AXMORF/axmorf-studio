import "./index.css";
import { Composition, Folder } from "remotion";

import { projectRegistry } from "./projects/project-registry.generated";
import type { ProjectRegistryEntry } from "./projects/project-registry.generated";
import { CapabilityGallery } from "./remotion/compositions/capability-gallery/CapabilityGallery";
import {
  FixedOutro,
  FIXED_OUTRO_DURATION_IN_FRAMES,
  FixedOutroPropsSchema,
} from "./remotion/runtime/fixed-outro/FixedOutro";
import {
  FixedIntro,
  FIXED_INTRO_DURATION_IN_FRAMES,
} from "./remotion/runtime/fixed-intro/FixedIntro";

const fixedOutroPreviewProps = FixedOutroPropsSchema.parse({
  references: [
    {
      title: "Remotion Documentation",
      url: "https://www.remotion.dev/docs/",
    },
    {
      title: "Remotion Story Producer",
      url: "https://github.com/zzzxc/remotion-story-producer",
    },
    {
      title: "video-shotcraft",
      url: "https://github.com/Vincentwei1021/video-shotcraft",
    },
  ],
});

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
          id="FixedIntroPreview"
          component={FixedIntro}
          durationInFrames={FIXED_INTRO_DURATION_IN_FRAMES}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="FixedIntroPreview16x9"
          component={FixedIntro}
          durationInFrames={FIXED_INTRO_DURATION_IN_FRAMES}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="FixedOutroPreview"
          component={FixedOutro}
          durationInFrames={FIXED_OUTRO_DURATION_IN_FRAMES}
          defaultProps={fixedOutroPreviewProps}
          fps={30}
          schema={FixedOutroPropsSchema}
          width={1080}
          height={1920}
        />
        <Composition
          id="FixedOutroPreview16x9"
          component={FixedOutro}
          durationInFrames={FIXED_OUTRO_DURATION_IN_FRAMES}
          defaultProps={fixedOutroPreviewProps}
          fps={30}
          schema={FixedOutroPropsSchema}
          width={1920}
          height={1080}
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
