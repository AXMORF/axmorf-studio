import type {
  BoundTaskCommandInput,
  ProductionCommandFormatter,
} from "../domain/production-command-formatter";

const boundArguments = ({
  taskRevision,
  attemptId,
  bindingId,
  projectId,
  candidateId,
  assignment,
}: BoundTaskCommandInput) => {
  if (assignment !== undefined && projectId === undefined)
    throw new Error("Short task assignment requires a project id.");
  return [
    ...(assignment === undefined
      ? [
          `--task ${taskRevision}`,
          `--attempt ${attemptId}`,
          `--binding ${bindingId}`,
        ]
      : [
          `--project ${projectId}`,
          `--attempt ${attemptId}`,
          `--assignment ${assignment}`,
        ]),
    ...(candidateId === undefined
      ? []
      : [
          ...(assignment === undefined ? [`--project ${projectId}`] : []),
          `--candidate ${candidateId}`,
        ]),
  ].join(" ");
};

export const npmScriptProductionCommandFormatter: ProductionCommandFormatter = {
  bindTask: ({ transport, ...input }) =>
    `npm run project:task:bind -- ${boundArguments(input)} --transport ${transport}`,
  describeTask: (input) =>
    `npm run project:task:describe -- ${boundArguments(input)}`,
  finalizeTask: (input) =>
    `npm run project:task:finalize -- ${boundArguments(input)}`,
  checkTask: (input) =>
    `npm run project:task:check -- ${boundArguments(input)}`,
  commitTask: (input) =>
    `npm run project:task:commit -- ${boundArguments(input)}`,
  failTask: ({ kind, ...input }) =>
    `npm run project:task:fail -- ${boundArguments(input)} --kind ${kind}`,
  readTaskFile: (input) =>
    `npm run project:task:file-read -- ${boundArguments(input)} --path <logicalPath>`,
  writeTaskFile: (input) =>
    `npm run project:task:file-write -- ${boundArguments(input)} --path <logicalPath>`,
  continueProduction: ({ projectId, revisionId, attemptId, candidateId }) =>
    [
      "npm run project:produce:continue --",
      `--project ${projectId}`,
      `--revision ${revisionId}`,
      `--attempt ${attemptId}`,
      ...(candidateId === undefined ? [] : [`--candidate ${candidateId}`]),
    ].join(" "),
};
