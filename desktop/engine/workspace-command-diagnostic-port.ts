type WorkspaceCommandFailureInput = Readonly<{
  readonly workspaceRoot: string;
  readonly command: string;
  readonly storyId: string | null;
  readonly error: unknown;
}>;

export const recordWorkspaceCommandFailure: (
  input: WorkspaceCommandFailureInput,
) => Promise<void> = async () => undefined;
