import { createProductionError } from "../../../src/contracts";
import { redactProductionErrorDescription } from "../adapters/error-redaction";

type ErrorContext = Readonly<{
  stageId: unknown;
  scope: unknown;
  meaningId: unknown;
  commandId: unknown;
  inputFingerprint: unknown;
}>;

export const createExpectedProductionError = (
  rawInput: ErrorContext &
    Readonly<{
      code: unknown;
      summary: unknown;
      description: unknown;
      retryable: unknown;
      remediation: unknown;
      redactionApplied?: unknown;
    }>,
) =>
  createProductionError({
    ...rawInput,
    kind: "expected",
    redactionApplied: rawInput.redactionApplied ?? false,
  });

export const createUnexpectedProductionError = ({
  error,
  summary,
  ...context
}: ErrorContext &
  Readonly<{
    error: unknown;
    summary: unknown;
  }>) => {
  const fallback = "The production command failed without a safe diagnostic.";
  const redacted = redactProductionErrorDescription({ error, fallback });
  return createProductionError({
    ...context,
    kind: "unexpected",
    code: "UNEXPECTED",
    summary,
    description: redacted.description,
    retryable: false,
    remediation:
      "Inspect the sanitized failure and correct the current stage input before retrying.",
    redactionApplied: redacted.redactionApplied,
  });
};
