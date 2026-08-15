import { pathToFileURL } from "node:url";

import { generateSceneTemplateAudioProjection } from "./audio-projection";

export type SceneTemplateAudioCliContext = Readonly<{
  rootDir: string;
  stdout: (line: string) => void;
  generate?: (request: {
    readonly rootDir: string;
    readonly mode: "write" | "check";
  }) => Promise<unknown>;
}>;

const defaultContext = (): SceneTemplateAudioCliContext => ({
  rootDir: process.cwd(),
  stdout: (line) => process.stdout.write(`${line}\n`),
});

export const runSceneTemplateAudioCli = async (
  args: readonly string[],
  context: SceneTemplateAudioCliContext = defaultContext(),
) => {
  if (
    args.length !== 1 ||
    (args[0] !== "generate" && args[0] !== "check")
  ) {
    throw new Error("Expected exactly generate or check.");
  }
  const mode = args[0] === "generate" ? "write" : "check";
  const result = await (context.generate ?? generateSceneTemplateAudioProjection)(
    { rootDir: context.rootDir, mode },
  );
  context.stdout(
    mode === "write"
      ? "Scene template audio projection generated."
      : "Scene template audio projection is current.",
  );
  return result;
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runSceneTemplateAudioCli(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Scene template audio projection failed."}\n`,
    );
    process.exitCode = 1;
  });
}
