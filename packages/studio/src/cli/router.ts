export type CliCommandInput = Readonly<{
  rootDir: string;
  args: readonly string[];
}>;

export type CliCommandRunner = (
  input: CliCommandInput,
) => void | Promise<void> | unknown | Promise<unknown>;

export type CliRunners = Readonly<{
  bootstrap: CliCommandRunner;
  doctor: CliCommandRunner;
  browserPrepare: CliCommandRunner;
  web: CliCommandRunner;
  preview: CliCommandRunner;
  dev: CliCommandRunner;
  film: CliCommandRunner;
}>;

export class CliUsageError extends Error {
  readonly code = "cli-usage-invalid" as const;
}

const usage =
  "Expected bootstrap|doctor|browser prepare|web|preview|dev|film <command>.";

const exactFixedCommand = async ({
  args,
  input,
  runner,
}: {
  readonly args: readonly string[];
  readonly input: CliCommandInput;
  readonly runner: CliCommandRunner;
}) => {
  if (args.length !== 1) throw new CliUsageError(usage);
  return runner({ rootDir: input.rootDir, args: [] });
};

export const routeCliCommand = async ({
  rootDir,
  args,
  runners,
}: CliCommandInput & { readonly runners: CliRunners }) => {
  const input = { rootDir, args };
  if (args[0] === "bootstrap") {
    return exactFixedCommand({ args, input, runner: runners.bootstrap });
  }
  if (args[0] === "doctor") {
    return exactFixedCommand({ args, input, runner: runners.doctor });
  }
  if (args.length === 2 && args[0] === "browser" && args[1] === "prepare") {
    return runners.browserPrepare({ rootDir, args: [] });
  }
  if (args[0] === "web") {
    return runners.web({ rootDir, args: args.slice(1) });
  }
  if (args[0] === "preview") {
    return runners.preview({ rootDir, args: args.slice(1) });
  }
  if (args[0] === "dev") {
    return runners.dev({ rootDir, args: args.slice(1) });
  }
  if (args[0] === "film" && args.length >= 2) {
    return runners.film({ rootDir, args: args.slice(1) });
  }
  if (args[0] === "project") {
    throw new CliUsageError(
      "Project commands were removed in 0.3.0. Make new videos with `film` commands (.agents/skills/axmorf-film/SKILL.md).",
    );
  }
  throw new CliUsageError(usage);
};
