import { createRequire } from "node:module";

const { version: releaseVersion } = createRequire(import.meta.url)(
  "../package.json",
);
const FLAG_NAMES = new Set(["--yes", "--no-install", "--runtime-package"]);

export const usage = `Usage: npm create axmorf-studio@latest <target> [--yes] [--no-install] [--runtime-package <version-or-path>]

Arguments:
  target        New workspace directory inside the current directory

Options:
  --yes         Run without interactive confirmation
  --no-install  Generate files without installing dependencies
  --runtime-package <version-or-path>
                Use an exact @axmorf/studio version or local package path
  --help        Show this help`;

export const parseArguments = (argv) => {
  const result = {
    target: null,
    yes: false,
    install: true,
    runtimePackage: releaseVersion,
    help: false,
  };
  const seen = new Set();

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      if (seen.has("--help"))
        throw new Error("--help may only be specified once.");
      seen.add("--help");
      result.help = true;
      continue;
    }
    if (argument.startsWith("-")) {
      if (!FLAG_NAMES.has(argument)) {
        throw new Error(`Unknown option: ${argument}`);
      }
      if (seen.has(argument)) {
        throw new Error(`${argument} may only be specified once.`);
      }
      seen.add(argument);
      if (argument === "--yes") {
        result.yes = true;
      } else if (argument === "--no-install") {
        result.install = false;
      } else {
        const value = argv[index + 1];
        if (value === undefined || value.startsWith("-")) {
          throw new Error(
            "--runtime-package requires a package version, path, or tarball.",
          );
        }
        result.runtimePackage = value;
        index += 1;
      }
      continue;
    }
    if (result.target !== null) {
      throw new Error("Exactly one target directory is required.");
    }
    result.target = argument;
  }

  if (!result.help && result.target === null) {
    throw new Error("A target directory is required.");
  }
  return result;
};
