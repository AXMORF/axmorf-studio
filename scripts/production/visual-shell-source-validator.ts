import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";

import {
  Sha256DigestSchema,
  StoryIdSchema,
  createFingerprint,
} from "../../src/contracts";

const sourceExtensions = [".ts", ".tsx", ".js", ".jsx"] as const;

const forbiddenSourcePatterns: readonly [RegExp, string][] = [
  [/\b(?:CaptionLayer|GlobalVisualLayers|SceneSafeArea|SceneContentFrame|SceneBackground)\b/u, "forbidden visual owner"],
  [/\b(?:StoryBeat|SceneVisualPlan|ScenePackage|meaningId|shotId|ShotPlan|Shot)\b/u, "Scene or Shot semantics"],
  [/<(?:Audio|Html5Audio)\b|\b(?:Audio|Html5Audio|useAudioData|narration|soundDesign)\b/u, "audio"],
  [/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/u, "network access"],
  [/(?:from\s*|require\s*\(\s*)["'](?:node:)?(?:fs|child_process|net|http|https|dns|git)["']/u, "filesystem network or process access"],
  [/\bimport\s*\(/u, "dynamic import"],
  [/\brequire\s*\(/u, "dynamic module loading"],
  [/\b(?:animation|transition)(?:Name|Duration|Delay|TimingFunction)?\s*:/u, "CSS animation or transition"],
  [/\b(?:readabilityPolicy|safeArea|inset)\b/u, "safe-area geometry"],
  [/>\s*[A-Za-z0-9][^<{]*</u, "visible text"],
];

const staticImportPattern = /\b(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/gu;

const checksum = (bytes: string) =>
  Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
  );

const assertRegularSource = async (path: string) => {
  let entry;
  try {
    entry = await lstat(path);
  } catch (error) {
    throw new Error("VisualShell source is missing or unreadable.", {
      cause: error,
    });
  }
  if (entry.isSymbolicLink() || !entry.isFile()) {
    throw new Error("VisualShell source must be a regular file, not a symbolic link.");
  }
};

const resolveLocalImport = async ({
  importer,
  specifier,
  shellRoot,
}: {
  readonly importer: string;
  readonly specifier: string;
  readonly shellRoot: string;
}) => {
  const base = resolve(dirname(importer), specifier);
  const relativePath = relative(shellRoot, base);
  if (relativePath === ".." || relativePath.startsWith("../") || relativePath.includes("/../")) {
    throw new Error("VisualShell relative imports must stay inside visual-shell/.");
  }
  const candidates = extname(base)
    ? [base]
    : sourceExtensions.flatMap((extension) => [
        `${base}${extension}`,
        join(base, `index${extension}`),
      ]);
  for (const candidate of candidates) {
    try {
      await assertRegularSource(candidate);
      return candidate;
    } catch (error) {
      if ((error as Error).message.includes("symbolic link")) throw error;
    }
  }
  throw new Error("VisualShell local import is missing or not a regular source file.");
};

export const validateVisualShellSourceGraph = async ({
  rootDir,
  storyId: rawStoryId,
}: {
  readonly rootDir: string;
  readonly storyId: string;
}) => {
  const storyId = StoryIdSchema.parse(rawStoryId);
  const shellRoot = join(rootDir, "src/projects", storyId, "visual-shell");
  const entryPath = join(shellRoot, "VisualShell.tsx");
  const pending = [entryPath];
  const sources = new Map<string, string>();
  while (pending.length > 0) {
    const sourcePath = pending.shift();
    if (sourcePath === undefined || sources.has(sourcePath)) continue;
    await assertRegularSource(sourcePath);
    const source = await readFile(sourcePath, "utf8");
    for (const [pattern, label] of forbiddenSourcePatterns) {
      if (pattern.test(source)) {
        throw new Error(`VisualShell source contains ${label}.`);
      }
    }
    for (const match of source.matchAll(staticImportPattern)) {
      const specifier = match[1];
      if (specifier?.startsWith(".")) {
        const resolvedSpecifier = resolve(dirname(sourcePath), specifier);
        const sharedCapabilitiesRoot = join(
          rootDir,
          "src/remotion/capabilities",
        );
        const sharedRelative = relative(
          sharedCapabilitiesRoot,
          resolvedSpecifier,
        );
        if (
          sharedRelative !== ".." &&
          !sharedRelative.startsWith("../") &&
          !sharedRelative.includes("/../")
        ) {
          continue;
        }
        pending.push(
          await resolveLocalImport({ importer: sourcePath, specifier, shellRoot }),
        );
      } else if (
        specifier !== "react" &&
        specifier !== "remotion"
      ) {
        throw new Error("VisualShell imports an unapproved package or module path.");
      }
    }
    sources.set(sourcePath, source);
  }
  const files = [...sources.entries()]
    .map(([path, source]) => ({
      sourcePath: relative(rootDir, path),
      checksum: checksum(source),
    }))
    .sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
  return {
    visualShellSourceGraphFingerprint: createFingerprint({
      namespace: "production-visual-shell-source-graph",
      version: 1,
      value: { storyId, files },
    }),
    sourcePaths: files.map(({ sourcePath }) => sourcePath),
  } as const;
};
