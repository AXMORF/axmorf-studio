import type { ReactNode } from "react";
import { Composition, Folder } from "remotion";

import { DEFAULT_SCENE_TEMPLATE_AUDIO_PROJECTION } from "./capabilities/scene-templates/registry";
import { SceneTemplateAudioProjectionSchema } from "./capabilities/scene-templates/template-audio";
import { BeatResponseGallery } from "./compositions/capability-gallery/BeatResponseGallery";
import { PaperCollageExample } from "./compositions/capability-gallery/PaperCollageExample";
import { GraphicReviewGallery } from "./compositions/capability-gallery/GraphicReviewGallery";
import { EditorialInvoiceExample } from "./compositions/capability-gallery/EditorialInvoiceExample";
import { NightObservationExample } from "./compositions/capability-gallery/NightObservationExample";
import { AxiomStoryGallery } from "./compositions/capability-gallery/AxiomStoryGallery";
import { SceneTrackGallery } from "./compositions/capability-gallery/SceneTrackGallery";
import { MusicSyncGallery } from "./compositions/capability-gallery/MusicSyncGallery";
import {
  RecipeGallery,
  RECIPE_GALLERY_IDS,
  RECIPE_GALLERY_FRAMES,
} from "./compositions/capability-gallery/RecipeGallery";
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
          id="SceneTrackGallery"
          component={SceneTrackGallery}
          durationInFrames={90}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="AxiomStoryGallery"
          component={AxiomStoryGallery}
          durationInFrames={300}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="MusicSyncGallery"
          component={MusicSyncGallery}
          defaultProps={{ music: null, sfx: null }}
          durationInFrames={300}
          fps={30}
          width={1920}
          height={1080}
        />
        <Folder name="BeatResponses">
          <Composition
            id="BeatResponse-Varied"
            component={BeatResponseGallery}
            defaultProps={{ globalOnly: false }}
            durationInFrames={180}
            fps={30}
            width={960}
            height={540}
          />
          <Composition
            id="BeatResponse-GlobalOnly"
            component={BeatResponseGallery}
            defaultProps={{ globalOnly: true }}
            durationInFrames={180}
            fps={30}
            width={960}
            height={540}
          />
        </Folder>
        <Folder name="GraphicReview">
          <Composition
            id="GraphicReview-Compliant"
            component={GraphicReviewGallery}
            defaultProps={{ invalid: false }}
            durationInFrames={30}
            fps={30}
            width={960}
            height={540}
          />
          <Composition
            id="GraphicReview-Counterexample"
            component={GraphicReviewGallery}
            defaultProps={{ invalid: true }}
            durationInFrames={30}
            fps={30}
            width={960}
            height={540}
          />
        </Folder>
        <Folder name="StyleExamples">
          <Composition
            id="PaperCollageExample"
            component={PaperCollageExample}
            durationInFrames={180}
            fps={30}
            width={960}
            height={540}
          />
          <Composition
            id="EditorialInvoiceExample"
            component={EditorialInvoiceExample}
            durationInFrames={120}
            fps={30}
            width={1920}
            height={1080}
          />
          <Composition
            id="NightObservationExample"
            component={NightObservationExample}
            durationInFrames={120}
            fps={30}
            width={1080}
            height={1920}
          />
        </Folder>
        <Folder name="Recipes">
          {RECIPE_GALLERY_IDS.map((recipe) => (
            <Composition
              key={recipe}
              id={`Recipe-${recipe}`}
              component={RecipeGallery}
              defaultProps={{ recipe }}
              durationInFrames={RECIPE_GALLERY_FRAMES}
              fps={30}
              width={1920}
              height={1080}
            />
          ))}
        </Folder>
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
