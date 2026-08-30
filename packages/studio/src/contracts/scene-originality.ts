import ts from "typescript";
import { z } from "zod";

import { FINGERPRINT_ALGORITHM_ID, createFingerprint } from "./fingerprint";
import {
  MeaningIdSchema,
  NonNegativeIntegerSchema,
  Sha256DigestSchema,
  StoryIdSchema,
} from "./primitives";

export const SCENE_SOURCE_TOKEN_ALGORITHM_ID =
  "typescript-5.9.3-syntax-token-v1" as const;
export const SCENE_SOURCE_GRAPH_VERSION = "scene-source-graph-v1" as const;
export const SCENE_ORIGINALITY_BASELINE_VERSION =
  "scene-originality-baseline-v1" as const;
export const SCENE_ORIGINALITY_INPUT_ID = "originality-baseline" as const;

const TOKEN_ALGORITHM_VERSION = 1 as const;
const SOURCE_GRAPH_SCHEMA_VERSION = 1 as const;
const ORIGINALITY_BASELINE_SCHEMA_VERSION = 1 as const;

const SceneSourcePathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !value.split("/").includes("") &&
      !value.split("/").includes(".") &&
      !value.split("/").includes("..") &&
      /\.[cm]?tsx?$/u.test(value),
    "Scene source paths must be relative TS or TSX paths.",
  );

const SceneSourceFileIdentitySchema = z
  .object({
    path: SceneSourcePathSchema,
    tokenCount: NonNegativeIntegerSchema,
    tokenFingerprint: Sha256DigestSchema,
  })
  .strict()
  .readonly();

const assertSortedUnique = (
  values: readonly string[],
  context: z.RefinementCtx,
  path: string,
) => {
  const sorted = [...values].sort((left, right) => left.localeCompare(right));
  if (
    new Set(values).size !== values.length ||
    values.some((value, index) => value !== sorted[index])
  ) {
    context.addIssue({
      code: "custom",
      message: `${path} must be sorted and unique.`,
      path: [path],
    });
  }
};

const SceneSourceGraphIdentityShape = {
  schemaVersion: z.literal(SOURCE_GRAPH_SCHEMA_VERSION),
  contractVersion: z.literal(SCENE_SOURCE_GRAPH_VERSION),
  fingerprintAlgorithm: z.literal(FINGERPRINT_ALGORITHM_ID),
  tokenAlgorithm: z.literal(SCENE_SOURCE_TOKEN_ALGORITHM_ID),
  files: z.array(SceneSourceFileIdentitySchema).min(1).readonly(),
} as const;

const validateSceneSourceGraphOrdering = (
  graph: { readonly files: readonly { readonly path: string }[] },
  context: z.RefinementCtx,
) => {
  assertSortedUnique(
    graph.files.map(({ path }) => path),
    context,
    "files",
  );
};

const SceneSourceGraphIdentitySchema = z
  .object(SceneSourceGraphIdentityShape)
  .strict()
  .superRefine(validateSceneSourceGraphOrdering)
  .readonly();

const computeSceneSourceGraphFingerprint = (
  identity: z.infer<typeof SceneSourceGraphIdentitySchema>,
) =>
  createFingerprint({
    namespace: "scene-source-graph",
    version: SOURCE_GRAPH_SCHEMA_VERSION,
    value: identity,
  });

export const SceneSourceGraphSchema = z
  .object({
    ...SceneSourceGraphIdentityShape,
    sourceGraphFingerprint: Sha256DigestSchema,
  })
  .strict()
  .superRefine((graph, context) => {
    validateSceneSourceGraphOrdering(graph, context);
    const { sourceGraphFingerprint, ...identity } = graph;
    const parsedIdentity = SceneSourceGraphIdentitySchema.safeParse(identity);
    if (
      parsedIdentity.success &&
      sourceGraphFingerprint !==
        computeSceneSourceGraphFingerprint(parsedIdentity.data)
    ) {
      context.addIssue({
        code: "custom",
        message: "Scene source graph fingerprint is stale.",
        path: ["sourceGraphFingerprint"],
      });
    }
  })
  .readonly();

