import { readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import {
  computeFilmMusicInputFingerprint,
  FilmAssetsSchema,
  FilmMusicSchema,
  minimumReadableFontSize,
  type FilmSpec,
} from "@axmorf/studio/contracts";
import ts from "typescript";

import {
  exists,
  filmPaths,
  loadFilmSpec,
  readOptionalJsonFile,
  sha256,
  workspacePath,
} from "./files";
import { loadCurrentFilmTiming } from "./music";

export type FilmCheckIssue = Readonly<{
  rule: string;
  message: string;
  file?: string;
  line?: number;
}>;

export type FilmCheckReport = Readonly<{
  status: "film-check-passed" | "film-check-failed";
  filmId: string;
  errors: readonly FilmCheckIssue[];
  warnings: readonly FilmCheckIssue[];
}>;

const NETWORK_GLOBALS = new Set([
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "EventSource",
]);
const NON_DETERMINISTIC = new Map([
  [
    "Math.random",
    "use random(seed) from remotion so every render frame matches",
  ],
  ["Date.now", "derive time from useCurrentFrame()"],
  ["performance.now", "derive time from useCurrentFrame()"],
]);
const CSS_MOTION_PROPERTIES = new Set([
  "animation",
  "animationName",
  "animationDuration",
  "transition",
  "transitionProperty",
  "transitionDuration",
]);
const REMOTE_PATTERN = /^(?:https?:)?\/\//iu;
const REMOTE_CSS_PATTERN = /url\(\s*["']?(?:https?:)?\/\/|@import\s/iu;
const SHARED_ASSET_PREFIX = "assets/axmorf-shared/";

const readCompilerOptions = (rootDir: string) => {
  const configPath = join(rootDir, "tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    throw new Error(
      ts.flattenDiagnosticMessageText(config.error.messageText, "\n"),
    );
  }
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    rootDir,
    { noEmit: true },
    configPath,
  );
  return { ...parsed.options, noEmit: true };
};

const position = (rootDir: string, node: ts.Node) => {
  const source = node.getSourceFile();
  return {
    file: workspacePath(rootDir, source.fileName),
    line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
  };
};

const calleeName = (expression: ts.Expression): string | null => {
  if (ts.isIdentifier(expression)) return expression.text;
  if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression)
  ) {
    const owner = expression.expression.text;
    const name = expression.name.text;
    // window.fetch and globalThis.fetch are the same network call.
    return owner === "window" || owner === "globalThis"
      ? name
      : `${owner}.${name}`;
  }
  return null;
};

