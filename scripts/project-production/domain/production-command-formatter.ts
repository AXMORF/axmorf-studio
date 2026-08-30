import type { TaskWorkerTransport } from "@axmorf/studio/contracts";

export type BoundTaskCommandInput = Readonly<{
  taskRevision: string;
  attemptId: string;
  bindingId: string;
  projectId?: string;
  candidateId?: string;
}>;

/** Renders the public command surface without leaking host-specific paths. */
export type ProductionCommandFormatter = Readonly<{
  bindTask: (
    input: Omit<BoundTaskCommandInput, "bindingId"> &
      Readonly<{ bindingId: string; transport: TaskWorkerTransport }>,
  ) => string;
  describeTask: (input: BoundTaskCommandInput) => string;
  finalizeTask: (input: BoundTaskCommandInput) => string;
  checkTask: (input: BoundTaskCommandInput) => string;
  commitTask: (input: BoundTaskCommandInput) => string;
  failTask: (
    input: BoundTaskCommandInput &
      Readonly<{ kind: "task" | "host" | "fixed" }>,
  ) => string;
  readTaskFile: (input: BoundTaskCommandInput) => string;
  writeTaskFile: (input: BoundTaskCommandInput) => string;
  continueProduction: (input: {
    readonly projectId: string;
    readonly revisionId: string;
    readonly attemptId: string;
    readonly candidateId?: string;
  }) => string;
}>;
