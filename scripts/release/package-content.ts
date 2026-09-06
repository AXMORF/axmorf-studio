import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export const sha256 = (bytes: string | Buffer) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

export const contentHash = (path: string, bytes: Buffer): string => {
  if (!path.endsWith(".map")) return sha256(bytes);
  const map = JSON.parse(bytes.toString("utf8"));
  // Source maps are debug metadata, but remain covered. Only JSON formatting and
  // path separators normalize; no source, mapping, or executable file is omitted.
  for (const field of ["sources", "file", "sourceRoot"]) {
    if (map[field] === undefined) continue;
    const normalize = (value: string) => {
      assert.equal(typeof value, "string", `Invalid source map ${path}`);
      const normalized = value.replaceAll("\\", "/");
      assert.ok(
        !normalized.startsWith("/") && !/^[A-Za-z]:\//u.test(normalized),
        `Absolute build path in source map ${path}: make the build reproducible`,
      );
      return normalized;
    };
    map[field] = Array.isArray(map[field])
      ? map[field].map(normalize)
      : normalize(map[field]);
  }
  return sha256(canonical(map));
};

export type FileDigest = {
  path: string;
  checksum: string;
  executable: boolean;
};
export type PackageContent = {
  name: string;
  version: string;
  fingerprint: string;
  files: FileDigest[];
};

export const fingerprint = (files: readonly FileDigest[]) =>
  sha256(canonical(files));

export async function directoryFiles(root: string): Promise<FileDigest[]> {
  const files: FileDigest[] = [];
  const visit = async (directory: string, prefix: string) => {
    const stat = await lstat(directory);
    assert.ok(
      stat.isDirectory() && !stat.isSymbolicLink(),
      `${directory} must be a real directory`,
    );
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = prefix + entry.name;
      assert.ok(!entry.isSymbolicLink(), `Symlink rejected: ${path}`);
      if (entry.isDirectory())
        await visit(join(directory, entry.name), `${path}/`);
      else {
        const file = join(directory, entry.name);
        const metadata = await lstat(file);
        assert.ok(metadata.isFile(), `Non-file rejected: ${path}`);
        files.push({
          path,
          checksum: contentHash(path, await readFile(file)),
          executable: (metadata.mode & 0o111) !== 0,
        });
      }
    }
  };
  await visit(root, "");
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export async function packageContent(tarball: string): Promise<PackageContent> {
  assert.ok(
    (await lstat(tarball)).isFile(),
    "Candidate must be an npm tarball",
  );
  const options = { encoding: "utf8" as const, maxBuffer: 32 * 1024 * 1024 };
  const members = execFileSync("tar", ["-tzf", tarball], options)
    .trim()
    .split("\n");
  const details = execFileSync("tar", ["-tvzf", tarball], options)
    .trim()
    .split("\n");
  assert.equal(members.length, details.length, "Tar member metadata mismatch");
  const seen = new Set<string>();
  const files: FileDigest[] = [];
  let manifest: { name: string; version: string } | undefined;
  for (let index = 0; index < members.length; index++) {
    const member = members[index]!;
    const mode = details[index]!.split(/\s/u)[0]!;
    assert.ok(
      member.startsWith("package/") &&
        !member.includes("\\") &&
        !member.split("/").includes(".."),
      "Unsafe tar member",
    );
    assert.ok(!seen.has(member), `Duplicate tar member: ${member}`);
    seen.add(member);
    assert.ok(
      mode.startsWith("-") || mode.startsWith("d"),
      `Non-regular tar member: ${member}`,
    );
    if (mode.startsWith("d")) continue;
    const path = member.slice("package/".length);
    assert.ok(path.length > 0, "Empty tar file name");
    const bytes = execFileSync("tar", ["-xOzf", tarball, member], {
      maxBuffer: 32 * 1024 * 1024,
    });
    if (path === "package.json") manifest = JSON.parse(bytes.toString("utf8"));
    files.push({
      path,
      checksum: contentHash(path, bytes),
      executable: /[xst]/u.test(mode.slice(1)),
    });
  }
  assert.ok(manifest && files.length > 0, "Missing package manifest");
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return {
    name: manifest.name,
    version: manifest.version,
    fingerprint: fingerprint(files),
    files,
  };
}
