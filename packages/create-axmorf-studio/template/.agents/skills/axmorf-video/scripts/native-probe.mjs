#!/usr/bin/env node
import { randomBytes, createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import process from "node:process";
import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

const VERSION = 1;
const SIZE = 65;
const fail = (message) => {
  throw new Error(`native-probe: ${message}`);
};
const digest = (bytes) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const quote = (value) => `'${value.replaceAll("'", "'\"'\"'")}'`;
const output = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);
const args = process.argv.slice(2);

function exactArgs(expected) {
  if (
    args.length !== expected.length ||
    args.some((value, index) => value !== expected[index])
  )
    fail(`usage is ${expected.join(" ")}`);
}

async function regular(path, label) {
  let stat;
  try {
    stat = await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") fail(`${label} is missing: ${path}`);
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink())
    fail(`${label} must be a regular file: ${path}`);
  return stat;
}

async function directProbe(directory) {
  const cwd = await realpath(process.cwd());
  if (!isAbsolute(directory))
    fail(`probe directory must be absolute: ${directory}`);
  const candidate = resolve(directory);
  if (!basename(candidate).startsWith(".axmorf-worker-probe-"))
    fail("probe directory has an invalid canonical prefix");
  const stat = await lstat(candidate);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    fail(`probe directory must be a real directory: ${candidate}`);
  if (
    (await realpath(candidate)) !== candidate ||
    (await realpath(dirname(candidate))) !== cwd
  )
    fail("probe directory is not the exact direct child of cwd");
  return candidate;
}

async function readManifest(directory) {
  await regular(join(directory, "manifest.json"), "manifest");
  const manifestText = await readFile(join(directory, "manifest.json"), "utf8");
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    fail("manifest is not valid JSON");
  }
  if (
    !manifest ||
    Object.keys(manifest).sort().join(",") !== "count,probes,version" ||
    manifest.version !== VERSION ||
    !Number.isInteger(manifest.count) ||
    manifest.count < 1 ||
    manifest.count > 4 ||
    !Array.isArray(manifest.probes) ||
    manifest.probes.length !== manifest.count
  )
    fail("manifest shape or count is invalid");
  const seen = new Set();
  for (const probe of manifest.probes) {
    if (
      !probe ||
      Object.keys(probe).sort().join(",") !==
        "checksum,sizeBytes,slot,source,target" ||
      !Number.isInteger(probe.slot) ||
      probe.slot < 0 ||
      probe.slot >= manifest.count ||
      seen.has(probe.slot) ||
      probe.sizeBytes !== SIZE ||
      typeof probe.checksum !== "string" ||
      !/^sha256:[a-f0-9]{64}$/u.test(probe.checksum)
    )
      fail("manifest probe entry is invalid");
    seen.add(probe.slot);
    const source = join(directory, `challenge-${probe.slot}.txt`);
    const target = join(directory, `response-${probe.slot}.txt`);
    if (probe.source !== source || probe.target !== target)
      fail(`manifest path mismatch for slot ${probe.slot}`);
    if (!isAbsolute(probe.source) || !isAbsolute(probe.target))
      fail("manifest paths must be absolute");
  }
  if (seen.size !== manifest.count) fail("manifest slots are not exact");
  return manifest;
}

async function exactFiles(directory, manifest) {
  const expected = new Set(["manifest.json"]);
  for (const probe of manifest.probes) {
    expected.add(`challenge-${probe.slot}.txt`);
    expected.add(`response-${probe.slot}.txt`);
  }
  const actual = await readdir(directory);
  const missing = [...expected].filter((name) => !actual.includes(name));
  const unknown = actual.filter((name) => !expected.has(name));
  if (missing.length || unknown.length)
    fail(
      `probe file set mismatch; check original worker output paths (no filesystem-isolation inference): missing=${missing.map((name) => join(directory, name)).join("|") || "none"}; unknown=${unknown.map((name) => join(directory, name)).join("|") || "none"}`,
    );
  for (const name of expected) await regular(join(directory, name), name);
}

