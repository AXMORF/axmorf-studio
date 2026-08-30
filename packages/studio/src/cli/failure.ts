import {
  AuthoringValidationError,
  buildAuthoringValidationFailure,
} from "../contracts/authoring-validation";

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

export const describeCliFailure = (error: unknown) => {
  if (error instanceof AuthoringValidationError) {
    return buildAuthoringValidationFailure(error);
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
