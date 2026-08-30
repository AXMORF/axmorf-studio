import { spawn } from "node:child_process";
import * as nodeFileSystem from "node:fs/promises";
import { posix, win32 } from "node:path";

const JAVASCRIPT_EXTENSION = /\.(?:c?js|mjs)$/u;

const pathApiFor = (platform) => (platform === "win32" ? win32 : posix);

const isNotFound = (error) =>
  error !== null && typeof error === "object" && error.code === "ENOENT";

const assertRegularFile = async ({ path, label, filesystem }) => {
  const status = await filesystem.lstat(path);
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symlink file.`);
  }
};

const validateNpmCli = async ({ path, filesystem, pathApi }) => {
  if (!pathApi.isAbsolute(path) || !JAVASCRIPT_EXTENSION.test(path)) {
    throw new Error("npm CLI must be an absolute JavaScript file path.");
  }
  await assertRegularFile({
    path: pathApi.resolve(path),
    label: "npm CLI",
    filesystem,
  });
  return pathApi.resolve(path);
};

const resolveNpmFromManifest = async ({ execPath, filesystem, pathApi }) => {
  const executableDirectory = pathApi.dirname(execPath);
  const candidates = [
    pathApi.resolve(
      executableDirectory,
      "../lib/node_modules/npm/package.json",
    ),
    pathApi.resolve(executableDirectory, "node_modules/npm/package.json"),
    pathApi.resolve(executableDirectory, "../node_modules/npm/package.json"),
  ];
  const visited = new Set();
  for (const manifestPath of candidates) {
    if (visited.has(manifestPath)) continue;
    visited.add(manifestPath);
    try {
      await assertRegularFile({
        path: manifestPath,
        label: "npm package manifest",
        filesystem,
      });
      const manifest = JSON.parse(
        await filesystem.readFile(manifestPath, "utf8"),
      );
      const npmBin = manifest?.name === "npm" ? manifest.bin?.npm : undefined;
      if (typeof npmBin !== "string" || npmBin.trim() === "") continue;
      const packageRoot = pathApi.dirname(manifestPath);
      const cliPath = pathApi.resolve(packageRoot, npmBin);
      const cliRelative = pathApi.relative(packageRoot, cliPath);
      if (
        cliRelative === "" ||
        cliRelative === ".." ||
        cliRelative.startsWith(`..${pathApi.sep}`) ||
        pathApi.isAbsolute(cliRelative)
      ) {
        throw new Error("npm package manifest contains an unsafe bin path.");
      }
      return await validateNpmCli({ path: cliPath, filesystem, pathApi });
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }
  throw new Error(
    "Unable to resolve npm's JavaScript CLI from npm_execpath or the current Node installation.",
  );
};

export const resolveNpmCliPath = async ({
  npmExecPath,
  execPath,
  platform,
  filesystem = nodeFileSystem,
}) => {
  const pathApi = pathApiFor(platform);
  if (npmExecPath !== undefined && npmExecPath.trim() !== "") {
    return validateNpmCli({ path: npmExecPath, filesystem, pathApi });
  }
  return resolveNpmFromManifest({ execPath, filesystem, pathApi });
};

export const buildNpmSpawnRequest = ({
  execPath,
  npmCliPath,
  command,
  args,
  cwd,
}) => ({
  executable: execPath,
  args: [npmCliPath, command, ...args],
  options: {
    cwd,
    stdio: "inherit",
    shell: false,
  },
});

export const createNpmCommandRunner = ({
  npmExecPath,
  execPath,
  platform,
  filesystem = nodeFileSystem,
  spawnProcess = spawn,
}) => {
  let resolvedNpmCli;
  return async (command, args, options) => {
    resolvedNpmCli ??= resolveNpmCliPath({
      npmExecPath,
      execPath,
      platform,
      filesystem,
    });
    const npmCliPath = await resolvedNpmCli;
    const request = buildNpmSpawnRequest({
      execPath,
      npmCliPath,
      command,
      args,
      cwd: options.cwd,
    });
    await new Promise((resolve, reject) => {
      const child = spawnProcess(
        request.executable,
        request.args,
        request.options,
      );
      child.once("error", (error) =>
        reject(new Error(`Failed to start npm ${command}.`, { cause: error })),
      );
      child.once("exit", (code, signal) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(
          new Error(
            signal === null
              ? `npm ${command} failed with exit code ${code ?? "unknown"}.`
              : `npm ${command} was terminated by signal ${signal}.`,
          ),
        );
      });
    });
  };
};