async function create(count) {
  const root = await realpath(process.cwd());
  const directory = await mkdtemp(join(root, ".axmorf-worker-probe-"));
  await chmod(directory, 0o700);
  const probes = [];
  try {
    for (let slot = 0; slot < count; slot += 1) {
      const source = join(directory, `challenge-${slot}.txt`);
      const target = join(directory, `response-${slot}.txt`);
      const bytes = Buffer.from(`${randomBytes(32).toString("hex")}\n`, "utf8");
      await writeFile(source, bytes, { flag: "wx", mode: 0o600 });
      probes.push({
        slot,
        source,
        target,
        sizeBytes: SIZE,
        checksum: digest(bytes),
        workerPrompt: `Temporary capability probe only; no provider calls and no production work. Read only ${JSON.stringify(source)} and write those unchanged bytes to the exact target ${JSON.stringify(target)}. You may create exactly that target file; do not create or modify any other file, do not access other slots, do not spawn workers, and return after the write.`,
      });
    }
    await writeFile(
      join(directory, "manifest.json"),
      JSON.stringify(
        {
          version: VERSION,
          count,
          probes: probes.map(
            ({ slot, source, target, sizeBytes, checksum }) => ({
              slot,
              source,
              target,
              sizeBytes,
              checksum,
            }),
          ),
        },
        null,
        2,
      ) + "\n",
      { flag: "wx", mode: 0o600 },
    );
    output({
      status: "native-probe-created",
      version: VERSION,
      root,
      probeDirectory: directory,
      probes,
      verifyCommand: `node ${quote(process.argv[1])} verify --directory ${quote(directory)}`,
      cleanupCommand: `node ${quote(process.argv[1])} cleanup --directory ${quote(directory)}`,
      instructions:
        "Dispatch every probe as a fresh native child, wait for all native completions, then close/release every probe slot before creating production workers.",
    });
  } catch (error) {
    throw new Error(
      `create failed; probe directory retained for diagnosis at ${directory}: ${error.message}`,
    );
  }
}

async function validate(directoryArg) {
  const directory = await directProbe(directoryArg);
  const manifest = await readManifest(directory);
  await exactFiles(directory, manifest);
  for (const probe of manifest.probes) {
    const source = await readFile(probe.source);
    const response = await readFile(probe.target);
    if (source.length !== SIZE || digest(source) !== probe.checksum)
      fail(`challenge checksum or size drift for slot ${probe.slot}`);
    if (!source.equals(response))
      fail(`response bytes differ for slot ${probe.slot}`);
  }
  return { directory, manifest };
}

async function verify(directoryArg) {
  const { manifest } = await validate(directoryArg);
  output({
    status: "native-probe-io-verified",
    verifiedProbeCount: manifest.count,
    proof: "temporary-file-roundtrip-only",
    nativeCapacityMustComeFromLogs: true,
    probes: manifest.probes.map(({ slot, checksum, sizeBytes }) => ({
      slot,
      checksum,
      sizeBytes,
    })),
  });
}

async function cleanup(directoryArg) {
  const { directory, manifest } = await validate(directoryArg);
  for (const probe of manifest.probes) {
    await unlink(probe.source);
    await unlink(probe.target);
  }
  await unlink(join(directory, "manifest.json"));
  await rmdir(directory);
  output({ status: "native-probe-cleaned", probeDirectory: directory });
}

try {
  if (args[0] === "create") {
    if (args.length !== 3 || args[1] !== "--count" || !/^[1-4]$/u.test(args[2]))
      fail("usage is create --count <1..4>");
    await create(Number(args[2]));
  } else if (args[0] === "verify") {
    exactArgs(["verify", "--directory", args[2]]);
    await verify(args[2]);
  } else if (args[0] === "cleanup") {
    exactArgs(["cleanup", "--directory", args[2]]);
    await cleanup(args[2]);
  } else fail("expected create, verify, or cleanup");
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
