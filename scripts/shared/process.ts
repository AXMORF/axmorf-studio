export type ProcessResult = Readonly<{
  status: number;
  stdout: string;
  stderr: string;
}>;

export type ProcessRunner = (
  command: string,
  args: readonly string[],
  options?: Readonly<{ cwd?: string }>,
) => Promise<ProcessResult>;
