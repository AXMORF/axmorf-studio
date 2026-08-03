import {
  FinalAssemblyPlanInputSchema,
  createFinalAssemblyPlan,
} from "../../src/contracts/final-assembly";

export const buildFinalAssembly = (rawPlanInput: unknown) =>
  createFinalAssemblyPlan(FinalAssemblyPlanInputSchema.parse(rawPlanInput));
