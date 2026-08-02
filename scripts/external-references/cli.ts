import { pathToFileURL } from "node:url";

import { GitCommitSchema, StoryIdSchema } from "../../src/contracts";

type BaseInput = {
  readonly source: "video-shotcraft";
  readonly revision: string;
  readonly cardId: "draw-svg-trace";
  readonly styleKey: "draw-svg-trace";
};

type LocalizeInput = BaseInput & {
  readonly projectId: string;
  readonly meaningId: string;
};

export type ExternalReferenceCliContext = {
  readonly rootDir: string;
  readonly stdout: (line: string) => void;
  readonly sync?: (input: BaseInput) => Promise<unknown>;
  readonly localize?: (input: LocalizeInput) => Promise<unknown>;
};

const defaultContext = (): ExternalReferenceCliContext => ({
  rootDir: process.cwd(),
  stdout: (line) => process.stdout.write(`${line}\n`),
});

const baseFlags = [
  "--source",
  "video-shotcraft",
  "--revision",
  "",
  "--card",
  "draw-svg-trace",
  "--style",
  "draw-svg-trace",
] as const;

const parseBase = (args: readonly string[]): BaseInput => {
  if (
    args.length < 9 ||
    args[1] !== baseFlags[0] ||
    args[2] !== baseFlags[1] ||
    args[3] !== baseFlags[2] ||
    args[5] !== baseFlags[4] ||
    args[6] !== baseFlags[5] ||
    args[7] !== baseFlags[6] ||
    args[8] !== baseFlags[7]
  ) {
    throw new Error(
      "External reference flags are missing, unknown, or reordered.",
    );
  }
  return {
    source: "video-shotcraft",
    revision: GitCommitSchema.parse(args[4]),
    cardId: "draw-svg-trace",
    styleKey: "draw-svg-trace",
  };
};

export const runExternalReferenceCli = async (
  args: readonly string[],
  context: ExternalReferenceCliContext = defaultContext(),
): Promise<unknown> => {
  const base = parseBase(args);
  if (args[0] === "sync" && args.length === 9) {
    if (!context.sync) {
      throw new Error("Authoring sync requires an explicit adapter context.");
    }
    const result = await context.sync(base);
    context.stdout("External reference snapshot synchronized.");
    return result;
  }
  if (
    args[0] === "localize" &&
    args.length === 13 &&
    args[9] === "--project" &&
    args[11] === "--meaning"
  ) {
    if (!context.localize) {
      throw new Error("Localization requires an explicit authoring context.");
    }
    const input = {
      ...base,
      projectId: StoryIdSchema.parse(args[10]),
      meaningId: StoryIdSchema.parse(args[12]),
    };
    const result = await context.localize(input);
    context.stdout("External reference closure localized.");
    return result;
  }
  throw new Error("Expected fixed sync or localize arguments.");
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runExternalReferenceCli(process.argv.slice(2)).catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Reference action failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
