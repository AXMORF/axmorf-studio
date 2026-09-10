import {
  AuthoringValidationError,
  AuthoringSchemaValidationError,
  formatJsonPath,
  buildAuthoringValidationFailure,
} from "../contracts/authoring-validation";
import { AUTHORING_REQUIREMENT_EXAMPLE } from "../contracts/authoring-requirements";

const errorCode = (error: unknown) => {
  if (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return "command-failed";
};

const isAgentOutputFinalizationFailure = (
  error: unknown,
): error is {
  readonly name: "AgentTaskFinalizationError";
  readonly code: string;
  readonly message: string;
  readonly diagnostic: {
    readonly file: string;
    readonly path: readonly (string | number)[];
    readonly code: string;
    readonly message: string;
    readonly failureOwner: "agent-output";
    readonly repairHint: string;
  };
} => {
  if (error === null || typeof error !== "object") return false;
  const value = error as Record<string, unknown>;
  const diagnostic = value.diagnostic;
  if (
    value.name !== "AgentTaskFinalizationError" ||
    value.code !== "task-output-invalid" ||
    typeof value.message !== "string" ||
    diagnostic === null ||
    typeof diagnostic !== "object"
  )
    return false;
  const entry = diagnostic as Record<string, unknown>;
  return (
    typeof entry.file === "string" &&
    Array.isArray(entry.path) &&
    entry.path.every(
      (part) => typeof part === "string" || typeof part === "number",
    ) &&
    typeof entry.code === "string" &&
    typeof entry.message === "string" &&
    entry.failureOwner === "agent-output" &&
    typeof entry.repairHint === "string"
  );
};

export const describeCliFailure = (error: unknown) => {
  if (isAgentOutputFinalizationFailure(error)) {
    return {
      status: "error",
      code: "task-output-invalid",
      message: error.message,
      diagnostic: error.diagnostic,
    } as const;
  }
  if (error instanceof AuthoringValidationError) {
    return buildAuthoringValidationFailure(error);
  }
  if (error instanceof AuthoringSchemaValidationError) {
    return {
      status: "error",
      code: "schema-validation-failed",
      message:
        "Input does not match the installed contract. Correct the indicated fields and validate again.",
      issues: error.issues.slice(0, 50).map((issue) => ({
        path: formatJsonPath(
          issue.path.map((part) =>
            typeof part === "number" ? part : String(part),
          ),
        ),
        code: issue.code,
        message: issue.message,
        ...(issue.path.includes("additionalRequirements")
          ? {
              ownerAction:
                "Use an array of complete requirement objects, or [] when there are no additional requirements. Adapt the example statement to the user brief; do not discard requested constraints.",
              example: [AUTHORING_REQUIREMENT_EXAMPLE],
            }
          : {}),
      })),
      truncated: error.issues.length > 50,
    } as const;
  }
  return {
    status: "error",
    code: errorCode(error),
    message: error instanceof Error ? error.message : "Command failed.",
  } as const;
};

export const reportCliFailure = (error: unknown) => {
  const failure = describeCliFailure(error);
  return {
    failure,
    serialized: JSON.stringify(failure),
    exitCode: failure.code === "command-failed" ? 1 : 2,
  } as const;
};
