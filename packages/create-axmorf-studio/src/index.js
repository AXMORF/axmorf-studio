import { createRequire } from "node:module";
import process from "node:process";

import { parseArguments, usage } from "./arguments.js";
import { createNpmCommandRunner } from "./npm-command.js";
import { createWorkspace } from "./scaffold.js";
import { upgradeWorkspace } from "./upgrade.js";

const { version: releaseVersion } = createRequire(import.meta.url)(
  "../package.json",
);

export const runCli = async (
  argv,
  {
    cwd = process.cwd(),
    platform = process.platform,
    stdout = (value) => process.stdout.write(value),
    stderr = (value) => process.stderr.write(value),
    runCommand = createNpmCommandRunner({
      npmExecPath: process.env.npm_execpath,
      execPath: process.execPath,
      platform,
    }),
    filesystem,
    templateRoot,
  } = {},
) => {
  const parsed = parseArguments(argv);
  if (parsed.help) {
    stdout(`${usage}\n`);
    return { status: "help" };
  }
  if (parsed.command === "upgrade") {
    const upgraded = await upgradeWorkspace(
      {
        cwd,
        target: parsed.target,
        install: parsed.install,
        dryRun: parsed.dryRun,
        runtimePackage: parsed.runtimePackage,
        creatorVersion: releaseVersion,
      },
      {
        ...(filesystem === undefined ? {} : { filesystem }),
        ...(templateRoot === undefined ? {} : { templateRoot }),
        runCommand,
        progress: stderr,
      },
    );
    stdout(`${JSON.stringify(upgraded)}\n`);
    return upgraded;
  }
  const result = await createWorkspace(
    {
      cwd,
      target: parsed.target,
      install: parsed.install,
      runtimePackage: parsed.runtimePackage,
    },
    {
      ...(filesystem === undefined ? {} : { filesystem }),
      ...(templateRoot === undefined ? {} : { templateRoot }),
      runCommand,
      progress: stderr,
    },
  );
  stdout(`${JSON.stringify(result)}\n`);
  return result;
};

export { parseArguments } from "./arguments.js";
export {
  buildNpmSpawnRequest,
  createNpmCommandRunner,
  resolveNpmCliPath,
} from "./npm-command.js";
export { createWorkspace } from "./scaffold.js";
export {
  MANAGED_FILES,
  MIRRORED_DIRECTORIES,
  desiredManagedFiles,
  planWorkspaceUpgrade,
  upgradeWorkspace,
} from "./upgrade.js";
export {
  RUNTIME_PACKAGE_NAME,
  createEmptyResourceCatalog,
  createPackageJson,
  createSafeProducerConfig,
  mergeWorkspacePackageJson,
  normalizeRuntimePackage,
} from "./template-values.js";
