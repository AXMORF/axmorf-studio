import {
  readLatestExecutionAttempt,
  readProductionDiagnosticBaseline,
} from "../adapters/progress";
import { inspectCurrentDelivery } from "../adapters/current-delivery-inspection";

export const readProjectProductionProgressProjection = async (
  input: Parameters<typeof readLatestExecutionAttempt>[0],
) => {
  const attempt = await readLatestExecutionAttempt(input);
  return attempt === null
    ? { status: "not-produced" as const, revisionId: null, attempt: null }
    : {
        status:
          attempt.state === "waiting-for-agent"
            ? ("needs-agent" as const)
            : attempt.state === "failed"
              ? ("failed" as const)
              : attempt.state === "succeeded"
                ? ("current" as const)
                : ("converging" as const),
        revisionId: attempt.revisionId,
        attempt,
      };
};

export const readProjectProductionDiagnosticBaselineProjection = (
  input: Parameters<typeof readProductionDiagnosticBaseline>[0],
) => readProductionDiagnosticBaseline(input);

export const readCurrentProjectDelivery = (
  input: Parameters<typeof inspectCurrentDelivery>[0],
) => inspectCurrentDelivery(input);
