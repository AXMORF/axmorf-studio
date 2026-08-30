import type { ComponentType, ReactNode } from "react";
import { Composition, Folder } from "remotion";

import type { StoryCompositionProps } from "../contracts";
import { CapabilityGallery } from "./compositions/capability-gallery/CapabilityGallery";
import {
  BrandRevealTemplatePreview,
  SourceFollowTemplatePreview,
} from "./compositions/scene-template-previews/SceneTemplatePreviews";

export type RemotionProjectRegistryEntry = Readonly<{
  id: string;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  defaultProps: StoryCompositionProps;
  load: () => Promise<{
    default: ComponentType<StoryCompositionProps>;
  }>;
}>;

/**
 * Builds a Remotion root from a Workspace-generated static registry. The npm
 * package owns the common compositions; the Workspace remains the only owner
 * of user Project registrations.
 */
export const createRemotionRoot = (
  entries: readonly RemotionProjectRegistryEntry[],
): ReactNode => (
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