export const SceneOriginalityOwnerSchema = z
  .object({
    storyId: StoryIdSchema,
    meaningId: MeaningIdSchema,
  })
  .strict()
  .readonly();

export const SceneOriginalityBaselineEntrySchema = z
  .object({
    owner: SceneOriginalityOwnerSchema,
    sourceGraphFingerprint: Sha256DigestSchema,
  })
  .strict()
  .readonly();

const ownerKey = ({
  storyId,
  meaningId,
}: z.infer<typeof SceneOriginalityOwnerSchema>) =>
  `${storyId}\u0000${meaningId}`;

const SceneOriginalityBaselineIdentityShape = {
  schemaVersion: z.literal(ORIGINALITY_BASELINE_SCHEMA_VERSION),
  contractVersion: z.literal(SCENE_ORIGINALITY_BASELINE_VERSION),
  fingerprintAlgorithm: z.literal(FINGERPRINT_ALGORITHM_ID),
  sourceGraphVersion: z.literal(SCENE_SOURCE_GRAPH_VERSION),
  tokenAlgorithm: z.literal(SCENE_SOURCE_TOKEN_ALGORITHM_ID),
  subjectStoryId: StoryIdSchema,
  entries: z.array(SceneOriginalityBaselineEntrySchema).readonly(),
} as const;

const validateSceneOriginalityBaselineOrdering = (
  baseline: {
    readonly entries: readonly z.infer<
      typeof SceneOriginalityBaselineEntrySchema
    >[];
  },
  context: z.RefinementCtx,
) => {
  assertSortedUnique(
    baseline.entries.map(({ owner }) => ownerKey(owner)),
    context,
    "entries",
  );
};

const SceneOriginalityBaselineIdentitySchema = z
  .object(SceneOriginalityBaselineIdentityShape)
  .strict()
  .superRefine(validateSceneOriginalityBaselineOrdering)
  .readonly();

const computeSceneOriginalityBaselineFingerprint = (
  identity: z.infer<typeof SceneOriginalityBaselineIdentitySchema>,
) =>
  createFingerprint({
    namespace: "scene-originality-baseline",
    version: ORIGINALITY_BASELINE_SCHEMA_VERSION,
    value: identity,
  });

export const SceneOriginalityBaselineSchema = z
  .object({
    ...SceneOriginalityBaselineIdentityShape,
    baselineFingerprint: Sha256DigestSchema,
  })
  .strict()
  .superRefine((baseline, context) => {
    validateSceneOriginalityBaselineOrdering(baseline, context);
    const { baselineFingerprint, ...identity } = baseline;
    const parsedIdentity =
      SceneOriginalityBaselineIdentitySchema.safeParse(identity);
    if (
      parsedIdentity.success &&
      baselineFingerprint !==
        computeSceneOriginalityBaselineFingerprint(parsedIdentity.data)
    ) {
      context.addIssue({
        code: "custom",
        message: "Scene originality baseline fingerprint is stale.",
        path: ["baselineFingerprint"],
      });
    }
  })
  .readonly();

type SourceToken = Readonly<{ kind: number; text: string }>;

const collectSyntaxTokens = ({
  path,
  source,
}: {
  readonly path: string;
  readonly source: string;
}): readonly SourceToken[] => {
  if (ts.version !== "5.9.3") {
    throw new Error(
      `Scene source tokenization requires TypeScript 5.9.3, received ${ts.version}.`,
    );
  }
  const sourceFile = ts.createSourceFile(
    path,
    source.replace(/^\uFEFF/u, ""),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const parseDiagnostics = (
    sourceFile as ts.SourceFile & {
      readonly parseDiagnostics?: readonly ts.Diagnostic[];
    }
  ).parseDiagnostics;
  if (parseDiagnostics !== undefined && parseDiagnostics.length > 0) {
    const first = parseDiagnostics[0];
    throw new Error(
      `Scene source must be syntactically valid: ${ts.flattenDiagnosticMessageText(first.messageText, " ")}`,
    );
  }

  const tokens: SourceToken[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxExpression(node) && node.expression === undefined) {
      return;
    }
    const children = node.getChildren(sourceFile);
    if (children.length === 0) {
      if (
        node.kind !== ts.SyntaxKind.EndOfFileToken &&
        node.kind < ts.SyntaxKind.FirstNode
      ) {
        const text = node.getText(sourceFile);
        if (text !== "") tokens.push({ kind: node.kind, text });
      }
      return;
    }
    for (const child of children) visit(child);
  };
  visit(sourceFile);
  return tokens;
};

