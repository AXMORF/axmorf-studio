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
  web: CliCommandRunner;
  preview: CliCommandRunner;
  dev: CliCommandRunner;
  projectCreate: CliCommandRunner;
  projectDelete: CliCommandRunner;
  projectAssetImport: CliCommandRunner;
  projectCheck: CliCommandRunner;
  projectProduction: CliCommandRunner;
  catalog: CliCommandRunner;
  registry: CliCommandRunner;
  renderer: CliCommandRunner;
  scene: CliCommandRunner;
  narration: CliCommandRunner;
}>;

export class CliUsageError extends Error {
  readonly code = "cli-usage-invalid" as const;
}

const usage =
  "Expected bootstrap|doctor|web|preview|dev|project <command>|catalog <command>|registry <command>|renderer <command>|scene <command>|narration <command>.";

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

const routeProject = async (input: CliCommandInput, runners: CliRunners) => {
  const [, group, operation, ...rest] = input.args;
  if (group === "create") {
    return runners.projectCreate({
      rootDir: input.rootDir,
      args: input.args.slice(2),
    });
  }
  if (group === "delete") {
    return runners.projectDelete({
      rootDir: input.rootDir,
      args: input.args.slice(2),
    });
  }
  if (group === "check") {
    return runners.projectCheck({
      rootDir: input.rootDir,
      args: input.args.slice(2),
    });
  }
  if (group === "asset" && operation === "import") {
    return runners.projectAssetImport({ rootDir: input.rootDir, args: rest });
  }
  if (group === "execution" && operation === "resolve") {
    return runners.projectProduction({
      rootDir: input.rootDir,
      args: ["execution-resolve", ...rest],
    });
  }
  if (
    group === "produce" &&
    (operation === "inspect" ||
      operation === "prepare" ||
      operation === "continue")
  ) {
    return runners.projectProduction({
      rootDir: input.rootDir,
      args: [operation, ...rest],
    });
  }
  if (
    group === "task" &&
    (operation === "check" || operation === "commit" || operation === "fail")
  ) {
    return runners.projectProduction({
      rootDir: input.rootDir,
      args: [`task-${operation}`, ...rest],
    });
  }
  throw new CliUsageError(usage);
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
  if (args[0] === "web") {
    return runners.web({ rootDir, args: args.slice(1) });
  }
  if (args[0] === "preview") {
    return runners.preview({ rootDir, args: args.slice(1) });
  }
  if (args[0] === "dev") {
    return runners.dev({ rootDir, args: args.slice(1) });
  }
  if (args[0] === "project") return routeProject(input, runners);
  if (args[0] === "catalog" && args.length >= 2) {
    return runners.catalog({ rootDir, args: args.slice(1) });
  }
  if (args[0] === "registry" && args.length >= 2) {
    return runners.registry({ rootDir, args: args.slice(1) });
  }
  if (args[0] === "renderer" && args.length >= 2) {
    return runners.renderer({ rootDir, args: args.slice(1) });
  }
  if (args[0] === "scene" && args.length >= 2) {
    return runners.scene({ rootDir, args: args.slice(1) });
  }
  if (args[0] === "narration" && args.length >= 2) {
    return runners.narration({ rootDir, args: args.slice(1) });
  }
  throw new CliUsageError(usage);
};
