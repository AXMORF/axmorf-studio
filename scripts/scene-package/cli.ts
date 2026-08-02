import { pathToFileURL } from "node:url";

import { StoryIdSchema } from "../../src/contracts";
import { generateScenePackageFromProjectFiles } from "./generate";
import type { SceneArtifactMode } from "./project-files";

type PackageRequest = {
  readonly action: "package";
  readonly projectId: string;
  readonly meaningId: string;
  readonly mode: SceneArtifactMode;
};

type CoverageRequest = {
  readonly action: "coverage";
  readonly projectId: string;
  readonly mode: SceneArtifactMode;
};

export type ScenePackageCliContext = {
  readonly rootDir: string;
  readonly stdout: (line: string) => void;
  readonly generatePackage?: (request: PackageRequest) => Promise<unknown>;
  readonly generateCoverage?: (request: CoverageRequest) => Promise<unknown>;
};

const defaultContext = (): ScenePackageCliContext => ({
  rootDir: process.cwd(),
  stdout: (line) => process.stdout.write(`${line}\n`),
});

const parseMode = (value: string | undefined): SceneArtifactMode => {
  if (value === "--write") return "write";
  if (value === "--check") return "check";
  throw new Error("Scene artifact mode must be --write or --check.");
};

export const runScenePackageCli = async (
  args: readonly string[],
  context: ScenePackageCliContext = defaultContext(),
) => {
  if (
    args.length === 6 &&
    args[0] === "package" &&
    args[1] === "--project" &&
    args[3] === "--meaning"
  ) {
    const request: PackageRequest = {
      action: "package",
      projectId: StoryIdSchema.parse(args[2]),
      meaningId: StoryIdSchema.parse(args[4]),
      mode: parseMode(args[5]),
    };
    const result = context.generatePackage
      ? await context.generatePackage(request)
      : await generateScenePackageFromProjectFiles({
          rootDir: context.rootDir,
          projectId: request.projectId,
          meaningId: request.meaningId,
          mode: request.mode,
        });
    context.stdout("ScenePackage is current.");
    return result;
  }
  if (args.length === 4 && args[0] === "coverage" && args[1] === "--project") {
    const request: CoverageRequest = {
      action: "coverage",
      projectId: StoryIdSchema.parse(args[2]),
      mode: parseMode(args[3]),
    };
    if (!context.generateCoverage) {
      throw new Error(
        "Coverage generation requires current project package inputs.",
      );
    }
    const result = await context.generateCoverage(request);
    context.stdout("SceneCoverageMap is current.");
    return result;
  }
  throw new Error("Expected exact Scene package or coverage arguments.");
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runScenePackageCli(process.argv.slice(2)).catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Scene artifact failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