const buildSceneSourceFileIdentity = ({
  path: rawPath,
  source,
}: {
  readonly path: string;
  readonly source: string;
}) => {
  const path = SceneSourcePathSchema.parse(rawPath);
  const tokens = collectSyntaxTokens({ path, source });
  return SceneSourceFileIdentitySchema.parse({
    path,
    tokenCount: tokens.length,
    tokenFingerprint: createFingerprint({
      namespace: "scene-source-token-stream",
      version: TOKEN_ALGORITHM_VERSION,
      value: {
        tokenAlgorithm: SCENE_SOURCE_TOKEN_ALGORITHM_ID,
        tokens,
      },
    }),
  });
};

export const buildSceneSourceGraph = (
  rawFiles: readonly Readonly<{ path: string; source: string }>[],
) => {
  const files = rawFiles
    .map(buildSceneSourceFileIdentity)
    .sort((left, right) => left.path.localeCompare(right.path));
  const identity = SceneSourceGraphIdentitySchema.parse({
    schemaVersion: SOURCE_GRAPH_SCHEMA_VERSION,
    contractVersion: SCENE_SOURCE_GRAPH_VERSION,
    fingerprintAlgorithm: FINGERPRINT_ALGORITHM_ID,
    tokenAlgorithm: SCENE_SOURCE_TOKEN_ALGORITHM_ID,
    files,
  });
  return SceneSourceGraphSchema.parse({
    ...identity,
    sourceGraphFingerprint: computeSceneSourceGraphFingerprint(identity),
  });
};

export const buildSceneOriginalityBaseline = (rawInput: unknown) => {
  const input = rawInput as Record<string, unknown>;
  const entries = [...((input.entries ?? []) as readonly unknown[])]
    .map((entry) => SceneOriginalityBaselineEntrySchema.parse(entry))
    .sort((left, right) =>
      ownerKey(left.owner).localeCompare(ownerKey(right.owner)),
    );
  const identity = SceneOriginalityBaselineIdentitySchema.parse({
    schemaVersion: ORIGINALITY_BASELINE_SCHEMA_VERSION,
    contractVersion: SCENE_ORIGINALITY_BASELINE_VERSION,
    fingerprintAlgorithm: FINGERPRINT_ALGORITHM_ID,
    sourceGraphVersion: SCENE_SOURCE_GRAPH_VERSION,
    tokenAlgorithm: SCENE_SOURCE_TOKEN_ALGORITHM_ID,
    subjectStoryId: input.subjectStoryId,
    entries,
  });
  return SceneOriginalityBaselineSchema.parse({
    ...identity,
    baselineFingerprint: computeSceneOriginalityBaselineFingerprint(identity),
  });
};

export const findSceneOriginalityConflicts = ({
  baseline: rawBaseline,
  candidate: rawCandidate,
}: {
  readonly baseline: unknown;
  readonly candidate: unknown;
}) => {
  const baseline = SceneOriginalityBaselineSchema.parse(rawBaseline);
  const candidate = SceneOriginalityBaselineEntrySchema.parse(rawCandidate);
  if (candidate.owner.storyId !== baseline.subjectStoryId) {
    throw new Error("Scene originality candidate belongs to another Story.");
  }
  const candidateOwnerKey = ownerKey(candidate.owner);
  return baseline.entries.filter(
    (entry) =>
      entry.sourceGraphFingerprint === candidate.sourceGraphFingerprint &&
      ownerKey(entry.owner) !== candidateOwnerKey,
  );
};

export type SceneSourceGraph = z.infer<typeof SceneSourceGraphSchema>;
export type SceneOriginalityOwner = z.infer<typeof SceneOriginalityOwnerSchema>;
export type SceneOriginalityBaselineEntry = z.infer<
  typeof SceneOriginalityBaselineEntrySchema
>;
export type SceneOriginalityBaseline = z.infer<
  typeof SceneOriginalityBaselineSchema
>;
