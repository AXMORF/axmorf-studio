import { ResourceStyleProfileDescriptorSchema } from "../../contracts";
import { producerStyleProfiles } from "../capabilities/styles";

export const WORKSPACE_STYLE_FACADE_PATH = "src/runtime/styles.ts" as const;
export const WORKSPACE_STYLE_FACADE_SOURCE = `export { producerStyleProfiles } from "@axmorf/studio/remotion";
`;

export const styleDescriptorDeclarations = producerStyleProfiles.map(
  (profile) =>
    ResourceStyleProfileDescriptorSchema.parse({
      schemaVersion: 1,
      id: `style.${profile.id}`,
      kind: "style-profile",
      status: "approved",
      title: profile.label,
      description: profile.useWhen,
      useCases: [profile.useWhen],
      tags: [profile.id, "style-profile"],
      authority: {
        kind: "repository-file",
        repositoryPath: WORKSPACE_STYLE_FACADE_PATH,
      },
      allowedUse: "runtime-approved",
      styleProfileId: profile.id,
      exportName: "producerStyleProfiles",
      sourceFile: WORKSPACE_STYLE_FACADE_PATH,
    }),
);
