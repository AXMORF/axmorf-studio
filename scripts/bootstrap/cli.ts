import { pathToFileURL } from "node:url";

import { bootstrapRepository } from "./repository";

export const runBootstrapCli = async ({
  rootDir,
  stdout = (value: string) => process.stdout.write(value),
}: {
  readonly rootDir: string;
  readonly stdout?: (value: string) => void;
}) => {
  const result = await bootstrapRepository(rootDir);
  stdout(`${JSON.stringify({ bootstrapVersion: 1, ...result })}\n`);
  return result;
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.length !== 2) {
    throw new Error("Repository bootstrap does not accept arguments.");
  }
  runBootstrapCli({ rootDir: process.cwd() }).catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Repository bootstrap failed."}\n`,
    );
    process.exitCode = 1;
  });
}
