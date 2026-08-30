import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { bootstrapWorkspace } from "../bootstrap/workspace-bootstrap";
import { inspectWorkspaceReadiness } from "../bootstrap/workspace-doctor";
import {
  loadRuntimePolicyManifest,
  resolveRuntimeResources,
  type RuntimeResources,
} from "../runtime/runtime-resources";
import { startWebControlCenter } from "../web/server";
import {
  parseDevArguments,
  parseSinglePortArgument,
  startDevServices,
  startPreviewService,
  type ProcessTerminal,
  type RunningService,
} from "./launchers";
import { routeCliCommand, type CliRunners } from "./router";
import {
  parseWorkspaceArguments,
  resolveWorkspaceRoot,
} from "../workspace/resolve-workspace";

type Output = Readonly<{
  stdout: (value: string) => void;
  stderr: (value: string) => void;
}>;

const defaultOutput: Output = {
  stdout: (value) => process.stdout.write(value),
  stderr: (value) => process.stderr.write(value),
};

const lineWriter = (write: (value: string) => void) => (value: string) =>
  write(`${value}\n`);

const wrapWebService = (
  web: Awaited<ReturnType<typeof startWebControlCenter>>,
): RunningService => {
  let resolveTerminal: ((terminal: ProcessTerminal) => void) | undefined;
  const terminal = new Promise<ProcessTerminal>((resolvePromise) => {
    resolveTerminal = resolvePromise;
  });
  let closed = false;
  return {
    url: web.url,
    wait: () => terminal,
    close: async () => {
      if (closed) return;
      closed = true;
      await web.close();
      resolveTerminal?.({ code: 0, signal: null });
    },
  };
};

const startWorkspaceWeb = async ({
  rootDir,
  port,
  studioUrl,
  resources,
  runtimePolicyManifest,
}: {
  readonly rootDir: string;
  readonly port: number;
  readonly studioUrl?: string;
  readonly resources: RuntimeResources;
  readonly runtimePolicyManifest: Awaited<
    ReturnType<typeof loadRuntimePolicyManifest>
  >;
}) => {
  const { createSettingsWebDependencies } =
    await import("../../../../settings/server/runtime-dependencies");
  const dependencies = createSettingsWebDependencies({
    rootDir,
    env: process.env,
    runtimeResources: resources,
    runtimePolicyManifest,
  });
  return startWebControlCenter({
    rootDir,
    assetsDir: resources.webRoot,
    port,
    ...(studioUrl === undefined ? {} : { studioUrl }),
    ...dependencies,
  });
};

