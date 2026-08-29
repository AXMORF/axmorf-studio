import type {
  DeliveryPolicy,
  ProducerConfig,
} from "../../../src/contracts";
import type {
  ProductionLocations,
  RuntimeExecutionResources,
} from "./production-locations";

export type ProductionControllerCommandPorts = Readonly<{
  context: (input: {
    readonly locations: ProductionLocations;
    readonly projectId: string;
  }) => Promise<unknown>;
  createProject: (input: {
    readonly locations: ProductionLocations;
    readonly runtime: RuntimeExecutionResources;
    readonly config: ProducerConfig;
    readonly request: unknown;
  }) => Promise<unknown>;
  importAsset: (input: {
    readonly locations: ProductionLocations;
    readonly request: unknown;
  }) => Promise<unknown>;
  inspect: (input: {
    readonly locations: ProductionLocations;
    readonly runtime: RuntimeExecutionResources;
    readonly config: ProducerConfig;
    readonly projectId: string;
  }) => Promise<unknown>;
  prepare: (input: {
    readonly locations: ProductionLocations;
    readonly runtime: RuntimeExecutionResources;
    readonly config: ProducerConfig;
    readonly projectId: string;
    readonly deliveryPolicy: DeliveryPolicy;
  }) => Promise<unknown>;
  checkTask: (input: {
    readonly locations: ProductionLocations;
    readonly taskRevision: string;
  }) => Promise<unknown>;
  commitTask: (input: {
    readonly locations: ProductionLocations;
    readonly taskRevision: string;
    readonly attemptId: string;
  }) => Promise<unknown>;
  failTask: (input: {
    readonly locations: ProductionLocations;
    readonly taskRevision: string;
    readonly attemptId: string;
    readonly kind: "task" | "host" | "fixed";
  }) => Promise<unknown>;
  continueProduction: (input: {
    readonly locations: ProductionLocations;
    readonly runtime: RuntimeExecutionResources;
    readonly config: ProducerConfig;
    readonly projectId: string;
    readonly revisionId: string;
    readonly attemptId: string;
    readonly deliveryPolicy: DeliveryPolicy;
  }) => Promise<unknown>;
  buildDelivery: (input: {
    readonly locations: ProductionLocations;
    readonly runtime: RuntimeExecutionResources;
    readonly config: ProducerConfig;
    readonly projectId: string;
  }) => Promise<unknown>;
}>;

/**
 * Binds the Engine command surface to one immutable layout/runtime/config
 * tuple. Command handlers never receive a repository root and therefore
 * cannot probe or fall back to another authority during the session.
 */
export const createProjectProductionController = ({
  locations,
  runtime,
  config,
  commands,
}: {
  readonly locations: ProductionLocations;
  readonly runtime: RuntimeExecutionResources;
  readonly config: ProducerConfig;
  readonly commands: ProductionControllerCommandPorts;
}) =>
  Object.freeze({
    context: (projectId: string) =>
      commands.context({ locations, projectId }),
    createProject: (request: unknown) =>
      commands.createProject({ locations, runtime, config, request }),
    importAsset: (request: unknown) =>
      commands.importAsset({ locations, request }),
    inspect: (projectId: string) =>
      commands.inspect({ locations, runtime, config, projectId }),
    prepare: (projectId: string, deliveryPolicy: DeliveryPolicy) =>
      commands.prepare({
        locations,
        runtime,
        config,
        projectId,
        deliveryPolicy,
      }),
    checkTask: (taskRevision: string) =>
      commands.checkTask({ locations, taskRevision }),
    commitTask: (taskRevision: string, attemptId: string) =>
      commands.commitTask({ locations, taskRevision, attemptId }),
    failTask: (
      taskRevision: string,
      attemptId: string,
      kind: "task" | "host" | "fixed",
    ) => commands.failTask({ locations, taskRevision, attemptId, kind }),
    continueProduction: (input: {
      readonly projectId: string;
      readonly revisionId: string;
      readonly attemptId: string;
      readonly deliveryPolicy: DeliveryPolicy;
    }) =>
      commands.continueProduction({
        locations,
        runtime,
        config,
        ...input,
      }),
    buildDelivery: (projectId: string) =>
      commands.buildDelivery({ locations, runtime, config, projectId }),
    execute: (request: Readonly<Record<string, unknown>>) => {
      switch (request.command) {
        case "context":
          return commands.context({
            locations,
            projectId: String(request.storyId),
          });
        case "project-create":
          return commands.createProject({
            locations,
            runtime,
            config,
            request: request.input,
          });
        case "asset-import":
          return commands.importAsset({ locations, request });
        case "inspect":
          return commands.inspect({
            locations,
            runtime,
            config,
            projectId: String(request.storyId),
          });
        case "prepare":
          return commands.prepare({
            locations,
            runtime,
            config,
            projectId: String(request.storyId),
            deliveryPolicy: request.deliveryPolicy as DeliveryPolicy,
          });
        case "task-check":
          return commands.checkTask({
            locations,
            taskRevision: String(request.taskRevision),
          });
        case "task-commit":
          return commands.commitTask({
            locations,
            taskRevision: String(request.taskRevision),
            attemptId: String(request.attemptId),
          });
        case "task-fail":
          return commands.failTask({
            locations,
            taskRevision: String(request.taskRevision),
            attemptId: String(request.attemptId),
            kind: request.kind as "task" | "host" | "fixed",
          });
        case "continue": {
          const deliveryPolicy = request.deliveryPolicy as DeliveryPolicy;
          return commands.continueProduction({
            locations,
            runtime,
            config,
            projectId: String(request.storyId),
            revisionId: String(request.revisionId),
            attemptId: String(request.attemptId),
            deliveryPolicy,
          });
        }
        case "delivery-build":
          return commands.buildDelivery({
            locations,
            runtime,
            config,
            projectId: String(request.storyId),
          });
        default:
          throw new Error("Unsupported production controller command.");
      }
    },
  });

export type ProjectProductionController = ReturnType<
  typeof createProjectProductionController
>;
