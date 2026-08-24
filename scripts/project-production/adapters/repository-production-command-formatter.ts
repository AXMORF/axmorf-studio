import type { ProductionCommandFormatter } from "../domain/production-command-formatter";

export const repositoryProductionCommandFormatter: ProductionCommandFormatter =
  Object.freeze({
    finalizeTask: ({ taskRevision }) =>
      `npm run project:task:finalize -- --task ${taskRevision}`,
    checkTask: ({ taskRevision }) =>
      `npm run project:task:check -- --task ${taskRevision}`,
    commitTask: ({ taskRevision, attemptId }) =>
      `npm run project:task:commit -- --task ${taskRevision} --attempt ${attemptId}`,
    failTask: ({ taskRevision, attemptId, kind }) =>
      `npm run project:task:fail -- --task ${taskRevision} --attempt ${attemptId} --kind ${kind}`,
    continueProduction: ({ projectId, revisionId, attemptId }) =>
      `npm run project:produce:continue -- --project ${projectId} --revision ${revisionId} --attempt ${attemptId}`,
  });