const createDefaultRunners = (output: Output): CliRunners => {
  const stdoutLine = lineWriter(output.stdout);
  const stderrLine = lineWriter(output.stderr);
  let runtimePromise:
    | Promise<
        Readonly<{
          resources: RuntimeResources;
          manifest: Awaited<ReturnType<typeof loadRuntimePolicyManifest>>;
        }>
      >
    | undefined;
  const runtime = () => {
    runtimePromise ??= resolveRuntimeResources().then(async (resources) => ({
      resources,
      manifest: await loadRuntimePolicyManifest(resources),
    }));
    return runtimePromise;
  };
  return {
    bootstrap: async ({ rootDir }) => {
      await runtime();
      stdoutLine(JSON.stringify(await bootstrapWorkspace(rootDir)));
    },
    doctor: async ({ rootDir }) => {
      stdoutLine(JSON.stringify(await inspectWorkspaceReadiness(rootDir)));
    },
    web: async ({ rootDir, args }) => {
      const { port } = parseSinglePortArgument(args, "--port", 3100);
      const { resources, manifest } = await runtime();
      const service = wrapWebService(
        await startWorkspaceWeb({
          rootDir,
          port,
          resources,
          runtimePolicyManifest: manifest,
        }),
      );
      stdoutLine(JSON.stringify({ status: "web-listening", url: service.url }));
      return service;
    },
    preview: async ({ rootDir, args }) => {
      const { port } = parseSinglePortArgument(args, "--port", 3101);
      await runtime();
      const service = await startPreviewService({ rootDir, port });
      stdoutLine(
        JSON.stringify({ status: "studio-process-started", url: service.url }),
      );
      return service;
    },
    dev: async ({ rootDir, args }) => {
      const { webPort, studioPort } = parseDevArguments(args);
      const { resources, manifest } = await runtime();
      const service = await startDevServices({
        rootDir,
        webPort,
        studioPort,
        startWeb: async (input) =>
          startWorkspaceWeb({
            ...input,
            resources,
            runtimePolicyManifest: manifest,
          }),
      });
      stdoutLine(
        JSON.stringify({
          status: "workspace-services-started",
          webUrl: service.url,
          studioUrl: `http://127.0.0.1:${studioPort}/`,
        }),
      );
      return service;
    },
    projectCreate: async ({ rootDir, args }) => {
      const { resources } = await runtime();
      const { runProjectCreateCli } =
        await import("../../../../scripts/projects/create");
      await runProjectCreateCli(args, {
        rootDir,
        env: process.env,
        stdout: stdoutLine,
        runtimeResources: resources,
      });
    },
    projectDelete: async ({ rootDir, args }) => {
      await runtime();
      const { runProjectDeleteCli } =
        await import("../../../../scripts/projects/delete");
      await runProjectDeleteCli({ args, rootDir, stdout: output.stdout });
    },
    projectAssetImport: async ({ rootDir, args }) => {
      await runtime();
      const { runProjectAssetImportCli } =
        await import("../../../../scripts/project-assets/cli");
      await runProjectAssetImportCli(args, { rootDir, stdout: stdoutLine });
    },
    projectCheck: async ({ rootDir, args }) => {
      await runtime();
      const { runProjectCheckCli } =
        await import("../../../../scripts/project-check/cli");
      await runProjectCheckCli(args, { rootDir, stdout: stdoutLine });
    },
    projectProduction: async ({ rootDir, args }) => {
      const { manifest } = await runtime();
      const { runProjectProductionCli } =
        await import("../../../../scripts/project-production/cli");
      await runProjectProductionCli(args, {
        rootDir,
        runtimePolicyManifest: manifest,
        stdout: stdoutLine,
      });
    },
    catalog: async ({ rootDir, args }) => {
      await runtime();
      const { runCatalogCli } = await import("../../../../scripts/catalog/cli");
      await runCatalogCli(args, { rootDir, stdout: stdoutLine });
    },
    registry: async ({ rootDir, args }) => {
      await runtime();
      const { runRegistryCli } =
        await import("../../../../scripts/registry/cli");
      await runRegistryCli(args, { rootDir, stdout: stdoutLine });
    },
    renderer: async ({ rootDir, args }) => {
      await runtime();
      const { runRendererRegistryCli } =
        await import("../../../../scripts/renderer-registry/cli");
      await runRendererRegistryCli(args, { rootDir, stdout: stdoutLine });
    },
    scene: async ({ rootDir, args }) => {
      await runtime();
      const { runScenePackageCli } =
        await import("../../../../scripts/scene-package/cli");
      await runScenePackageCli(args, { rootDir, stdout: stdoutLine });
    },
    narration: async ({ rootDir, args }) => {
      await runtime();
      const narration = await import("../../../../scripts/narration/cli");
      await narration.runCli(args, {
        rootDir,
        env: process.env,
        stdout: stdoutLine,
        stderr: stderrLine,
        createGenerationDependencies:
          narration.createDefaultGenerationDependencies,
      });
    },
  };
};

const isRunningService = (value: unknown): value is RunningService =>
  value !== null &&
  typeof value === "object" &&
  typeof (value as RunningService).wait === "function" &&
  typeof (value as RunningService).close === "function";

const waitForService = async (service: RunningService) => {
  let shuttingDown = false;
  const shutdown = () => {
    shuttingDown = true;
    void service.close();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  try {
    const terminal = await service.wait();
    if (!shuttingDown && (terminal.signal !== null || terminal.code !== 0)) {
      throw new Error(
        `Local service stopped with ${
          terminal.signal === null
            ? `exit ${terminal.code ?? 1}`
            : `signal ${terminal.signal}`
        }.`,
      );
    }
  } finally {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
    await service.close();
  }
};

export const runCli = async ({
  cwd,
  args,
  output = defaultOutput,
  runners = createDefaultRunners(output),
}: {
  readonly cwd: string;
  readonly args: readonly string[];
  readonly output?: Output;
  readonly runners?: CliRunners;
}) => {
  const parsed = parseWorkspaceArguments(args);
  const workspace = await resolveWorkspaceRoot({
    cwd,
    ...(parsed.explicitWorkspace === undefined
      ? {}
      : { explicitWorkspace: parsed.explicitWorkspace }),
  });
  const result = await routeCliCommand({
    rootDir: workspace.rootDir,
    args: parsed.commandArgs,
    runners,
  });
  if (isRunningService(result)) await waitForService(result);
};

const errorCode = (error: unknown) => {
  if (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return "command-failed";
};

const isMainModule = () => {
  if (process.argv[1] === undefined) return false;
  try {
    return (
      realpathSync(process.argv[1]) ===
      realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
};

if (isMainModule()) {
  runCli({ cwd: process.cwd(), args: process.argv.slice(2) }).catch(
    (error: unknown) => {
      defaultOutput.stderr(
        `${JSON.stringify({
          status: "error",
          code: errorCode(error),
          message: error instanceof Error ? error.message : "Command failed.",
        })}\n`,
      );
      process.exitCode = errorCode(error) === "command-failed" ? 1 : 2;
    },
  );
}
