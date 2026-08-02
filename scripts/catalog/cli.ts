import { pathToFileURL } from "node:url";

import { z } from "zod";

import {
  ResourceCatalogSchema,
  serializeCanonicalJson,
} from "../../src/contracts";
import { queryResourceCatalog, type ResourceCatalogQuery } from "./domain";
import {
  generateResourceCatalog,
  type CatalogGenerationMode,
  type CatalogGenerationResult,
} from "./generate";
import { readGeneratedResourceCatalog } from "./project-files";

const QueryKindSchema = z.enum([
  "asset",
  "style-profile",
  "capability",
  "authoring-reference",
]);

export type CatalogCliContext = {
  readonly rootDir: string;
  readonly stdout: (line: string) => void;
  readonly generate?: (
    mode: CatalogGenerationMode,
  ) => Promise<CatalogGenerationResult>;
  readonly readCatalog?: () => Promise<z.infer<typeof ResourceCatalogSchema>>;
};

const defaultContext = (): CatalogCliContext => ({
  rootDir: process.cwd(),
  stdout: (line) => process.stdout.write(`${line}\n`),
});

const parseQuery = (args: readonly string[]): ResourceCatalogQuery => {
  if (args.length < 3 || args[0] !== "query" || args[1] !== "--kind") {
    throw new Error(
      "Expected query --kind <kind> [--tag <tag>] [--text <text>].",
    );
  }
  const kind = QueryKindSchema.parse(args[2]);
  let index = 3;
  let tag: string | null = null;
  let text: string | null = null;
  if (args[index] === "--tag") {
    tag = z
      .string()
      .trim()
      .min(1)
      .max(160)
      .parse(args[index + 1]);
    index += 2;
  }
  if (args[index] === "--text") {
    text = z
      .string()
      .trim()
      .min(1)
      .max(300)
      .parse(args[index + 1]);
    index += 2;
  }
  if (index !== args.length) {
    throw new Error("Unknown or reordered Catalog query arguments.");
  }
  return { kind, tag, text };
};

export const runCatalogCli = async (
  args: readonly string[],
  context: CatalogCliContext = defaultContext(),
) => {
  if (args.length === 1 && (args[0] === "generate" || args[0] === "check")) {
    const mode = args[0] === "generate" ? "write" : "check";
    const result = context.generate
      ? await context.generate(mode)
      : await generateResourceCatalog({ rootDir: context.rootDir, mode });
    context.stdout(
      mode === "write"
        ? `Generated ResourceCatalog with ${result.entryCount} entries.`
        : `ResourceCatalog is current with ${result.entryCount} entries.`,
    );
    return result;
  }
  const query = parseQuery(args);
  const catalog = context.readCatalog
    ? await context.readCatalog()
    : await readGeneratedResourceCatalog(context.rootDir);
  const results = queryResourceCatalog(catalog, query);
  context.stdout(serializeCanonicalJson(results));
  return results;
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCatalogCli(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Catalog failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
