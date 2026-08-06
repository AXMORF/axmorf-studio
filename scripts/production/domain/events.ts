import {
  computeProductionStageEventFingerprint,
  createProductionError,
  PRODUCTION_EVENT_CONTRACT_VERSION,
  PRODUCTION_EVENT_CONTRACT_VERSION_V2,
  ProductionStageEventInputSchema,
  ProductionStageEventSchema,
} from "../../../src/contracts";

export const createProductionStageEvent = (rawInput: unknown) => {
  const requestedSchemaVersion =
    rawInput !== null &&
    typeof rawInput === "object" &&
    !Array.isArray(rawInput) &&
    (rawInput as Record<string, unknown>).schemaVersion === 2
      ? 2
      : 1;
  const inputRecord: Record<string, unknown> = {
    ...(rawInput as Record<string, unknown>),
    schemaVersion: requestedSchemaVersion,
    eventVersion:
      requestedSchemaVersion === 2
        ? PRODUCTION_EVENT_CONTRACT_VERSION_V2
        : PRODUCTION_EVENT_CONTRACT_VERSION,
  };
  delete inputRecord.eventFingerprint;
  if (inputRecord.type === "stage-failed") {
    inputRecord.error = createProductionError(inputRecord.error);
  }
  const input = ProductionStageEventInputSchema.parse(inputRecord);
  return ProductionStageEventSchema.parse({
    ...input,
    eventFingerprint: computeProductionStageEventFingerprint(input),
  });
};
