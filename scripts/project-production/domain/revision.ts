import {
  buildProductionRevision,
  type ProductionRevision,
} from "../../../src/contracts";

export const createProductionRevision = (input: unknown): ProductionRevision =>
  buildProductionRevision(input);
