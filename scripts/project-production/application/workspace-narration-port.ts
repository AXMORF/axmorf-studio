import {
  prepareNarrationInputs,
  type PrepareNarration,
} from "./prepare-fixed-tasks";

export type WorkspacePrepareNarration = PrepareNarration;

export const prepareWorkspaceNarration: WorkspacePrepareNarration =
  prepareNarrationInputs;
