import {
  TaskOutputFailureSchema,
  type TaskOutputFailure,
} from "@axmorf/studio/contracts";

/** Only explicit authored-output checks may grant this failure ownership. */
export class TaskOutputValidationError extends Error {
  readonly name = "TaskOutputValidationError";
  readonly code = "task-output-invalid";
  readonly diagnostic: TaskOutputFailure;

  constructor(
    message: string,
    failure: Omit<TaskOutputFailure, "failureOwner">,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.diagnostic = TaskOutputFailureSchema.parse({
      failureOwner: "agent-output",
      ...failure,
    });
  }
}
