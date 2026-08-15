import type { EditableConfig } from "../../../contracts/api";

export type EditorProps = Readonly<{
  config: EditableConfig;
  update: (mutate: (draft: EditableConfig) => void) => void;
}>;
