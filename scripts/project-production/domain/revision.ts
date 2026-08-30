import {
  buildProductionRevision,
  type ProductionRevision,
} from "@axmorf/studio/contracts";

export const createProductionRevision = (input: unknown): ProductionRevision =>
  buildProductionRevision(input);
