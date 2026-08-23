import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildRuntimePack,
  probeRuntimeExecutable,
  readDesktopCompatibilityManifest,
  verifyRuntimePack,
} from "../../desktop/adapters/runtime-pack-filesystem";
import {
  DESKTOP_REQUIRED_REMOTION_PACKAGES,
  RuntimePackManifestSchema,
  assertDesktopRuntimeCompatibility,
  buildDesktopCompatibilityManifest,
  createRendererRuntimeFingerprint,
} from "../../desktop/contracts/runtime-pack";
import {
  DESKTOP_FORBIDDEN_RUNTIME_PACKAGES,
  DESKTOP_RENDER_SOURCE_PACKAGES,
  buildDesktopRuntimePack,
  collectDesktopProductionModuleClosure,
  listDesktopRuntimeSourcePaths,
  resolveDesktopRuntimeModuleLocations,
  resolveDesktopRuntimeModuleNames,
} from "../../scripts/desktop/build-runtime-pack";

const fixture = async (t: test.TestContext) => {
  const root = await mkdtemp(join(tmpdir(), "rsp-runtime-"));
  t.after(async () => { await import("node:fs/promises").then(({ rm }) => rm(root, { recursive: true, force: true })); });
  const sources = join(root, "sources"); await mkdir(sources);
  const make = async (name: string) => { const path = join(sources, name); await writeFile(path, `#!/bin/sh\necho ${name}\n`); await chmod(path, 0o755); return path; };
  const pack = join(root, "pack");
  const packageFiles = await Promise.all(
    ["remotion", ...DESKTOP_REQUIRED_REMOTION_PACKAGES].map(async (name) => {
      const source = join(
        sources,
        `${name.replaceAll("/", "-").replaceAll("@", "")}-package.json`,
      );
      await writeFile(
        source,
        `${JSON.stringify({ name, version: "4.0.489" })}\n`,
      );
      return {
        source,
        relativePath: `node_modules/${name}/package.json`,
      };
    }),
  );
  const input = {
    outputRoot: pack,
    architecture: "arm64",
    remotionPackages: ["remotion", ...DESKTOP_REQUIRED_REMOTION_PACKAGES]
      .sort()
      .map((name) => ({ name, version: "4.0.489" })),
    binaries: {
      rendererBrowser: { source: await make("browser"), relativePath: "bin/browser", version: "1" },
      ffmpeg: { source: await make("ffmpeg"), relativePath: "bin/ffmpeg", version: "1" },
      ffprobe: { source: await make("ffprobe"), relativePath: "bin/ffprobe", version: "1" },
      node: { source: await make("node"), relativePath: "bin/node", version: "24" },
      rspClient: { source: await make("rsp"), relativePath: "bin/rsp", version: "1" },
    },
    additionalFiles: packageFiles,
  } as const;
  const manifest = await buildRuntimePack(input);
  return { root, pack, manifest, input };
};

test("Runtime Pack build is exact and deterministic", async (t) => {
  const { pack, manifest, input } = await fixture(t);
  const verified = await verifyRuntimePack({ runtimePackRoot: pack, expectedArchitecture: "arm64", expectedPlatform: "darwin" });
  assert.equal(verified.runtimePackId, manifest.runtimePackId);
  assert.deepEqual(verified.files.map(({ path }) => path), [
    "bin/browser",
    "bin/ffmpeg",
    "bin/ffprobe",
    "bin/node",
    "bin/rsp",
    "node_modules/@remotion/bundler/package.json",
    "node_modules/@remotion/renderer/package.json",
    "node_modules/@remotion/studio-shared/package.json",
    "node_modules/@remotion/studio/package.json",
    "node_modules/remotion/package.json",
  ]);
  assert.equal((await buildRuntimePack(input)).runtimePackId, manifest.runtimePackId);
});

