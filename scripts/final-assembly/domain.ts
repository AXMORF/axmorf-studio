import {
  FinalAssemblyPlanInputSchema,
  createFinalAssemblyPlan,
} from "@axmorf/studio/contracts";

export const buildFinalAssembly = (rawPlanInput: unknown) =>
  createFinalAssemblyPlan(FinalAssemblyPlanInputSchema.parse(rawPlanInput));
