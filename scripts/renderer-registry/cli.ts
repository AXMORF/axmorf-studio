import { pathToFileURL } from "node:url";

import { StoryIdSchema } from "@axmorf/studio/contracts";
import { generateRendererRegistryFromProjectFiles } from "./generate";
import type { RendererRegistryMode } from "./project-files";

export type RendererRegistryCliContext = {
  readonly rootDir: string;
  readonly stdout: (line: string) => void;
  readonly generate?: (request: {
    readonly projectId: string;
    readonly mode: RendererRegistryMode;
  }) => Promise<unknown>;
};

const defaultContext = (): RendererRegistryCliContext => ({
  rootDir: process.cwd(),
  stdout: (line) => process.stdout.write(`${line}\n`),
});

export const runRendererRegistryCli = async (
  args: readonly string[],
  context: RendererRegistryCliContext = defaultContext(),
) => {
  if (
    args.length !== 3 ||
    (args[0] !== "generate" && args[0] !== "check") ||
    args[1] !== "--project"
  ) {
    throw new Error("Expected generate|check --project <storyId>.");
  }
  const request = {
    projectId: StoryIdSchema.parse(args[2]),
    mode: (args[0] === "generate" ? "write" : "check") as RendererRegistryMode,
  };
  const result = context.generate
    ? await context.generate(request)
    : await generateRendererRegistryFromProjectFiles({
        rootDir: context.rootDir,
        ...request,
      });
  context.stdout("RendererRegistry is current.");
  return result;
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runRendererRegistryCli(process.argv.slice(2)).catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Renderer registry failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
