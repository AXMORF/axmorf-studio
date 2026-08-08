import {
  computeProductionStageEventFingerprint,
  createProductionError,
  PRODUCTION_EVENT_CONTRACT_VERSION,
  ProductionErrorSchema,
  ProductionStageEventInputSchema,
  ProductionStageEventSchema,
} from "../../../src/contracts";

export const createProductionStageEvent = (rawInput: unknown) => {
  const inputRecord: Record<string, unknown> = {
    ...(rawInput as Record<string, unknown>),
    schemaVersion: 1,
    eventVersion: PRODUCTION_EVENT_CONTRACT_VERSION,
  };
  delete inputRecord.eventFingerprint;
  if (inputRecord.type === "stage-failed") {
    const parsed = ProductionErrorSchema.safeParse(inputRecord.error);
    inputRecord.error = parsed.success
      ? parsed.data
      : createProductionError(inputRecord.error);
  }
  const input = ProductionStageEventInputSchema.parse(inputRecord);
  return ProductionStageEventSchema.parse({
    ...input,
    eventFingerprint: computeProductionStageEventFingerprint(input),
  });
};
