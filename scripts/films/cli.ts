import { FilmAssetSchema } from "@axmorf/studio/contracts";

import { importFilmAsset } from "./asset";
import { checkFilm } from "./check";
import { deliverFilm } from "./deliver";
import { deleteFilm, listFilms } from "./manage";
import { runFilmMusic } from "./music";
import { createFilm, type FilmBookendChoice } from "./new";
import { generateFilmRegistry } from "./registry";
import { runFilmReview } from "./review";
import { runFilmVoice } from "./voice";

export type FilmCliContext = Readonly<{
  rootDir: string;
  env: NodeJS.ProcessEnv;
  stdout: (line: string) => void;
  setExitCode?: (code: number) => void;
}>;

const USAGE = `Usage:
  film new --film <id> --title <title> [--width <px>] [--height <px>] [--fps <n>] [--bookends workspace|both|none]
  film voice --film <id>
  film music --film <id>
  film asset --film <id> --file <absolute-path> --name <file-name> --origin generated|original|licensed --creator <who> --license <license> [--source-url <url>] [--attribution <text>]
  film review --film <id> [--frames <f1,f2,...>] [--scale <0.1-1>]
  film check --film <id>
  film deliver --film <id>
  film list
  film delete --film <id> --confirm-delete`;

const FLAGS = new Set(["confirm-delete"]);

/** Parses `--name value` pairs and bare flags; rejects anything unexpected. */
export const parseFilmOptions = (
  args: readonly string[],
  allowed: readonly string[],
) => {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index++) {
    const token = args[index]!;
    const name = token.startsWith("--") ? token.slice(2) : null;
    if (name === null || !allowed.includes(name) || values.has(name)) {
      throw new Error(`Unexpected argument ${token}.\n${USAGE}`);
    }
    if (FLAGS.has(name)) {
      values.set(name, "true");
      continue;
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`--${name} needs a value.\n${USAGE}`);
    }
    values.set(name, value);
    index++;
  }
  return {
    optional: (name: string) => values.get(name),
    required: (name: string) => {
      const value = values.get(name);
      if (value === undefined)
        throw new Error(`--${name} is required.\n${USAGE}`);
      return value;
    },
    integer: (name: string) => {
      const value = values.get(name);
      if (value === undefined) return undefined;
      if (!/^\d+$/u.test(value))
        throw new Error(`--${name} must be a whole number.`);
      return Number(value);
    },
    has: (name: string) => values.has(name),
  };
};

export const runFilmCli = async (
  args: readonly string[],
  context: FilmCliContext,
) => {
  const [command, ...rest] = args;
  const { rootDir } = context;
  const print = (value: unknown) =>
    context.stdout(JSON.stringify(value, null, 2));
  switch (command) {
    case "new": {
      const options = parseFilmOptions(rest, [
        "film",
        "title",
        "width",
        "height",
        "fps",
        "bookends",
      ]);
      const bookends = options.optional("bookends") ?? "workspace";
      if (!["workspace", "both", "none"].includes(bookends)) {
        throw new Error("--bookends must be workspace, both or none.");
      }
      const render = {
        width: options.integer("width"),
        height: options.integer("height"),
        fps: options.integer("fps"),
      };
      print(
        await createFilm({
          rootDir,
          filmId: options.required("film"),
          title: options.required("title"),
          render: Object.fromEntries(
            Object.entries(render).filter(([, value]) => value !== undefined),
          ),
          bookends: bookends as FilmBookendChoice,
          env: context.env,
        }),
      );
      return;
    }
    case "voice": {
      const options = parseFilmOptions(rest, ["film"]);
      print(
        await runFilmVoice({
          rootDir,
          filmId: options.required("film"),
          env: context.env,
        }),
      );
      return;
    }
    case "music": {
      const options = parseFilmOptions(rest, ["film"]);
      print(await runFilmMusic({ rootDir, filmId: options.required("film") }));
      return;
    }
    case "asset": {
      const options = parseFilmOptions(rest, [
        "film",
        "file",
        "name",
        "origin",
        "creator",
        "license",
        "source-url",
        "attribution",
      ]);
      const origin = FilmAssetSchema.shape.origin.parse(
        options.required("origin"),
      );
      const sourceUrl = options.optional("source-url");
      const attribution = options.optional("attribution");
      print(
        await importFilmAsset({
          rootDir,
          filmId: options.required("film"),
          file: options.required("file"),
          name: options.required("name"),
          origin,
          creator: options.required("creator"),
          license: options.required("license"),
          ...(sourceUrl === undefined ? {} : { sourceUrl }),
          ...(attribution === undefined ? {} : { attribution }),
        }),
      );
      return;
    }
    case "review": {
      const options = parseFilmOptions(rest, ["film", "frames", "scale"]);
      const frames = options
        .optional("frames")
        ?.split(",")
        .map((value) => {
          if (!/^\d+$/u.test(value.trim()))
            throw new Error(`Frame ${value} is not a whole number.`);
          return Number(value.trim());
        });
      const scale = options.optional("scale");
      const parsedScale = scale === undefined ? undefined : Number(scale);
      if (
        parsedScale !== undefined &&
        !(parsedScale >= 0.1 && parsedScale <= 1)
      ) {
        throw new Error("--scale must be between 0.1 and 1.");
      }
      print(
        await runFilmReview({
          rootDir,
          filmId: options.required("film"),
          ...(frames === undefined ? {} : { frames }),
          ...(parsedScale === undefined ? {} : { scale: parsedScale }),
        }),
      );
      return;
    }
    case "check": {
      const options = parseFilmOptions(rest, ["film"]);
      const report = await checkFilm({
        rootDir,
        filmId: options.required("film"),
      });
      print(report);
      if (report.status !== "film-check-passed") context.setExitCode?.(1);
      return;
    }
    case "deliver": {
      const options = parseFilmOptions(rest, ["film"]);
      print(await deliverFilm({ rootDir, filmId: options.required("film") }));
      return;
    }
    case "list":
      parseFilmOptions(rest, []);
      print(await listFilms(rootDir));
      return;
    case "delete": {
      const options = parseFilmOptions(rest, ["film", "confirm-delete"]);
      print(
        await deleteFilm({
          rootDir,
          filmId: options.required("film"),
          confirm: options.has("confirm-delete"),
        }),
      );
      return;
    }
    case "registry":
      parseFilmOptions(rest, []);
      print({
        status: "film-registry-generated",
        ...(await generateFilmRegistry(rootDir)),
      });
      return;
    default:
      throw new Error(USAGE);
  }
};
