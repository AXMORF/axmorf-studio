import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";

export const readCoverRegularFile = async ({ rootDir, relativePath }: { readonly rootDir: string; readonly relativePath: string }) => {
  if (!relativePath || isAbsolute(relativePath) || relativePath.includes("\\") || relativePath.split("/").some((part) => part === "" || part === "." || part === "..")) throw new Error("Cover path is unsafe.");
  const root = await realpath(rootDir);
  const absolutePath = join(rootDir, relativePath);
  const metadata = await lstat(absolutePath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error("Cover source must be a regular file.");
  const resolved = await realpath(absolutePath);
  const inside = relative(root, resolved);
  if (!inside || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) throw new Error("Cover source escapes the repository.");
  return { bytes: Uint8Array.from(await readFile(resolved)), relativePath, absolutePath: resolved } as const;
};
