import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Stable `x.y.z` publishes to `latest`; a prerelease such as `x.y.z-rc.1` publishes to `next`. */
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$/u;

const manifestPaths = [
  "package.json",
  "packages/studio/package.json",
  "packages/create-axmorf-studio/package.json",
] as const;

const lockPackageKeys = [
  "",
  "packages/studio",
  "packages/create-axmorf-studio",
];

export const releaseDistTag = (version: string) =>
  version.includes("-") ? "next" : "latest";

const readJson = async (path: string) =>
  JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;

const writeJson = (path: string, value: unknown) =>
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`);

/** Sets one version on the root, runtime and creator manifests and their lockfile entries. */
export const applyReleaseVersion = async (rootDir: string, version: string) => {
  if (!versionPattern.test(version)) {
    throw new Error(
      `Release version must look like 1.2.3 or 1.2.3-rc.1, received ${version}.`,
    );
  }
  for (const relativePath of manifestPaths) {
    const path = join(rootDir, relativePath);
    const manifest = await readJson(path);
    manifest.version = version;
    await writeJson(path, manifest);
  }
  const lockPath = join(rootDir, "package-lock.json");
  const lock = await readJson(lockPath);
  const packages = lock.packages as
    | Record<string, { version?: string }>
    | undefined;
  lock.version = version;
  for (const key of lockPackageKeys) {
    const entry = packages?.[key];
    if (entry === undefined) {
      throw new Error(`package-lock.json has no packages["${key}"] entry.`);
    }
    entry.version = version;
  }
  await writeJson(lockPath, lock);
  return { version, distTag: releaseDistTag(version) };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const version = process.argv[2];
  if (version === undefined) {
    console.error("Usage: npm run release:prepare -- <version>");
    process.exit(1);
  }
  const result = await applyReleaseVersion(process.cwd(), version);
  console.log(
    JSON.stringify({
      ...result,
      next: [
        "npm run check:static",
        `git commit -am "release: ${version}"`,
        `git tag v${version}`,
        `git push origin HEAD v${version}`,
      ],
    }),
  );
}
