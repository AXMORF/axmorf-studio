import {readFile} from "node:fs/promises";
import {join} from "node:path";

import {
  FinalAssemblyPlanSchema,
  type FinalAssemblyPlan,
} from "../../src/contracts/final-assembly";
import {writeNarrativeAutoCheckAtomic} from "../project-check/report-files";

const sortJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortJsonValue(entry)]),
    );
  }
  return value;
};

export const serializeFinalAssembly = (rawAssembly: unknown) => {
  const assembly = FinalAssemblyPlanSchema.parse(rawAssembly);
  return `${JSON.stringify(sortJsonValue(assembly), null, 2)}\n`;
};

const getDestination = (rootDir: string, storyId: string) =>
  join(
    rootDir,
    "src",
    "projects",
    storyId,
    "generated",
    "final-assembly.generated.json",
  );

export const writeFinalAssemblyIfPassed = async ({
  rootDir,
  assembly: rawAssembly,
}: {
  readonly rootDir: string;
  readonly assembly: unknown;
}) => {
  const assembly = FinalAssemblyPlanSchema.parse(rawAssembly);
  if (assembly.aggregateStatus !== "pass") {
    throw new Error("Only a passing FinalAssembly may be persisted.");
  }
  const destination = getDestination(rootDir, assembly.storyId);
  const bytes = serializeFinalAssembly(assembly);
  try {
    if ((await readFile(destination, "utf8")) === bytes) {
      return {destination, written: false} as const;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await writeNarrativeAutoCheckAtomic(destination, bytes);
  return {destination, written: true} as const;
};

export const checkPersistedFinalAssembly = async ({
  rootDir,
  expectedAssembly: rawExpectedAssembly,
}: {
  readonly rootDir: string;
  readonly expectedAssembly: unknown;
}): Promise<FinalAssemblyPlan> => {
  const expectedAssembly = FinalAssemblyPlanSchema.parse(rawExpectedAssembly);
  const destination = getDestination(rootDir, expectedAssembly.storyId);
  let persistedBytes: string;
  try {
    persistedBytes = await readFile(destination, "utf8");
  } catch {
    throw new Error("Persisted FinalAssembly is missing or unreadable.");
  }
  let rawPersisted: unknown;
  try {
    rawPersisted = JSON.parse(persistedBytes);
  } catch {
    throw new Error("Persisted FinalAssembly contains malformed JSON.");
  }
  const persisted = FinalAssemblyPlanSchema.parse(rawPersisted);
  const expectedBytes = serializeFinalAssembly(expectedAssembly);
  if (
    persistedBytes !== expectedBytes ||
    serializeFinalAssembly(persisted) !== expectedBytes
  ) {
    throw new Error("Persisted FinalAssembly bytes are stale.");
  }
  return persisted;
};
