import { execFile } from "node:child_process";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);

export const isActiveDocumentationPath = (repositoryPath: string) =>
  !repositoryPath.startsWith("docs/archive/");

export type MarkdownLinkCheckOptions = {
  readonly rootDir: string;
  readonly markdownPaths?: readonly string[];
};

export type MarkdownLinkCheckResult = {
  readonly externalLinkCount: number;
  readonly fileCount: number;
  readonly localLinkCount: number;
};

type MarkdownLink = {
  readonly line: number;
  readonly target: string;
};

const isWithin = (rootDir: string, target: string) => {
  const relative = path.relative(rootDir, target);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
};

const withoutCodeFences = (source: string) => {
  let inFence = false;
  return source
    .split(/\r?\n/u)
    .map((line) => {
      if (/^\s*(```|~~~)/u.test(line)) {
        inFence = !inFence;
        return "";
      }
      return inFence ? "" : line;
    })
    .join("\n");
};

const extractMarkdownLinks = (source: string): MarkdownLink[] => {
  const links: MarkdownLink[] = [];
  const visibleSource = withoutCodeFences(source);
  const linkPattern = /!?\[[^\]]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+[^)]*)?\)/gu;
  for (const match of visibleSource.matchAll(linkPattern)) {
    const rawTarget = match[1];
    if (rawTarget === undefined || match.index === undefined) {
      continue;
    }
    links.push({
      line: visibleSource.slice(0, match.index).split("\n").length,
      target:
        rawTarget.startsWith("<") && rawTarget.endsWith(">")
          ? rawTarget.slice(1, -1)
          : rawTarget,
    });
  }
  return links;
};

const githubSlug = (heading: string) =>
  heading
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/<[^>]*>/gu, "")
    .replace(/[`*_~]/gu, "")
    .replace(/[^\p{Letter}\p{Number}\p{Mark}\s_-]/gu, "")
    .trim()
    .replace(/\s+/gu, "-");

const extractHeadingAnchors = (source: string) => {
  const anchors = new Set<string>();
  const occurrences = new Map<string, number>();
  for (const line of withoutCodeFences(source).split(/\r?\n/u)) {
    const heading = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/u.exec(line)?.[1];
    if (heading === undefined) {
      continue;
    }
    const base = githubSlug(heading);
    if (base.length === 0) {
      continue;
    }
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    anchors.add(occurrence === 0 ? base : `${base}-${occurrence}`);
  }
  return anchors;
};

const decodeTarget = (target: string, sourcePath: string, line: number) => {
  try {
    return decodeURI(target);
  } catch {
    throw new Error(
      `${sourcePath}:${line}: invalid encoded link target ${target}`,
    );
  }
};

const trackedMarkdownPaths = async (rootDir: string) => {
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "--cached", "--", "*.md"],
    { cwd: rootDir, encoding: "utf8" },
  );
  const tracked = stdout
    .split(/\r?\n/u)
    .filter((entry) => entry.length > 0)
    .filter(isActiveDocumentationPath)
    .sort();
  const current: string[] = [];
  for (const repositoryPath of tracked) {
    try {
      const metadata = await stat(path.join(rootDir, repositoryPath));
      if (metadata.isFile()) current.push(repositoryPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return current;
};

export const checkMarkdownLinks = async ({
  rootDir,
  markdownPaths,
}: MarkdownLinkCheckOptions): Promise<MarkdownLinkCheckResult> => {
  const absoluteRoot = await realpath(rootDir);
  const paths = [
    ...(markdownPaths ?? (await trackedMarkdownPaths(absoluteRoot))),
  ].sort();
  const sourceCache = new Map<string, string>();
  const anchorCache = new Map<string, ReadonlySet<string>>();
  const failures: string[] = [];
  let externalLinkCount = 0;
  let localLinkCount = 0;

  const readSource = async (absolutePath: string) => {
    const cached = sourceCache.get(absolutePath);
    if (cached !== undefined) {
      return cached;
    }
    const source = await readFile(absolutePath, "utf8");
    sourceCache.set(absolutePath, source);
    return source;
  };

  for (const sourcePath of paths) {
    const absoluteSource = path.resolve(absoluteRoot, sourcePath);
    if (!isWithin(absoluteRoot, absoluteSource)) {
      failures.push(`${sourcePath}: Markdown source escapes repository.`);
      continue;
    }
    const source = await readSource(absoluteSource);
    for (const link of extractMarkdownLinks(source)) {
      const decodedTarget = decodeTarget(link.target, sourcePath, link.line);
      if (/^https?:\/\//iu.test(decodedTarget)) {
        externalLinkCount += 1;
        continue;
      }
      if (/^(?:mailto|tel):/iu.test(decodedTarget)) {
        externalLinkCount += 1;
        continue;
      }
      const scheme = /^[a-z][a-z\d+.-]*:/iu.exec(decodedTarget)?.[0];
      if (scheme !== undefined || decodedTarget.startsWith("//")) {
        failures.push(
          `${sourcePath}:${link.line}: unsupported link scheme ${scheme ?? "//"}`,
        );
        continue;
      }
      const hashIndex = decodedTarget.indexOf("#");
      const targetWithQuery =
        hashIndex === -1 ? decodedTarget : decodedTarget.slice(0, hashIndex);
      const fragment =
        hashIndex === -1 ? "" : decodedTarget.slice(hashIndex + 1);
      const targetPath = targetWithQuery.split("?", 1)[0] ?? "";
      if (path.isAbsolute(targetPath)) {
        failures.push(
          `${sourcePath}:${link.line}: local target must be relative: ${link.target}`,
        );
        continue;
      }
      const absoluteTarget = targetPath
        ? path.resolve(path.dirname(absoluteSource), targetPath)
        : absoluteSource;
      if (!isWithin(absoluteRoot, absoluteTarget)) {
        failures.push(
          `${sourcePath}:${link.line}: local target escapes repository: ${link.target}`,
        );
        continue;
      }
      let realTarget: string;
      try {
        realTarget = await realpath(absoluteTarget);
        await stat(realTarget);
      } catch {
        failures.push(
          `${sourcePath}:${link.line}: missing local target: ${link.target}`,
        );
        continue;
      }
      if (!isWithin(absoluteRoot, realTarget)) {
        failures.push(
          `${sourcePath}:${link.line}: local target escapes repository: ${link.target}`,
        );
        continue;
      }
      localLinkCount += 1;
      if (fragment.length === 0) {
        continue;
      }
      let anchors = anchorCache.get(realTarget);
      if (anchors === undefined) {
        anchors = extractHeadingAnchors(await readSource(realTarget));
        anchorCache.set(realTarget, anchors);
      }
      if (!anchors.has(fragment)) {
        failures.push(
          `${sourcePath}:${link.line}: missing heading anchor #${fragment} in ${link.target}`,
        );
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Markdown link check failed:\n${failures.sort().join("\n")}`,
    );
  }
  return {
    externalLinkCount,
    fileCount: paths.length,
    localLinkCount,
  };
};

export const runDocsLinkCheck = async (rootDir = process.cwd()) => {
  const result = await checkMarkdownLinks({ rootDir });
  process.stdout.write(
    `Markdown links are current across ${result.fileCount} tracked files (${result.localLinkCount} local, ${result.externalLinkCount} external skipped).\n`,
  );
  return result;
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runDocsLinkCheck().catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Markdown link check failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
