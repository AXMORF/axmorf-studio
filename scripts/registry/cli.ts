import { pathToFileURL } from "node:url";

import { generateProjectRegistry } from "./generate";

export type RegistryCliContext = {
  readonly rootDir: string;
  readonly stdout: (line: string) => void;
};

const defaultContext = (): RegistryCliContext => ({
  rootDir: process.cwd(),
  stdout: (line) => process.stdout.write(`${line}\n`),
});

export const runRegistryCli = async (
  args: readonly string[],
  context: RegistryCliContext = defaultContext(),
) => {
  if (args.length !== 1) {
    throw new Error("Registry CLI accepts exactly one command.");
  }
  const command = args[0];
  if (command !== "generate" && command !== "check") {
    throw new Error("Registry command must be generate or check.");
  }
  const result = await generateProjectRegistry({
    rootDir: context.rootDir,
    mode: command === "generate" ? "write" : "check",
  });
  context.stdout(
    command === "generate"
      ? `Generated ProjectRegistry with ${result.entryCount} entry.`
      : `ProjectRegistry is current with ${result.entryCount} entry.`,
  );
  return result;
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runRegistryCli(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown failure.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
