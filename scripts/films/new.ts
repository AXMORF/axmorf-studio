import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { FilmSpecSchema, type FilmSpec } from "@axmorf/studio/contracts";

import {
  readProducerConfig,
  resolveProducerConfigPathFromEnvironment,
} from "../config/producer-config";
import { exists, filmPaths, withWorkspaceLock, writeJsonFile } from "./files";
import { generateFilmRegistry } from "./registry";

export const FILM_SOURCE = `import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import {
  FilmCaptions,
  FilmSoundtrack,
  useFilm,
  useFilmTiming,
} from "@axmorf/studio/remotion";

// Starting point only. Replace the placeholder with this film's own subjects,
// framing, camera and motion. Keep FilmSoundtrack and FilmCaptions mounted.
const Film = () => {
  const frame = useCurrentFrame();
  const { spec } = useFilm();
  const { durationInFrames } = useFilmTiming();
  const opacity = interpolate(
    frame,
    [0, 15, durationInFrames - 15, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <AbsoluteFill style={{ backgroundColor: "#0b1020" }}>
      <AbsoluteFill
        style={{ justifyContent: "center", alignItems: "center", opacity }}
      >
        <div
          style={{
            color: "#f8fafc",
            fontFamily: '"Noto Sans SC", "PingFang SC", sans-serif',
            fontSize: 72,
            fontWeight: 700,
          }}
        >
          {spec.publish.title}
        </div>
      </AbsoluteFill>
      <FilmSoundtrack />
      <FilmCaptions />
    </AbsoluteFill>
  );
};

export default Film;
`;

export const COVER_SOURCE = `import { AbsoluteFill, useVideoConfig } from "remotion";
import { useFilm } from "@axmorf/studio/remotion";

// Rendered at 1600×1200 and 1200×1600. Design both orientations from the
// film's key image; keep the title large and inside a generous margin.
const Cover = () => {
  const { width, height } = useVideoConfig();
  const { spec } = useFilm();
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0b1020",
        justifyContent: "center",
        alignItems: "center",
        padding: Math.round(Math.min(width, height) * 0.08),
      }}
    >
      <div
        style={{
          color: "#f8fafc",
          fontFamily: '"Noto Sans SC", "PingFang SC", sans-serif',
          fontSize: Math.round(Math.min(width, height) * 0.09),
          fontWeight: 800,
          textAlign: "center",
        }}
      >
        {spec.publish.title}
      </div>
    </AbsoluteFill>
  );
};

export default Cover;
`;

/**
 * "workspace" follows the Workspace's saved opening/closing choice; "both" and
 * "none" decide for this film only and never change the Workspace default.
 */
export type FilmBookendChoice = "workspace" | "both" | "none";

export const createFilm = async ({
  rootDir,
  filmId,
  title,
  render,
  bookends = "workspace",
  env = process.env,
}: {
  readonly rootDir: string;
  readonly filmId: string;
  readonly title: string;
  readonly render?: Partial<FilmSpec["render"]>;
  readonly bookends?: FilmBookendChoice;
  readonly env?: NodeJS.ProcessEnv;
}) =>
  withWorkspaceLock(rootDir, "film-new", async () => {
    const paths = filmPaths(rootDir, filmId);
    for (const taken of [
      paths.dir,
      paths.publicDir,
      paths.delivery,
      join(rootDir, "src/projects", paths.id),
    ]) {
      if (await exists(taken)) {
        throw new Error(
          `The id ${paths.id} is already used (${taken}); choose another film id.`,
        );
      }
    }
    const config = await readProducerConfig({
      configPath: await resolveProducerConfigPathFromEnvironment({
        rootDir,
        env,
      }),
    });
    const fps = render?.fps ?? config.renderDefaults.fps;
    // The Workspace's saved opening/closing choice becomes this film's bookends.
    const { introSceneTemplateId, outroSceneTemplateId } = config.sceneDefaults;
    const intro =
      bookends === "both" ||
      (bookends === "workspace" &&
        introSceneTemplateId === "axmorf-brand-reveal-v1")
        ? ("axmorf-brand-reveal-v1" as const)
        : null;
    const outro =
      bookends === "both" ||
      (bookends === "workspace" &&
        outroSceneTemplateId === "axmorf-source-follow-v1")
        ? ("axmorf-source-follow-v1" as const)
        : null;
    const spec = FilmSpecSchema.parse({
      schemaVersion: 1,
      filmId: paths.id,
      render: {
        width: render?.width ?? config.renderDefaults.width,
        height: render?.height ?? config.renderDefaults.height,
        fps,
      },
      timeline: {
        narrationStartFrame: 15,
        tailFrames: 45,
        durationInFrames: fps * 10,
      },
      narration: [],
      music: null,
      publish: { title, description: "", tags: [] },
      bookends: { intro, outro, theme: "dark", sources: [] },
    });
    await mkdir(join(paths.dir, "generated"), { recursive: true });
    await writeJsonFile(paths.spec, spec);
    await writeJsonFile(paths.assets, {
      schemaVersion: 1,
      filmId: paths.id,
      assets: [],
    });
    await writeFile(paths.film, FILM_SOURCE, { flag: "wx" });
    await writeFile(paths.cover, COVER_SOURCE, { flag: "wx" });
    await generateFilmRegistry(rootDir);
    return {
      status: "film-created",
      filmId: paths.id,
      render: spec.render,
      bookends: spec.bookends,
      files: ["film.json", "Film.tsx", "Cover.tsx", "assets.json"].map(
        (name) => `src/films/${paths.id}/${name}`,
      ),
    } as const;
  });