test("Runtime Pack rejects unknown files, symlinks, checksum and architecture drift", async (t) => {
  const unknown = await fixture(t); await writeFile(join(unknown.pack, "unknown"), "x");
  await assert.rejects(() => verifyRuntimePack({ runtimePackRoot: unknown.pack, expectedArchitecture: "arm64", expectedPlatform: "darwin" }), /inventory drifted/u);
  const link = await fixture(t); await symlink("bin/rsp", join(link.pack, "alias"));
  await assert.rejects(() => verifyRuntimePack({ runtimePackRoot: link.pack, expectedArchitecture: "arm64", expectedPlatform: "darwin" }), /symlinks/u);
  const checksum = await fixture(t); await writeFile(join(checksum.pack, "bin/rsp"), "drift");
  await assert.rejects(() => verifyRuntimePack({ runtimePackRoot: checksum.pack, expectedArchitecture: "arm64", expectedPlatform: "darwin" }), /checksum|mode/u);
  const arch = await fixture(t);
  await assert.rejects(() => verifyRuntimePack({ runtimePackRoot: arch.pack, expectedArchitecture: "x64", expectedPlatform: "darwin" }), /incompatible/u);
});

test("Runtime Pack verifier binds Remotion identities to copied package manifests", async (t) => {
  const source = await fixture(t);
  const studioPackage = source.input.additionalFiles.find(
    ({ relativePath }) =>
      relativePath === "node_modules/@remotion/studio/package.json",
  );
  assert.ok(studioPackage);
  await writeFile(
    studioPackage.source,
    `${JSON.stringify({ name: "@remotion/studio", version: "4.0.488" })}\n`,
  );
  await assert.rejects(
    () =>
      buildRuntimePack({
        ...source.input,
        outputRoot: join(source.root, "identity-drift"),
      }),
    /Runtime package identity drifted/u,
  );
});

test("Runtime Pack root is a canonical real directory at the expected Resources path", async (t) => {
  const source = await fixture(t);
  const rootLink = join(source.root, "runtime-link");
  await symlink(source.pack, rootLink, "dir");
  await assert.rejects(
    () => verifyRuntimePack({ runtimePackRoot: rootLink }),
    /real directory/u,
  );

  const resourcesRoot = join(source.root, "AXMORF.app", "Contents", "Resources");
  await mkdir(resourcesRoot, { recursive: true });
  const embeddedRoot = join(resourcesRoot, "runtime-pack");
  await buildRuntimePack({ ...source.input, outputRoot: embeddedRoot });
  await verifyRuntimePack({
    runtimePackRoot: embeddedRoot,
    expectedArchitecture: "arm64",
    expectedPlatform: "darwin",
    expectedResourcesRoot: resourcesRoot,
  });
  await assert.rejects(
    () =>
      verifyRuntimePack({
        runtimePackRoot: embeddedRoot,
        expectedResourcesRoot: source.root,
      }),
    /outside the expected App Resources/u,
  );
  const resourcesLink = join(source.root, "resources-link");
  await symlink(resourcesRoot, resourcesLink, "dir");
  await assert.rejects(
    () =>
      verifyRuntimePack({
        runtimePackRoot: embeddedRoot,
        expectedResourcesRoot: resourcesLink,
      }),
    /App Resources root is not a real directory/u,
  );
});

test("Compatibility and renderer identity bind only the verified Runtime Pack", async (t) => {
  const { manifest } = await fixture(t);
  const compatibility = buildDesktopCompatibilityManifest({ appVersion: "0.1.0", runtimePack: manifest });
  assert.equal(assertDesktopRuntimeCompatibility({ compatibility, runtimePack: manifest }).runtimePackId, manifest.runtimePackId);
  assert.match(createRendererRuntimeFingerprint(manifest), /^sha256:[a-f0-9]{64}$/u);
  assert.throws(() => assertDesktopRuntimeCompatibility({ compatibility: { ...compatibility, runtimePackId: `runtime-pack-${"f".repeat(64)}` }, runtimePack: manifest }), /incompatible/u);
});

