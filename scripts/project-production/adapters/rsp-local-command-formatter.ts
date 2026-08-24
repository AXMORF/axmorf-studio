import type { ProductionCommandFormatter } from "../domain/production-command-formatter";

export const rspLocalProductionCommandFormatter: ProductionCommandFormatter =
  Object.freeze({
    finalizeTask: ({ taskRevision }) =>
      `./.rsp/bin/rsp task finalize --task ${taskRevision}`,
    checkTask: ({ taskRevision }) =>
      `./.rsp/bin/rsp task check --task ${taskRevision}`,
    commitTask: ({ taskRevision, attemptId }) =>
      `./.rsp/bin/rsp task commit --task ${taskRevision} --attempt ${attemptId}`,
    failTask: ({ taskRevision, attemptId, kind }) =>
      `./.rsp/bin/rsp task fail --task ${taskRevision} --attempt ${attemptId} --kind ${kind}`,
    continueProduction: ({
      projectId,
      revisionId,
      attemptId,
      deliveryPolicy,
    }) =>
      `./.rsp/bin/rsp continue --project ${projectId} --revision ${revisionId} --attempt ${attemptId} --delivery-policy ${deliveryPolicy}`,
  });
