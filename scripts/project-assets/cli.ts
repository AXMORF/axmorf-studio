import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

import { importProjectAsset } from "./application/import";

export const runProjectAssetImportCli = async (
  args: readonly string[],
  context: Readonly<{
    rootDir: string;
    stdout: (line: string) => void;
  }> = {
    rootDir: process.cwd(),
    stdout: (line) => process.stdout.write(`${line}\n`),
  },
) => {
  if (
    args.length !== 6 ||
    args[0] !== "--project" ||
    args[2] !== "--receipt" ||
    args[4] !== "--role"
  ) {
    throw new Error(
      "Expected --project <storyId> --receipt <absolute-path> --role <scene-visual|global-visual>.",
    );
  }
  const receiptPath = args[3] ?? "";
  if (!isAbsolute(receiptPath)) {
    throw new Error("Provider receipt path must be absolute.");
  }
  const role = args[5];
  if (role !== "scene-visual" && role !== "global-visual") {
    throw new Error(
      "Project image role must be scene-visual or global-visual.",
    );
  }
  const result = await importProjectAsset({
    rootDir: context.rootDir,
    projectId: args[1] ?? "",
    receiptPath,
    role,
  });
  context.stdout(JSON.stringify(result));
  return result;
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runProjectAssetImportCli(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Project asset import failed."}\n`,
    );
    process.exitCode = 1;
  });
}
