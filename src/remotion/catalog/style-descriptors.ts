import { ResourceStyleProfileDescriptorSchema } from "../../contracts";
import { producerStyleProfiles } from "../capabilities/styles";

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
        repositoryPath: "src/remotion/capabilities/styles/profiles.ts",
      },
      allowedUse: "runtime-approved",
      styleProfileId: profile.id,
      exportName: "producerStyleProfiles",
      sourceFile: "src/remotion/capabilities/styles/profiles.ts",
    }),
);
