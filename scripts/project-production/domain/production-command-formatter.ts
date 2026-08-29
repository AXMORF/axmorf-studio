import type { DeliveryPolicy } from "../../../src/contracts";

/** Port for rendering host-specific commands into immutable task prompts. */
export type ProductionCommandFormatter = Readonly<{
  bindTask: (input: {
    readonly taskRevision: string;
    readonly attemptId: string;
    readonly bindingId: string;
    readonly transport: "shared-workspace" | "controller-io";
  }) => string;
  describeTask: (input: BoundTaskCommandInput) => string;
  finalizeTask: (input: BoundTaskCommandInput) => string;
  checkTask: (input: BoundTaskCommandInput) => string;
  commitTask: (input: {
    readonly taskRevision: string;
    readonly attemptId: string;
    readonly bindingId: string;
  }) => string;
  failTask: (input: {
    readonly taskRevision: string;
    readonly attemptId: string;
    readonly bindingId: string;
    readonly kind: "task" | "host" | "fixed";
  }) => string;
  readTaskFile: (input: BoundTaskCommandInput) => string;
  writeTaskFile: (input: BoundTaskCommandInput) => string;
  continueProduction: (input: {
    readonly projectId: string;
    readonly revisionId: string;
    readonly attemptId: string;
    readonly deliveryPolicy: DeliveryPolicy;
  }) => string;
}>;

type BoundTaskCommandInput = Readonly<{
  taskRevision: string;
  attemptId: string;
  bindingId: string;
}>;
