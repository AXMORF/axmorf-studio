import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

type PackageManifest = Readonly<{
  name?: string;
  version?: string;
  private?: boolean;
  license?: string;
  type?: string;
  workspaces?: readonly string[];
  engines?: Readonly<Record<string, string>>;
  repository?: Readonly<Record<string, string>>;
  publishConfig?: Readonly<Record<string, string>>;
  exports?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  bin?: Readonly<Record<string, string>>;
  files?: readonly string[];
  scripts?: Readonly<Record<string, string>>;
  sideEffects?: readonly string[];
  dependencies?: Readonly<Record<string, string>>;
  peerDependencies?: Readonly<Record<string, string>>;
  overrides?: Readonly<Record<string, string>>;
  bundleDependencies?: unknown;
  bundledDependencies?: unknown;
}>;

const readManifest = async (path: string) =>
  JSON.parse(await readFile(path, "utf8")) as PackageManifest;

const rootDir = process.cwd();
const runtimePackageDir = join(rootDir, "packages/studio");
const creatorPackageDir = join(rootDir, "packages/create-axmorf-studio");

test("the private repository root owns exactly the two public npm packages", async () => {
  const manifest = await readManifest(join(rootDir, "package.json"));

  assert.equal(manifest.name, "axmorf-studio");
  assert.equal(manifest.private, true);
  assert.equal(manifest.license, "Apache-2.0");
  assert.deepEqual(manifest.overrides, {
    "fast-uri": "3.1.6",
    nanoid: "3.3.18",
  });
  assert.deepEqual(manifest.workspaces, [
    "packages/studio",
    "packages/create-axmorf-studio",
  ]);
  assert.equal(
    manifest.scripts?.["test:package-boundary"],
    "node --import tsx --test tests/package-boundary/*.test.ts",
  );
});

test("TypeScript resolves runtime workspace entrypoints from source", async () => {
  const config = JSON.parse(
    await readFile(join(rootDir, "tsconfig.json"), "utf8"),
  ) as {
    compilerOptions?: {
      paths?: Readonly<Record<string, readonly string[]>>;
    };
  };

  assert.deepEqual(config.compilerOptions?.paths?.["@axmorf/studio"], [
    "packages/studio/src/index.ts",
  ]);
  assert.deepEqual(
    config.compilerOptions?.paths?.["@axmorf/studio/contracts"],
    ["packages/studio/src/contracts/index.ts"],
  );
  assert.deepEqual(config.compilerOptions?.paths?.["@axmorf/studio/remotion"], [
    "packages/studio/src/remotion.ts",
  ]);
});

test("the runtime package exposes only stable ESM entrypoints", async () => {
  const manifest = await readManifest(join(runtimePackageDir, "package.json"));

  assert.equal(manifest.name, "@axmorf/studio");
  assert.equal(manifest.version, "0.1.0");
  assert.equal(manifest.type, "module");
  assert.deepEqual(manifest.engines, { node: ">=20.19.0", npm: ">=10" });
  assert.deepEqual(manifest.bin, {
    axmorf: "dist/cli/main.js",
  });
  assert.deepEqual(manifest.exports, {
    ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
    "./contracts": {
      types: "./dist/contracts.d.ts",
      import: "./dist/contracts.js",
    },
    "./remotion": {
      types: "./dist/remotion.d.ts",
      import: "./dist/remotion.js",
    },
  });
  assert.equal(Object.hasOwn(manifest.exports ?? {}, "./*"), false);
  assert.deepEqual(manifest.sideEffects, [
    "**/*.css",
    "./src/remotion/preflight/index.tsx",
  ]);
});

test("the runtime package uses a positive public publish allowlist", async () => {
  const manifest = await readManifest(join(runtimePackageDir, "package.json"));

  assert.deepEqual(manifest.files, [
    "dist",
    "README.md",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
  ]);
  assert.equal(manifest.bundleDependencies, undefined);
  assert.equal(manifest.bundledDependencies, undefined);
  assert.equal(manifest.private, undefined);
  assert.equal(manifest.license, "Apache-2.0");
  assert.deepEqual(manifest.publishConfig, { access: "public" });
  assert.equal(manifest.repository?.directory, "packages/studio");
});

test("the creator has one clear npm initializer name and a complete release surface", async () => {
  const manifest = await readManifest(join(creatorPackageDir, "package.json"));

  assert.equal(manifest.name, "create-axmorf-studio");
  assert.equal(manifest.private, undefined);
  assert.equal(manifest.license, "Apache-2.0");
  assert.deepEqual(manifest.publishConfig, { access: "public" });
  assert.deepEqual(manifest.bin, {
    "create-axmorf-studio": "bin/create-axmorf-studio.js",
  });
  assert.deepEqual(manifest.files, [
    "bin/",
    "src/",
    "template/",
    "README.md",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
  ]);
  assert.equal(manifest.repository?.directory, "packages/create-axmorf-studio");
});

test("all public packages carry the repository Apache-2.0 text", async () => {
  const rootLicense = await readFile(join(rootDir, "LICENSE"), "utf8");

  assert.equal(
    await readFile(join(runtimePackageDir, "LICENSE"), "utf8"),
    rootLicense,
  );
  assert.equal(
    await readFile(join(creatorPackageDir, "LICENSE"), "utf8"),
    rootLicense,
  );
});

test("prepack is local-only and cannot bootstrap or acquire dependencies", async () => {
  const manifest = await readManifest(join(runtimePackageDir, "package.json"));
  const prepack = manifest.scripts?.prepack ?? "";

  assert.match(prepack, /npm run build/u);
  assert.match(prepack, /npm run check:package/u);
  assert.doesNotMatch(
    prepack,
    /(?:bootstrap|npm install|npm ci|npx|curl|wget|https?:)/iu,
  );
});

test("creator prepack is local-only and cannot install or execute a workspace", async () => {
  const manifest = await readManifest(join(creatorPackageDir, "package.json"));
  const prepack = manifest.scripts?.prepack ?? "";

  assert.equal(prepack, "npm run check:package");
  assert.doesNotMatch(
    prepack,
    /(?:bootstrap|doctor|npm install|npm ci|npx|curl|wget|https?:)/iu,
  );
});
