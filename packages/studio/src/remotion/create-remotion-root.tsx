import type { ReactNode } from "react";
import { Composition, Folder } from "remotion";

import { DEFAULT_SCENE_TEMPLATE_AUDIO_PROJECTION } from "./capabilities/scene-templates/registry";
import { SceneTemplateAudioProjectionSchema } from "./capabilities/scene-templates/template-audio";
import { CapabilityGallery } from "./compositions/capability-gallery/CapabilityGallery";
import {
  BrandRevealTemplatePreview,
  SceneTemplateAudioPreloader,
  SourceFollowTemplatePreview,
} from "./compositions/scene-template-previews/SceneTemplatePreviews";
import { FilmCompositions, type FilmRegistryEntry } from "./film/compositions";

export type RemotionRootOptions = Readonly<{
  sceneTemplateAudioProjection?: unknown;
  /** Entries of the Workspace-generated `src/films/index.ts`. */
  films?: readonly FilmRegistryEntry[];
}>;

/**
 * Builds a Remotion root from the Workspace-generated static film registry.
 * The npm package owns the system compositions; the Workspace owns its films.
 */
export const createRemotionRoot = (
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
      <FilmCompositions
        films={options.films ?? []}
        audioProjection={sceneTemplateAudioProjection}
      />
    </>
  );
};
