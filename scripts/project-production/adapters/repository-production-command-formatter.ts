import type { ProductionCommandFormatter } from "../domain/production-command-formatter";

export const repositoryProductionCommandFormatter: ProductionCommandFormatter =
  Object.freeze({
    bindTask: ({ taskRevision, attemptId, bindingId, transport }) =>
      `npm run project:task:bind -- --task ${taskRevision} --attempt ${attemptId} --binding ${bindingId} --transport ${transport}`,
    describeTask: ({ taskRevision, attemptId, bindingId }) =>
      `npm run project:task:describe -- --task ${taskRevision} --attempt ${attemptId} --binding ${bindingId}`,
    finalizeTask: ({ taskRevision, attemptId, bindingId }) =>
      `npm run project:task:finalize -- --task ${taskRevision} --attempt ${attemptId} --binding ${bindingId}`,
    checkTask: ({ taskRevision, attemptId, bindingId }) =>
      `npm run project:task:check -- --task ${taskRevision} --attempt ${attemptId} --binding ${bindingId}`,
    commitTask: ({ taskRevision, attemptId, bindingId }) =>
      `npm run project:task:commit -- --task ${taskRevision} --attempt ${attemptId} --binding ${bindingId}`,
    failTask: ({ taskRevision, attemptId, bindingId, kind }) =>
      `npm run project:task:fail -- --task ${taskRevision} --attempt ${attemptId} --binding ${bindingId} --kind ${kind}`,
    readTaskFile: ({ taskRevision, attemptId, bindingId }) =>
      `npm run project:task:file-read -- --task ${taskRevision} --attempt ${attemptId} --binding ${bindingId} --path <logicalPath>`,
    writeTaskFile: ({ taskRevision, attemptId, bindingId }) =>
      `npm run project:task:file-write -- --task ${taskRevision} --attempt ${attemptId} --binding ${bindingId} --path <declaredOutputPath>`,
    continueProduction: ({ projectId, revisionId, attemptId }) =>
      `npm run project:produce:continue -- --project ${projectId} --revision ${revisionId} --attempt ${attemptId}`,
  });
