import { pathToFileURL } from "node:url";

import {
  DeliveryBuildIdSchema,
  ProductionRevisionIdSchema,
  ProjectRevisionCandidateIdSchema,
  StoryIdSchema,
} from "@axmorf/studio/contracts";
import { promoteProjectRevisionCandidate } from "./application/project-revision-promotion";
import type { RuntimePolicyManifest } from "../../packages/studio/src/runtime/policy-manifest";

const usage =
  "Expected --project <storyId> --candidate <candidateId> --revision <revisionId> --delivery <deliveryBuildId>.";

export const parseProjectRevisionPromotionArguments = (
  args: readonly string[],
) => {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (
      flag === undefined ||
      value === undefined ||
      value.startsWith("--") ||
      !["--project", "--candidate", "--revision", "--delivery"].includes(
        flag,
      ) ||
      values.has(flag)
    ) {
      throw new Error(usage);
    }
    values.set(flag, value);
  }
  if (values.size !== 4) throw new Error(usage);
  return {
    storyId: StoryIdSchema.parse(values.get("--project")),
    candidateId: ProjectRevisionCandidateIdSchema.parse(
      values.get("--candidate"),
    ),
    expectedRevisionId: ProductionRevisionIdSchema.parse(
      values.get("--revision"),
    ),
    expectedDeliveryBuildId: DeliveryBuildIdSchema.parse(
      values.get("--delivery"),
    ),
  } as const;
};

export const runProjectRevisionPromotionCli = async ({
  args,
  rootDir,
  runtimePolicyManifest,
  stdout = (value: string) => process.stdout.write(value),
}: {
  readonly args: readonly string[];
  readonly rootDir: string;
  readonly runtimePolicyManifest?: RuntimePolicyManifest;
  readonly stdout?: (value: string) => void;
}) => {
  const input = parseProjectRevisionPromotionArguments(args);
  const result = await promoteProjectRevisionCandidate({
    rootDir,
    ...input,
    runtimePolicyManifest,
  });
  stdout(`${JSON.stringify(result)}\n`);
  return result;
};

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runProjectRevisionPromotionCli({
    args: process.argv.slice(2),
    rootDir: process.cwd(),
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
