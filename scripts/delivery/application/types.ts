import type { ProcessRunner } from "../../baseline/evidence";
import type { VerifyFinalProject } from "./inputs";

export type DeliveryApplicationDependencies = Readonly<{
  verifyFinalProject?: VerifyFinalProject;
  runProcess?: ProcessRunner;
}>;
