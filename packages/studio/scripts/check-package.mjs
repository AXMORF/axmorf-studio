import assert from "node:assert/strict";
import { lstat, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  await readFile(resolve(packageRoot, "package.json"), "utf8"),
);

const allowedFiles = new Set([
  "dist",
  "README.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
]);
const releaseDocuments = ["README.md", "LICENSE", "THIRD_PARTY_NOTICES.md"];
const sharedResourcePaths = [
  "dist/assets/workspace-seed/public/assets/axmorf-shared/audio/music/mixkit-deep-urban-623-outro-8s.mp3",
  "dist/assets/workspace-seed/public/assets/axmorf-shared/audio/sound-effects/mixkit-movie-trailer-epic-impact-2908-intro-2s.wav",
  "dist/assets/workspace-seed/public/assets/axmorf-shared/brand/axmorf-mark.svg",
  "dist/assets/workspace-seed/src/remotion/catalog/assets.manifest.json",
  "dist/assets/workspace-seed/src/remotion/catalog/scene-template-audio.defaults.json",
];

assert.equal(manifest.name, "@axmorf/studio");
assert.equal(manifest.type, "module");
assert.equal(manifest.private, undefined);
assert.equal(manifest.license, "Apache-2.0");
assert.deepEqual(manifest.publishConfig, { access: "public" });
assert.equal(manifest.bundleDependencies, undefined);
assert.equal(manifest.bundledDependencies, undefined);
assert.deepEqual(new Set(manifest.files), allowedFiles);
assert.equal(manifest.bin["axmorf"], "dist/cli/main.js");
assert.notEqual(
  (await stat(resolve(packageRoot, "dist/cli/main.js"))).mode & 0o111,
  0,
  "Runtime CLI must be executable.",
);

for (const target of Object.values(manifest.exports).flatMap((entry) =>
  Object.values(entry),
)) {
  assert.match(target, /^\.\/dist\//u);
  assert.doesNotMatch(
    target,
    /(?:private|projects|desktop|settings|tests|proofs)/iu,
  );
}

const missingReleaseDocuments = [];
for (const document of releaseDocuments) {
  try {
    const metadata = await lstat(resolve(packageRoot, document));
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      missingReleaseDocuments.push(document);
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      missingReleaseDocuments.push(document);
      continue;
    }
    throw error;
  }
}

assert.equal(
  await readFile(resolve(packageRoot, "LICENSE"), "utf8"),
  await readFile(resolve(packageRoot, "..", "..", "LICENSE"), "utf8"),
  "The packed runtime license must match the repository Apache-2.0 license.",
);

assert.deepEqual(missingReleaseDocuments, []);

for (const relativePath of sharedResourcePaths) {
  const metadata = await lstat(resolve(packageRoot, relativePath));
  assert.equal(metadata.isFile(), true, `${relativePath} must be a file.`);
  assert.equal(
    metadata.isSymbolicLink(),
    false,
    `${relativePath} cannot be a symbolic link.`,
  );
}
const sharedManifest = JSON.parse(
  await readFile(
    resolve(
      packageRoot,
      "dist/assets/workspace-seed/src/remotion/catalog/assets.manifest.json",
    ),
    "utf8",
  ),
);
assert.deepEqual(
  sharedManifest.assets.map(({ id }) => id),
  [
    "asset.axmorf-mark",
    "asset.mixkit.movie-trailer-epic-impact-2908-intro-2s",
    "asset.mixkit.deep-urban-623-outro-8s",
  ],
);
const packagedIntroAudio = sharedManifest.assets.find(
  ({ id }) => id === "asset.mixkit.movie-trailer-epic-impact-2908-intro-2s",
);
const packagedOutroAudio = sharedManifest.assets.find(
  ({ id }) => id === "asset.mixkit.deep-urban-623-outro-8s",
);
assert.equal(
  packagedIntroAudio.checksum,
  "sha256:c89277f6b273010a88d5cd59d189a6b7097134d8c4e4e7ffda29b6e216cfa797",
);
assert.equal(
  packagedIntroAudio.license.id,
  "Mixkit Sound Effects Free License",
);
assert.equal(
  packagedOutroAudio.checksum,
  "sha256:fefb0356c74c565377ec02a68e31d70f670595dab9a6a0969e3d6b8090c5d434",
);
assert.equal(packagedOutroAudio.license.id, "Mixkit Stock Music Free License");
const audioDefaults = JSON.parse(
  await readFile(
    resolve(
      packageRoot,
      "dist/assets/workspace-seed/src/remotion/catalog/scene-template-audio.defaults.json",
    ),
    "utf8",
  ),
);
assert.equal(
  audioDefaults.intro.source.id,
  "asset.mixkit.movie-trailer-epic-impact-2908-intro-2s",
);
assert.equal(
  audioDefaults.outro.source.id,
  "asset.mixkit.deep-urban-623-outro-8s",
);
assert.equal(audioDefaults.outro.targetMediaRole, "background-music");
const runtimePolicy = JSON.parse(
  await readFile(
    resolve(packageRoot, "dist/assets/policy/runtime-policy.json"),
    "utf8",
  ),
);
const policyPaths = new Set(
  runtimePolicy.files.map(({ logicalPath }) => logicalPath),
);
for (const relativePath of sharedResourcePaths) {
  assert.equal(
    policyPaths.has(relativePath.replace(/^dist\/assets\//u, "assets/")),
    true,
    `${relativePath} must be covered by runtime policy.`,
  );
}

process.stdout.write(
  `${JSON.stringify({
    status: "package-local-ready",
    publicRelease: "ready",
    reasons: [],
  })}\n`,
);
