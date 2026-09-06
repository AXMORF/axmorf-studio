import * as nodeFileSystem from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath, URL } from "node:url";

import {
  createEmptyResourceCatalog,
  createPackageJson,
  createSafeProducerConfig,
  normalizeRuntimePackage,
} from "./template-values.js";

const DEFAULT_TEMPLATE_ROOT = fileURLToPath(
  new URL("../template", import.meta.url),
);
const PACKAGE_NAME = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u;

const isNotFound = (error) =>
  error !== null && typeof error === "object" && error.code === "ENOENT";

const writeJson = (filesystem, path, value, options = undefined) =>
  filesystem.writeFile(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    ...options,
  });

const assertPackageName = (name) => {
  if (name.length > 214 || !PACKAGE_NAME.test(name)) {
    throw new Error(
      "Target directory name must be a lowercase npm package name using letters, digits, dots, dashes, or underscores.",
    );
  }
};

const inspectTarget = async ({ cwd, rawTarget, filesystem }) => {
  if (rawTarget.includes("\0"))
    throw new Error("Target path contains a null byte.");
  const canonicalCwd = await filesystem.realpath(cwd);
  const targetPath = isAbsolute(rawTarget)
    ? resolve(rawTarget)
    : resolve(canonicalCwd, rawTarget);
  const targetRelative = relative(canonicalCwd, targetPath);
  if (
    targetRelative === "" ||
    targetRelative === ".." ||
    targetRelative.startsWith(`..${sep}`) ||
    isAbsolute(targetRelative)
  ) {
    throw new Error("Target must stay inside the current directory.");
  }

  const parentPath = dirname(targetPath);
  let parentStatus;
  try {
    parentStatus = await filesystem.lstat(parentPath);
  } catch (error) {
    if (isNotFound(error)) {
      throw new Error("Target parent directory must already exist.", {
        cause: error,
      });
    }
    throw error;
  }
  if (parentStatus.isSymbolicLink() || !parentStatus.isDirectory()) {
    throw new Error(
      "Target parent must be a real directory, not a symlink or special file.",
    );
  }
  if ((await filesystem.realpath(parentPath)) !== parentPath) {
    throw new Error("Target parent path must not pass through a symlink.");
  }

  try {
    const status = await filesystem.lstat(targetPath);
    if (status.isSymbolicLink()) {
      throw new Error("Target must not be a symbolic link.");
    }
    if (status.isDirectory()) {
      const entries = await filesystem.readdir(targetPath);
      if (entries.length > 0) throw new Error("Target directory is not empty.");
    }
    throw new Error(
      "Target path already exists; atomic creation requires a new directory.",
    );
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }

  const packageName = basename(targetPath);
  assertPackageName(packageName);
  return { targetPath, parentPath, packageName };
};

const copyTemplateTree = async ({ source, destination, filesystem }) => {
  await filesystem.mkdir(destination, { recursive: true });
  const entries = await filesystem.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyTemplateTree({
        source: sourcePath,
        destination: destinationPath,
        filesystem,
      });
    } else if (entry.isFile()) {
      await filesystem.copyFile(sourcePath, destinationPath);
    } else {
      throw new Error(`Template contains a non-regular entry: ${entry.name}`);
    }
  }
};

const validateGeneratedWorkspace = async ({ rootDir, filesystem }) => {
  const requiredFiles = [
    "package.json",
    "producer.config.example.json",
    "private/producer.config.json",
    "AGENTS.md",
    "CLAUDE.md",
    "GEMINI.md",
    ".agents/skills/axmorf-video/SKILL.md",
    "remotion.config.mjs",
    "src/index.ts",
    "src/index.css",
    "src/projects/project-registry.generated.ts",
    "src/remotion/catalog/resource-catalog.generated.json",
    "src/runtime/capabilities.ts",
    "src/runtime/styles.ts",
  ];
  for (const relativePath of requiredFiles) {
    const status = await filesystem.lstat(join(rootDir, relativePath));
    if (!status.isFile() || status.isSymbolicLink()) {
      throw new Error(
        `Generated workspace entry is not a regular file: ${relativePath}`,
      );
    }
  }
  const manifest = JSON.parse(
    await filesystem.readFile(join(rootDir, "package.json"), "utf8"),
  );
  if (
    manifest.private !== true ||
    manifest.type !== "module" ||
    manifest.axmorf?.workspaceVersion !== 1 ||
    Object.hasOwn(manifest, "workspaces")
  ) {
    throw new Error(
      "Generated package.json does not satisfy the workspace contract.",
    );
  }
};

