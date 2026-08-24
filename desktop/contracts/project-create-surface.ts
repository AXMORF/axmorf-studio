import { z } from "zod";

import {
  PROJECT_CREATE_INPUT_VERSION,
  ProjectCreateInputSchema,
} from "../../src/contracts";
import { RSP_PROTOCOL_VERSION } from "./protocol";

export const PROJECT_CREATE_RAW_STDIN_EXAMPLE = ProjectCreateInputSchema.parse({
  schemaVersion: 1,
  contractVersion: PROJECT_CREATE_INPUT_VERSION,
  storyId: "story-example",
  brief: {
    schemaVersion: 1,
    storyId: "story-example",
    title: "Measured audio keeps every frame stable",
    sourceMaterial: "Explain why measured PCM prevents frame drift.",
    sourceReferences: [],
    audience: "Developers",
    targetDurationSeconds: 10,
    deliveryConstraints: ["Keep the explanation concise."],
  },
  story: {
    schemaVersion: 3,
    storyId: "story-example",
    title: "Measured audio keeps every frame stable",
    beats: [
      {
        kind: "narrated-scene",
        meaningId: "opening",
        narrativePurpose: "State the timing principle.",
        ttsChunks: [
          {
            chunkId: "opening-01",
            ttsText: "Measured audio is the timing authority.",
          },
        ],
        explicitPauses: [],
      },
    ],
  },
  visualStyle: {
    styleProfileId: "cinematic-3d",
    artDirection: {
      medium: "cinematic scientific visualization",
      palette: "deep blue and warm highlights",
      lighting: "high contrast orbital light",
      texture: "clean technical surfaces",
      compositionGrammar: "depth stage",
      motionLanguage: "slow spatial reveal",
      typography: "minimal technical editorial",
    },
    continuityRules: ["Keep direction stable."],
    forbiddenTreatments: ["No decorative HUD."],
  },
  resources: { allowedResourceIds: [], allowedSnapshots: [] },
  scenes: [
    {
      meaningId: "opening",
      visualIntent: "Show measured audio becoming a stable timeline.",
      compositionIntent: "Use one centered causal diagram.",
      motionIntent: "Reveal samples before frames.",
      soundIntent: "Narration only.",
      continuityBrief: "Keep the sample axis stable.",
      candidateResourceIds: [],
      allowedSnapshotCards: [],
    },
  ],
  globalVisual: {
    visualIntent: [
      {
        intentId: "background-depth",
        description: "Use a restrained dark depth field.",
        appliesTo: "full-composition",
      },
    ],
  },
  render: {
    compositionId: "StoryExample",
    leadInFrames: 15,
    tailFrames: 12,
    audioChannels: 2,
  },
  publishing: {
    description: "A concise explanation of deterministic audio timing.",
    topics: ["audio", "timing", "frames", "remotion", "pcm", "workflow"],
    collectionId: "default",
    chapters: [{ meaningId: "opening", name: "时序权威" }],
  },
  production: {
    enhancementSelection: {
      storyVisual: "required",
      sound: "allowed",
      globalVisual: "required",
    },
    resourcePolicy: {
      selfAuthoredVisualsAllowed: true,
      unlistedThirdPartyResources: "deny",
    },
    additionalRequirements: [],
  },
});

export const RspFieldIssueSchema = z
  .strictObject({
    path: z.string().min(1).max(512),
    code: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    message: z.string().min(1).max(500),
  })
  .readonly();

export type RspFieldIssue = z.infer<typeof RspFieldIssueSchema>;

const pathText = (path: readonly PropertyKey[]) =>
  path.reduce<string>((result, segment) => {
    if (typeof segment === "number") return `${result}[${segment}]`;
    const value = String(segment);
    return result === "$" ? `$.${value}` : `${result}.${value}`;
  }, "$" as string);

const wrapperFields = [
  "command",
  "input",
  "protocolVersion",
  "requestId",
  "workspaceId",
] as const;

export const projectCreateFieldIssues = ({
  error,
  raw,
}: {
  readonly error: z.ZodError;
  readonly raw: unknown;
}): readonly RspFieldIssue[] => {
  const record =
    raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
  const wrapperIssue =
    record !== null && wrapperFields.some((field) => Object.hasOwn(record, field))
      ? [
          {
            path: "$",
            code: "rsp-project-create-wrapper-forbidden",
            message:
              "stdin must be the raw ProjectCreateInput; command/input/protocol/requestId/workspaceId wrappers are forbidden.",
          } as const,
        ]
      : [];
  const issues = error.issues.slice(0, 50 - wrapperIssue.length).map((issue) => ({
    path: pathText(issue.path),
    code: `rsp-project-create-${issue.code.replaceAll("_", "-")}`,
    message:
      issue.code === "unrecognized_keys"
        ? "Object contains fields forbidden by the strict ProjectCreateInput contract."
        : issue.message,
  }));
  return z.array(RspFieldIssueSchema).max(50).parse([...wrapperIssue, ...issues]);
};

export const RspProjectCreateSchemaResponseSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    contractVersion: z.literal("rsp-project-create-schema-v1"),
    protocolVersion: z.literal(RSP_PROTOCOL_VERSION),
    command: z.literal("project create"),
    stdin: z.literal("raw-project-create-input"),
    forbiddenWrapperFields: z.tuple([
      z.literal("command"),
      z.literal("input"),
      z.literal("protocolVersion"),
      z.literal("requestId"),
      z.literal("workspaceId"),
    ]),
    sceneTemplatesOmission: z.literal("inherit-producer-config-defaults"),
    jsonSchema: z.record(z.string(), z.unknown()),
    example: ProjectCreateInputSchema,
  })
  .readonly();

export type RspProjectCreateSchemaResponse = z.infer<
  typeof RspProjectCreateSchemaResponseSchema
>;

export const buildRspProjectCreateSchemaResponse =
  (): RspProjectCreateSchemaResponse =>
    RspProjectCreateSchemaResponseSchema.parse({
      schemaVersion: 1,
      contractVersion: "rsp-project-create-schema-v1",
      protocolVersion: RSP_PROTOCOL_VERSION,
      command: "project create",
      stdin: "raw-project-create-input",
      forbiddenWrapperFields: wrapperFields,
      sceneTemplatesOmission: "inherit-producer-config-defaults",
      jsonSchema: z.toJSONSchema(ProjectCreateInputSchema),
      example: PROJECT_CREATE_RAW_STDIN_EXAMPLE,
    });