test("Runtime Pack requires the render-only Remotion toolchain and rejects launch surfaces", async (t) => {
  const { manifest } = await fixture(t);
  assert.deepEqual(
    manifest.remotionPackages
      .filter(({ name }) => DESKTOP_REQUIRED_REMOTION_PACKAGES.includes(name as never))
      .map(({ name }) => name),
    [...DESKTOP_REQUIRED_REMOTION_PACKAGES].sort(),
  );
  assert.throws(
    () =>
      RuntimePackManifestSchema.parse({
        ...manifest,
        remotionPackages: manifest.remotionPackages.map((entry) =>
          entry.name === "@remotion/studio"
            ? { ...entry, version: "4.0.488" }
            : entry,
        ),
      }),
    /exact version 4\.0\.489/u,
  );
  assert.throws(
    () =>
      RuntimePackManifestSchema.parse({
        ...manifest,
        remotionPackages: manifest.remotionPackages.filter(
          ({ name }) => name !== "@remotion/renderer",
        ),
        files: [
          ...manifest.files.filter(
            ({ path }) => path !== "node_modules/@remotion/renderer/package.json",
          ),
        ],
      }),
    /required Remotion package/u,
  );
  assert.throws(
    () =>
      RuntimePackManifestSchema.parse({
        ...manifest,
        remotionPackages: [
          { name: "@remotion/effects", version: "4.0.489" },
          ...manifest.remotionPackages,
        ].sort((left, right) => left.name.localeCompare(right.name)),
      }),
    /exactly match copied Remotion node_modules roots/u,
  );
  for (const name of ["@remotion/cli", "@remotion/studio-server"]) {
    const packagePath = `node_modules/${name}/package.json`;
    assert.throws(
      () =>
        RuntimePackManifestSchema.parse({
          ...manifest,
          remotionPackages: [
            ...manifest.remotionPackages,
            { name, version: "4.0.489" },
          ].sort((left, right) => left.name.localeCompare(right.name)),
          files: [
            ...manifest.files,
            {
              path: packagePath,
              sizeBytes: 1,
              sha256: "f".repeat(64),
              executable: false,
            },
          ].sort((left, right) => left.path.localeCompare(right.path)),
        }),
      /Unsupported Runtime Pack package/u,
    );
    assert.throws(
      () =>
        RuntimePackManifestSchema.parse({
          ...manifest,
          files: [
            ...manifest.files,
            {
              path: `node_modules/example/node_modules/${name}/package.json`,
              sizeBytes: 1,
              sha256: "f".repeat(64),
              executable: false,
            },
          ].sort((left, right) => left.path.localeCompare(right.path)),
        }),
      /Unsupported Runtime Pack package/u,
    );
  }
  assert.throws(
    () =>
      RuntimePackManifestSchema.parse({
        ...manifest,
        files: [
          ...manifest.files,
          {
            path: "node_modules/.bin/remotion",
            sizeBytes: 1,
            sha256: "f".repeat(64),
            executable: true,
          },
        ].sort((left, right) => left.path.localeCompare(right.path)),
      }),
    /Remotion CLI launch surface/u,
  );
});

test("Compatibility manifest is bounded strict JSON under a real Resources root", async (t) => {
  const { root, manifest } = await fixture(t);
  const resourcesRoot = join(root, "Resources");
  await mkdir(resourcesRoot);
  const manifestPath = join(resourcesRoot, "compatibility.json");
  const compatibility = buildDesktopCompatibilityManifest({
    appVersion: "0.1.0",
    runtimePack: manifest,
  });
  await writeFile(manifestPath, `${JSON.stringify(compatibility)}\n`);
  assert.deepEqual(
    await readDesktopCompatibilityManifest(resourcesRoot),
    compatibility,
  );

  await writeFile(
    manifestPath,
    JSON.stringify({ ...compatibility, unexpected: true }),
  );
  await assert.rejects(
    () => readDesktopCompatibilityManifest(resourcesRoot),
    /unrecognized key/iu,
  );
  await writeFile(manifestPath, " ".repeat(64 * 1024 + 1));
  await assert.rejects(
    () => readDesktopCompatibilityManifest(resourcesRoot),
    /invalid size/u,
  );
  await rm(manifestPath);
  await writeFile(join(root, "compatibility-target.json"), "{}\n");
  await symlink(
    join(root, "compatibility-target.json"),
    manifestPath,
    "file",
  );
  await assert.rejects(
    () => readDesktopCompatibilityManifest(resourcesRoot),
    /not a regular file/u,
  );

  const resourcesLink = join(root, "Resources-link");
  await symlink(resourcesRoot, resourcesLink, "dir");
  await assert.rejects(
    () => readDesktopCompatibilityManifest(resourcesLink),
    /App Resources root is not a real directory/u,
  );
});

test("Runtime executable probe is bounded and does not inherit host environment", async (t) => {
  const { root } = await fixture(t);
  const executable = join(root, "probe");
  process.env.RSP_PROBE_SECRET = "must-not-leak";
  t.after(() => { delete process.env.RSP_PROBE_SECRET; });
  await writeFile(executable, '#!/bin/sh\nif [ -n "${RSP_PROBE_SECRET:-}" ]; then exit 9; fi\necho runtime-v1\n');
  await chmod(executable, 0o755);
  assert.equal(await probeRuntimeExecutable({ executable }), "runtime-v1");
});

