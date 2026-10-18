import { generateFilmRegistry } from "../films/registry";
import { generateSceneTemplateAudioProjection } from "../scene-templates/audio-projection";

export const bootstrapRepository = async (rootDir: string) => {
  await generateSceneTemplateAudioProjection({ rootDir, mode: "write" });
  const films = await generateFilmRegistry(rootDir);
  return { filmCount: films.filmCount } as const;
};
