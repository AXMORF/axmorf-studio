import type { ComponentType, ReactNode } from "react";
import { Composition, Folder } from "remotion";

import type { StoryCompositionProps } from "../contracts";
import { DEFAULT_SCENE_TEMPLATE_AUDIO_PROJECTION } from "./capabilities/scene-templates/registry";
import { SceneTemplateAudioProjectionSchema } from "./capabilities/scene-templates/template-audio";
import { CapabilityGallery } from "./compositions/capability-gallery/CapabilityGallery";
import {
  BrandRevealTemplatePreview,
  SceneTemplateAudioPreloader,
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

export type RemotionRootOptions = Readonly<{
  sceneTemplateAudioProjection?: unknown;
}>;

/**
 * Builds a Remotion root from a Workspace-generated static registry. The npm
 * package owns the common compositions; the Workspace remains the only owner
 * of user Project registrations.
 */
export const createRemotionRoot = (
  entries: readonly RemotionProjectRegistryEntry[],
  options: RemotionRootOptions = {},
): ReactNode => {
  const sceneTemplateAudioProjection = SceneTemplateAudioProjectionSchema.parse(
    options.sceneTemplateAudioProjection ??
      DEFAULT_SCENE_TEMPLATE_AUDIO_PROJECTION,
  );
  const previewDefaultProps = { audioProjection: sceneTemplateAudioProjection };

  return (
    <>
      <SceneTemplateAudioPreloader
        audioProjection={sceneTemplateAudioProjection}
      />
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
          defaultProps={previewDefaultProps}
          durationInFrames={60}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="DefaultOutroPreview"
          component={SourceFollowTemplatePreview}
          defaultProps={previewDefaultProps}
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
