import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { StoryIdSchema } from "@axmorf/studio/contracts";
import { buildFinalAssembly } from "./domain";
import {
  checkPersistedFinalAssembly,
  writeFinalAssemblyIfPassed,
} from "./files";

export const parseFinalAssemblyArgs = (args: readonly string[]) => {
  if (
    args.length !== 3 ||
    args[0] !== "--project" ||
    !["--check", "--write"].includes(args[2])
  ) {
    throw new Error("Expected --project <story> --check or --write.");
  }
  return {
    storyId: StoryIdSchema.parse(args[1]),
    mode: args[2] === "--write" ? ("write" as const) : ("check" as const),
  };
};

export const runFinalAssemblyCli = async (
  args: readonly string[],
  rootDir = process.cwd(),
) => {
  const { storyId, mode } = parseFinalAssemblyArgs(args);
  const source = join(
    rootDir,
    "src",
    "projects",
    storyId,
    "final-assembly-plan.json",
  );
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(source, "utf8"));
  } catch {
    throw new Error("FinalAssembly plan is missing or malformed.");
  }
  const assembly = buildFinalAssembly(raw);
  const result =
    mode === "write"
      ? await writeFinalAssemblyIfPassed({ rootDir, assembly })
      : await checkPersistedFinalAssembly({
          rootDir,
          expectedAssembly: assembly,
        });
  process.stdout.write(
    `${JSON.stringify({ storyId, mode, finalAssemblyFingerprint: assembly.finalAssemblyFingerprint })}\n`,
  );
  return result;
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runFinalAssemblyCli(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "FinalAssembly failed."}\n`,
    );
    process.exitCode = 1;
  });
}
