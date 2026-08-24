import type { DeliveryPolicy } from "../../../src/contracts";

/** Port for rendering host-specific commands into immutable task prompts. */
export type ProductionCommandFormatter = Readonly<{
  finalizeTask: (input: { readonly taskRevision: string }) => string;
  checkTask: (input: { readonly taskRevision: string }) => string;
  commitTask: (input: {
    readonly taskRevision: string;
    readonly attemptId: string;
  }) => string;
  failTask: (input: {
    readonly taskRevision: string;
    readonly attemptId: string;
    readonly kind: "task" | "host";
  }) => string;
  continueProduction: (input: {
    readonly projectId: string;
    readonly revisionId: string;
    readonly attemptId: string;
    readonly deliveryPolicy: DeliveryPolicy;
  }) => string;
}>;