const stringValue = (node: ts.Node | undefined): string | null =>
  node !== undefined &&
  (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : null;

const inside = (parent: string, path: string) => {
  const offset = relative(parent, path);
  return offset === "" || (!offset.startsWith("..") && !offset.startsWith(sep));
};

/** Loads the generated timing/music and reports what is stale or missing. */
const checkGeneratedFiles = async (
  rootDir: string,
  spec: FilmSpec,
  errors: FilmCheckIssue[],
) => {
  const paths = filmPaths(rootDir, spec.filmId);
  let durationInFrames: number | null = null;
  try {
    const timing = await loadCurrentFilmTiming(rootDir, spec);
    durationInFrames = timing.durationInFrames;
    if (timing.narration !== null) {
      const bytes = await readFile(
        join(rootDir, timing.narration.publicPath),
      ).catch(() => null);
      if (bytes === null || sha256(bytes) !== timing.narration.checksum) {
        errors.push({
          rule: "generated-audio",
          message: "narration.wav is missing or changed; run film:voice.",
        });
      }
    }
  } catch (error) {
    errors.push({ rule: "timing-stale", message: (error as Error).message });
  }
  if (spec.music === null || durationInFrames === null) return;
  const music = await readOptionalJsonFile(
    paths.music,
    FilmMusicSchema,
    "generated/music.json",
  );
  if (
    music === null ||
    music.inputFingerprint !==
      computeFilmMusicInputFingerprint({ spec, durationInFrames })
  ) {
    errors.push({
      rule: "music-stale",
      message:
        "The score is missing or older than film.json and the timing; run film:music.",
    });
    return;
  }
  const bytes = await readFile(join(rootDir, music.publicPath)).catch(
    () => null,
  );
  if (bytes === null || sha256(bytes) !== music.checksum) {
    errors.push({
      rule: "generated-audio",
      message: "music.wav is missing or changed; run film:music.",
    });
  }
};

export const checkFilm = async ({
  rootDir,
  filmId,
}: {
  readonly rootDir: string;
  readonly filmId: string;
}): Promise<FilmCheckReport> => {
  const errors: FilmCheckIssue[] = [];
  const warnings: FilmCheckIssue[] = [];
  const paths = filmPaths(rootDir, filmId);
  let spec: FilmSpec;
  try {
    spec = await loadFilmSpec(rootDir, filmId);
  } catch (error) {
    return {
      status: "film-check-failed",
      filmId: paths.id,
      errors: [{ rule: "film-json", message: (error as Error).message }],
      warnings,
    };
  }
  await checkGeneratedFiles(rootDir, spec, errors);

  const assets = await readOptionalJsonFile(
    paths.assets,
    FilmAssetsSchema,
    "assets.json",
  ).catch((error: Error) => {
    errors.push({ rule: "assets-json", message: error.message });
    return null;
  });
  const registeredAssets = new Map(
    (assets?.assets ?? []).map((asset) => [asset.publicPath, asset]),
  );
  const generatedMedia = new Set([
    workspacePath(rootDir, paths.narrationWav),
    workspacePath(rootDir, paths.musicWav),
  ]);

  const roots = [paths.film, paths.cover];
  for (const root of roots) {
    if (!(await exists(root))) {
      errors.push({
        rule: "film-source",
        message: `${workspacePath(rootDir, root)} is missing.`,
      });
    }
  }
  if (errors.some(({ rule }) => rule === "film-source")) {
    return { status: "film-check-failed", filmId: paths.id, errors, warnings };
  }

  const program = ts.createProgram({
    rootNames: roots,
    options: readCompilerOptions(rootDir),
  });
  for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
    if (diagnostic.category !== ts.DiagnosticCategory.Error) continue;
    const at =
      diagnostic.file === undefined || diagnostic.start === undefined
        ? {}
        : {
            file: workspacePath(rootDir, diagnostic.file.fileName),
            line:
              diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
                .line + 1,
          };
    errors.push({
      rule: "typescript",
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      ...at,
    });
  }

  const minimumFontSize = minimumReadableFontSize(
    spec.render.width,
    spec.render.height,
  );
  const mounted = new Set<string>();
  const pendingStaticFiles: { node: ts.Node; path: string }[] = [];
  const filmFiles = program
    .getSourceFiles()
    .filter(
      ({ fileName }) =>
        !fileName.endsWith(".json") && inside(paths.dir, resolve(fileName)),
    );

  for (const source of filmFiles) {
    const visit = (node: ts.Node) => {
      const at = () => position(rootDir, node);
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier !== undefined
      ) {
        const specifier = stringValue(node.moduleSpecifier) ?? "";
        if (REMOTE_PATTERN.test(specifier)) {
          errors.push({
            rule: "network",
            message: `Remote import ${specifier}.`,
            ...at(),
          });
        } else if (
          specifier.startsWith(".") &&
          !inside(paths.dir, resolve(dirname(source.fileName), specifier))
        ) {
          errors.push({
            rule: "film-boundary",
            message: `${specifier} reaches outside src/films/${paths.id}; keep each film self-contained or import from a package.`,
            ...at(),
          });
        }
      }
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const name = calleeName(node.expression);
        if (name !== null && NETWORK_GLOBALS.has(name)) {
          errors.push({
            rule: "network",
            message: `${name} would fetch at render time; import the file with film:asset instead.`,
            ...at(),
          });
        }
        const hint = name === null ? undefined : NON_DETERMINISTIC.get(name);
        if (hint !== undefined) {
          errors.push({
            rule: "deterministic",
            message: `${name}(): ${hint}.`,
            ...at(),
          });
        }
        if (
          ts.isNewExpression(node) &&
          name === "Date" &&
          (node.arguments?.length ?? 0) === 0
        ) {
          errors.push({
            rule: "deterministic",
            message:
              "new Date() changes between renders; derive time from useCurrentFrame().",
            ...at(),
          });
        }
        if (
          ts.isCallExpression(node) &&
          node.expression.kind === ts.SyntaxKind.ImportKeyword &&
          REMOTE_PATTERN.test(stringValue(node.arguments[0]) ?? "")
        ) {
          errors.push({
            rule: "network",
            message: "Remote dynamic import.",
            ...at(),
          });
        }
        if (ts.isCallExpression(node) && name === "staticFile") {
          const path = stringValue(node.arguments[0]);
          if (path === null) {
            warnings.push({
              rule: "static-file",
              message:
                "staticFile() with a computed path cannot be verified; prefer literal paths.",
              ...at(),
            });
          } else {
            pendingStaticFiles.push({ node, path: path.replace(/^\//u, "") });
          }
        }
      }
      if (ts.isJsxAttribute(node)) {
        const attribute = node.name.getText();
        const value =
          node.initializer === undefined
            ? null
            : ts.isStringLiteral(node.initializer)
              ? node.initializer.text
              : ts.isJsxExpression(node.initializer)
                ? stringValue(node.initializer.expression)
                : null;
        if (
          value !== null &&
          ["src", "href", "xlinkHref", "poster"].includes(attribute) &&
          REMOTE_PATTERN.test(value)
        ) {
          errors.push({
            rule: "network",
            message: `${attribute}="${value}" loads a remote file; import it with film:asset.`,
            ...at(),
          });
        }
        if (
          value !== null &&
          attribute === "className" &&
          /(?:^|\s)(?:animate-|transition(?:-|\s|$))/u.test(value)
        ) {
          errors.push({
            rule: "css-motion",
            message:
              "Tailwind animate-/transition classes do not render frame by frame; drive motion from useCurrentFrame().",
            ...at(),
          });
        }
      }
      if (
        ts.isPropertyAssignment(node) &&
        (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))
      ) {
        const property = node.name.text;
        if (CSS_MOTION_PROPERTIES.has(property)) {
          errors.push({
            rule: "css-motion",
            message: `CSS ${property} does not render frame by frame; drive motion from useCurrentFrame().`,
            ...at(),
          });
        }
        if (property === "fontSize" && ts.isNumericLiteral(node.initializer)) {
          const size = Number(node.initializer.text);
          if (size > 0 && size < minimumFontSize) {
            warnings.push({
              rule: "small-text",
              message: `fontSize ${size} is under ${minimumFontSize}px for a ${spec.render.width}×${spec.render.height} frame; make sure it is decorative or readable on a phone.`,
              ...at(),
            });
          }
        }
      }
      const text = stringValue(node);
      if (
        text !== null &&
        (/@keyframes\s/iu.test(text) || REMOTE_CSS_PATTERN.test(text))
      ) {
        errors.push({
          rule: /@keyframes/iu.test(text) ? "css-motion" : "network",
          message: /@keyframes/iu.test(text)
            ? "CSS keyframes do not render frame by frame; drive motion from useCurrentFrame()."
            : "CSS loads a remote file; import it with film:asset.",
          ...at(),
        });
      }
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        mounted.add(node.tagName.getText());
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  for (const { node, path } of pendingStaticFiles) {
    const publicPath = `public/${path}`;
    const at = position(rootDir, node);
    if (path.startsWith(SHARED_ASSET_PREFIX)) {
      if (!(await exists(join(rootDir, publicPath)))) {
        errors.push({
          rule: "media",
          message: `${publicPath} does not exist.`,
          ...at,
        });
      }
      continue;
    }
    if (!path.startsWith(`films/${paths.id}/`)) {
      errors.push({
        rule: "media",
        message: `${publicPath} is outside this film; import it with film:asset.`,
        ...at,
      });
      continue;
    }
    if (generatedMedia.has(publicPath)) continue;
    const asset = registeredAssets.get(publicPath);
    if (asset === undefined) {
      errors.push({
        rule: "media",
        message: `${publicPath} is not registered; import it with film:asset.`,
        ...at,
      });
      continue;
    }
    const bytes = await readFile(join(rootDir, publicPath)).catch(() => null);
    if (bytes === null || sha256(bytes) !== asset.checksum) {
      errors.push({
        rule: "media",
        message: `${publicPath} is missing or changed since film:asset; import it again.`,
        ...at,
      });
    }
  }

  if (spec.narration.length > 0) {
    for (const component of ["FilmSoundtrack", "FilmCaptions"]) {
      if (!mounted.has(component)) {
        errors.push({
          rule: "film-components",
          message: `The film has narration but never mounts <${component} />.`,
        });
      }
    }
  } else if (spec.music !== null && !mounted.has("FilmSoundtrack")) {
    errors.push({
      rule: "film-components",
      message: "The film has a score but never mounts <FilmSoundtrack />.",
    });
  }

  return {
    status: errors.length === 0 ? "film-check-passed" : "film-check-failed",
    filmId: paths.id,
    errors,
    warnings,
  };
};