const removeStaging = async (filesystem, stagingPath) => {
  if (stagingPath === null) return;
  await filesystem.rm(stagingPath, { recursive: true, force: true });
};

export const createWorkspace = async (
  { cwd, target, install, runtimePackage },
  {
    filesystem = nodeFileSystem,
    runCommand,
    templateRoot = DEFAULT_TEMPLATE_ROOT,
  },
) => {
  if (typeof runCommand !== "function") {
    throw new Error("A command runner is required.");
  }
  const resolved = await inspectTarget({ cwd, rawTarget: target, filesystem });
  const normalizedRuntimePackage = normalizeRuntimePackage(runtimePackage, cwd);
  let stagingPath = null;
  try {
    stagingPath = await filesystem.mkdtemp(
      join(resolved.parentPath, `.${resolved.packageName}.staging-`),
    );
    await copyTemplateTree({
      source: templateRoot,
      destination: stagingPath,
      filesystem,
    });
    await filesystem.rename(
      join(stagingPath, "gitignore.template"),
      join(stagingPath, ".gitignore"),
    );
    const manifest = createPackageJson({
      name: resolved.packageName,
      runtimePackage: normalizedRuntimePackage,
    });
    const producerConfig = createSafeProducerConfig();
    await writeJson(filesystem, join(stagingPath, "package.json"), manifest);
    await writeJson(
      filesystem,
      join(stagingPath, "producer.config.example.json"),
      producerConfig,
    );
    await filesystem.mkdir(join(stagingPath, "private"), {
      recursive: true,
      mode: 0o700,
    });
    await writeJson(
      filesystem,
      join(stagingPath, "private/producer.config.json"),
      producerConfig,
      { mode: 0o600 },
    );
    await filesystem.mkdir(join(stagingPath, "src/remotion/catalog"), {
      recursive: true,
    });
    await writeJson(
      filesystem,
      join(stagingPath, "src/remotion/catalog/resource-catalog.generated.json"),
      createEmptyResourceCatalog(),
    );
    await validateGeneratedWorkspace({ rootDir: stagingPath, filesystem });

    if (install) {
      await runCommand("install", [], { cwd: stagingPath });
      await runCommand("run", ["--silent", "bootstrap"], { cwd: stagingPath });
      await runCommand("run", ["--silent", "browser:prepare"], {
        cwd: stagingPath,
      });
      await runCommand("run", ["--silent", "doctor"], { cwd: stagingPath });
      const lockStatus = await filesystem.lstat(
        join(stagingPath, "package-lock.json"),
      );
      if (!lockStatus.isFile() || lockStatus.isSymbolicLink()) {
        throw new Error(
          "npm install did not create a regular package-lock.json.",
        );
      }
    }

    await filesystem.rename(stagingPath, resolved.targetPath);
    stagingPath = null;
    return {
      status: install ? "workspace-ready" : "workspace-generated",
      ready: install,
      workspace: resolved.targetPath,
      packageName: resolved.packageName,
      workspaceVersion: 1,
      installed: install,
      ...(install
        ? {}
        : {
            next: [
              "npm install",
              "npm run bootstrap",
              "npm run browser:prepare",
              "npm run doctor",
            ],
          }),
    };
  } catch (error) {
    let browserLog = "";
    if (stagingPath !== null) {
      try {
        browserLog = (
          await filesystem.readFile(
            join(stagingPath, ".axmorf-browser-prepare.log"),
            "utf8",
          )
        ).slice(-4096);
      } catch (logError) {
        if (!isNotFound(logError))
          browserLog = "Browser preparation log could not be read.";
      }
    }
    await removeStaging(filesystem, stagingPath).catch(() => undefined);
    if (browserLog !== "") {
      throw new Error(
        `${error instanceof Error ? error.message : "Workspace setup failed."}\nBrowser preparation output (last 4096 characters):\n${browserLog}`,
        { cause: error },
      );
    }
    throw error;
  }
};
