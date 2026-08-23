import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildRuntimePack, verifyRuntimePack, type RuntimePackBuildInput } from "../../desktop/adapters/runtime-pack-filesystem";

const value = (args: readonly string[], option: string) => {
  const index = args.indexOf(option);
  if (index < 0 || index + 1 >= args.length) throw new Error(`Missing ${option}.`);
  return resolve(args[index + 1]!);
};

export const runRuntimePackCli = async (args: readonly string[]) => {
  const command = args[0];
  if (command === "check" || command === "inventory") {
    const manifest = await verifyRuntimePack({
      runtimePackRoot: value(args, "--runtime-pack"),
      expectedPlatform: args.includes("--allow-cross-platform") ? "darwin" : process.platform,
    });
    process.stdout.write(`${JSON.stringify(command === "inventory" ? manifest.files : manifest)}\n`);
    return;
  }
  if (command === "build") {
    const input = JSON.parse(await readFile(value(args, "--input"), "utf8")) as RuntimePackBuildInput;
    const manifest = await buildRuntimePack(input);
    process.stdout.write(`${JSON.stringify(manifest)}\n`);
    return;
  }
  throw new Error("Expected build, check, or inventory.");
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runRuntimePackCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