test("native Runtime Pack build refuses a non-Apple-Silicon host", async () => {
  if (process.platform === "darwin" && process.arch === "arm64") return;
  await assert.rejects(() => buildDesktopRuntimePack(), /native-host-required/u);
});

test("Runtime Pack source closure is explicit and excludes native fixtures", () => {
  const paths = listDesktopRuntimeSourcePaths();
  const pathSet = new Set<string>(paths);
  for (const required of [
    "package.json",
    "package-lock.json",
    "remotion.config.ts",
    "tsconfig.json",
    "src/contracts",
    "src/remotion",
    "scripts/project-production/application/prepare-delivery.ts",
  ]) {
    assert.ok(pathSet.has(required), required);
  }
  assert.equal(paths.some((path) => path.startsWith("scripts/desktop/")), false);
  assert.equal(DESKTOP_RENDER_SOURCE_PACKAGES.includes("@remotion/cli" as never), false);
  assert.ok(DESKTOP_RENDER_SOURCE_PACKAGES.includes("@remotion/bundler"));
  assert.ok(DESKTOP_RENDER_SOURCE_PACKAGES.includes("@remotion/renderer"));
  assert.equal(DESKTOP_RENDER_SOURCE_PACKAGES.includes("@remotion/studio" as never), false);
});

test("Runtime Pack lock closure preserves nested packages and filters target-native optional packages", () => {
  const lock = {
    packages: {
      "node_modules/@remotion/bundler": {
        version: "4.0.489",
        dependencies: { esbuild: "0.28.1" },
        peerDependencies: { react: ">=18" },
        optionalDependencies: {
          "@rspack/binding-darwin-arm64": "1",
          "@rspack/binding-linux-x64-gnu": "1",
        },
      },
      "node_modules/@remotion/bundler/node_modules/esbuild": {
        version: "0.28.1",
      },
      "node_modules/@rspack/binding-darwin-arm64": {
        version: "1",
        os: ["darwin"],
        cpu: ["arm64"],
      },
      "node_modules/@rspack/binding-linux-x64-gnu": {
        version: "1",
        os: ["linux"],
        cpu: ["x64"],
      },
      "node_modules/react": { version: "19.2.3" },
    },
  } as const;
  assert.deepEqual(
    resolveDesktopRuntimeModuleLocations(lock, ["@remotion/bundler"]),
    [
      "node_modules/@remotion/bundler",
      "node_modules/@remotion/bundler/node_modules/esbuild",
      "node_modules/@rspack/binding-darwin-arm64",
      "node_modules/react",
    ],
  );
});

test("Runtime Pack Remotion identities exactly match copied module roots", async () => {
  const lock = JSON.parse(await readFile("package-lock.json", "utf8")) as {
    packages: Record<
      string,
      {
        version?: string;
        dependencies?: Record<string, string>;
        optionalDependencies?: Record<string, string>;
      }
    >;
  };
  const closure = await collectDesktopProductionModuleClosure({
    platform: process.platform,
    architecture: process.arch,
    libc: process.platform === "linux" ? "glibc" : undefined,
  });
  const copiedRoots = [
    ...new Set(
      closure.files.flatMap(({ relativePath }) => {
        const match =
          /^node_modules\/(remotion|@remotion\/[^/]+)\//u.exec(relativePath);
        return match?.[1] === undefined ? [] : [match[1]];
      }),
    ),
  ].sort();
  assert.deepEqual(
    closure.remotionPackages.map(({ name }) => name),
    copiedRoots,
  );
  assert.deepEqual(
    closure.moduleNames,
    resolveDesktopRuntimeModuleNames(lock, DESKTOP_RENDER_SOURCE_PACKAGES, {
      platform: process.platform,
      architecture: process.arch,
      libc: process.platform === "linux" ? "glibc" : undefined,
    }),
  );
  for (const unsupported of DESKTOP_FORBIDDEN_RUNTIME_PACKAGES) {
    assert.equal(closure.moduleNames.includes(unsupported), false, unsupported);
    assert.throws(
      () => resolveDesktopRuntimeModuleNames(lock, [unsupported]),
      /forbidden tooling/u,
    );
  }
});
