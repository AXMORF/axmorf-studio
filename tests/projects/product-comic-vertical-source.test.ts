import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const projectId = "product-comic-vertical";
const projectRoot = join(process.cwd(), "src/projects", projectId);
const protectedInputs = [
  "public/voice_profile/my_voice.m4a",
  "public/voice_profile/my_voice_text.txt",
] as const;

const readJson = async (path: string) =>
  JSON.parse(await readFile(join(projectRoot, path), "utf8")) as Record<
    string,
    unknown
  >;

const sha256 = (bytes: Buffer | string) =>
  `sha256:${createHash("sha256")
    .update(typeof bytes === "string" ? bytes : Uint8Array.from(bytes))
    .digest("hex")}`;

test("product source packet binds immutable repo truth and every allowed claim", async () => {
  const [product, claims, assets, receipt] = await Promise.all([
    readJson("sources/product-source.json"),
    readJson("sources/claims.json"),
    readJson("sources/asset-sources.json"),
    readJson("sources/source-receipt.generated.json"),
  ]);
  assert.equal(product.productId, projectId);
  assert.equal(product.productName, "Remotion Story Producer");
  assert.equal(
    product.fixedCta,
    "从一份主题资料开始，按这条可验证生产链完成第一支作品",
  );
  assert.match(String(product.repositoryHead), /^[0-9a-f]{40}$/);
  await execFileAsync("git", ["cat-file", "-e", `${product.repositoryHead}^{commit}`], {
    cwd: process.cwd(),
  });

  const authoritySources = product.authoritySources as readonly {
    path: string;
    checksum: string;
  }[];
  assert.ok(authoritySources.length >= 10);
  for (const source of authoritySources) {
    assert.ok(!source.path.startsWith("/"));
    const { stdout } = await execFileAsync(
      "git",
      ["show", `${product.repositoryHead}:${source.path}`],
      { cwd: process.cwd(), encoding: "buffer", maxBuffer: 10_000_000 },
    );
    assert.equal(sha256(stdout), source.checksum, source.path);
  }

  const allowedClaims = claims.allowedClaims as readonly {
    claimId: string;
    evidencePaths: readonly string[];
    verificationStatus: string;
    allowedParaphrase: string;
    forbiddenExaggerations: readonly string[];
  }[];
  assert.ok(allowedClaims.length >= 8);
  assert.equal(new Set(allowedClaims.map((claim) => claim.claimId)).size, allowedClaims.length);
  for (const claim of allowedClaims) {
    assert.equal(claim.verificationStatus, "verified-current");
    assert.ok(claim.allowedParaphrase.trim().length > 0);
    assert.ok(claim.evidencePaths.length > 0);
    assert.ok(claim.forbiddenExaggerations.length > 0);
    for (const path of claim.evidencePaths) {
      assert.ok(authoritySources.some((source) => source.path === path), `${claim.claimId}:${path}`);
    }
  }

  assert.deepEqual(
    (product.forbiddenClaims as readonly { claimId: string }[]).map(
      ({ claimId }) => claimId,
    ),
    [
      "unimplemented-narrative-check",
      "unfinished-second-theme-proof",
      "m10-release-or-publishing",
      "customers-or-commercial-metrics",
      "logo-brand-website-or-git-remote",
      "unsupported-speed-quality-or-accuracy-outcomes",
    ],
  );
  assert.deepEqual(assets.assets, []);
  assert.equal(assets.runtimeAssetCount, 0);
  assert.equal(assets.unlistedAssetPolicy, "forbidden-until-receipted");

  const receiptFiles = receipt.files as readonly {
    path: string;
    checksum: string;
  }[];
  assert.deepEqual(
    receiptFiles.map(({ path }) => path),
    [
      "sources/product-source.json",
      "sources/claims.json",
      "sources/asset-sources.json",
      "sources/voice-profile.json",
    ],
  );
  for (const file of receiptFiles) {
    assert.equal(
      sha256(await readFile(join(projectRoot, file.path))),
      file.checksum,
      file.path,
    );
  }
  assert.equal(
    receipt.sourcePacketFingerprint,
    sha256(
      JSON.stringify({
        repositoryHead: receipt.repositoryHead,
        files: receiptFiles,
      }),
    ),
  );
});

test("voice authoring identity and staging manifest protect user inputs", async () => {
  const [voice, staging] = await Promise.all([
    readJson("sources/voice-profile.json"),
    readJson("sources/task-2-staging.generated.json"),
  ]);
  assert.equal(voice.profileId, "m9-project-my-voice");
  assert.equal(voice.mode, "high-fidelity-clone");
  assert.equal(voice.tonePolicy, "tone-not-emotion-v1");
  assert.deepEqual(voice.forbiddenProviderFields, [
    "emotion",
    "control",
    "controlInstruction",
  ]);
  const sourceInputs = voice.sourceInputs as readonly {
    path: string;
    checksum: string;
    permission: string;
    committed: boolean;
  }[];
  assert.deepEqual(sourceInputs.map(({ path }) => path), protectedInputs);
  assert.deepEqual(
    sourceInputs.map(({ checksum }) => checksum),
    [
      "sha256:1d35f0a39c79850dabac21383e5883a78efc6a161d2be5dd8d1a926e49bd4b6c",
      "sha256:7b6f08f4100f146c649659d0fe2a88386b978cc9368ea0928e17c50d780a655e",
    ],
  );
  for (const input of sourceInputs) {
    assert.equal(input.permission, "authoring-input-only");
    assert.equal(input.committed, false);
    assert.equal(sha256(await readFile(join(process.cwd(), input.path))), input.checksum);
  }
  const serialized = JSON.stringify(voice);
  assert.doesNotMatch(serialized, /(?:^|")\/(?:home|data|tmp|srv)\//);
  assert.doesNotMatch(serialized, /baseUrl|endpoint|token/i);

  const commitPaths = staging.commitPaths as readonly string[];
  assert.ok(commitPaths.length >= 13);
  for (const path of protectedInputs) assert.ok(!commitPaths.includes(path));
  assert.deepEqual(staging.productAssets, []);
});
