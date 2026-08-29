import type { ProductionCommandFormatter } from "../domain/production-command-formatter";

export const createRspLocalProductionCommandFormatter = (
  candidateId?: string,
): ProductionCommandFormatter =>
  Object.freeze({
    bindTask: ({ taskRevision, attemptId, bindingId, transport }) =>
      `./.rsp/bin/rsp task bind --task ${taskRevision} --attempt ${attemptId} --binding ${bindingId} --transport ${transport}`,
    describeTask: ({ taskRevision, attemptId, bindingId }) =>
      `./.rsp/bin/rsp task describe --task ${taskRevision} --attempt ${attemptId} --binding ${bindingId}`,
    finalizeTask: ({ taskRevision, attemptId, bindingId }) =>
      `./.rsp/bin/rsp task finalize --task ${taskRevision} --attempt ${attemptId} --binding ${bindingId}`,
    checkTask: ({ taskRevision, attemptId, bindingId }) =>
      `./.rsp/bin/rsp task check --task ${taskRevision} --attempt ${attemptId} --binding ${bindingId}`,
    commitTask: ({ taskRevision, attemptId, bindingId }) =>
      `./.rsp/bin/rsp task commit --task ${taskRevision} --attempt ${attemptId} --binding ${bindingId}`,
    failTask: ({ taskRevision, attemptId, bindingId, kind }) =>
      `./.rsp/bin/rsp task fail --task ${taskRevision} --attempt ${attemptId} --binding ${bindingId} --kind ${kind}`,
    readTaskFile: ({ taskRevision, attemptId, bindingId }) =>
      `./.rsp/bin/rsp task file-read --task ${taskRevision} --attempt ${attemptId} --binding ${bindingId} --path <logicalPath>`,
    writeTaskFile: ({ taskRevision, attemptId, bindingId }) =>
      `./.rsp/bin/rsp task file-write --task ${taskRevision} --attempt ${attemptId} --binding ${bindingId} --path <declaredOutputPath>`,
    continueProduction: ({
      projectId,
      revisionId,
      attemptId,
      deliveryPolicy,
    }) =>
      `./.rsp/bin/rsp continue --project ${projectId} --revision ${revisionId} --attempt ${attemptId}${candidateId === undefined ? "" : ` --candidate ${candidateId}`} --delivery-policy ${deliveryPolicy}`,
  });

export const rspLocalProductionCommandFormatter =
  createRspLocalProductionCommandFormatter();
