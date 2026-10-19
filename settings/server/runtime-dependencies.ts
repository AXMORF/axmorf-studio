import type { RuntimeResources } from "@axmorf/studio";

import { deleteFilm, listFilms } from "../../scripts/films/manage";
import type { StartWebControlCenterInput } from "../../packages/studio/src/web/server";
import { createSettingsApi } from "./api";
import { runProducerEnvironmentDiagnostics } from "./diagnostics";

export const createSettingsWebDependencies = ({
  rootDir,
  env,
  runtimeResources,
}: {
  readonly rootDir: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly runtimeResources: RuntimeResources;
}): Pick<StartWebControlCenterInput, "api"> => ({
  api: createSettingsApi({
    rootDir,
    env,
    diagnose: () =>
      runProducerEnvironmentDiagnostics({ rootDir, env, runtimeResources }),
    listFilms: () => listFilms(rootDir),
    deleteFilm: ({ filmId }) => deleteFilm({ rootDir, filmId, confirm: true }),
  }),
});
