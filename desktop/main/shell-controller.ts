import { StoryIdSchema } from "../../src/contracts";
import type { RuntimePackManifest } from "../contracts/runtime-pack";
import type {
  DesktopProjectStatus,
  PreviewCatalog,
  PreviewCatalogReadiness,
} from "../contracts/preview";
import { projectPreviewCatalogForPlayer } from "../contracts/preview";
import { WorkspaceMigrationAuthorityError } from "../application/migrate-workspace";
import type { DoctorResponse } from "../contracts/protocol";
import {
  DesktopAppStateSchema,
  type DesktopAppState,
} from "../contracts/shell";
import type {
  DesktopSettingsSaveRequest,
  DesktopSettingsSnapshot,
} from "../contracts/settings";

const emptyCatalog = (): PreviewCatalog => ({
  schemaVersion: 1,
  contractVersion: "desktop-preview-catalog-v1",
  entries: [],
  unavailable: [],
});

const emptyPlayerCatalog = () => projectPreviewCatalogForPlayer(emptyCatalog());

const notLoadedCatalog = (): PreviewCatalogReadiness => ({
  state: "not-loaded",
  entryCount: 0,
  unavailableCount: 0,
  failureCode: null,
});

const failedCatalog = (): PreviewCatalogReadiness => ({
  state: "failed",
  entryCount: 0,
  unavailableCount: 0,
  failureCode: "preview-catalog-failed",
});

export type DesktopEngineSnapshot = Readonly<{
  catalog: PreviewCatalog;
  previewCatalog: PreviewCatalogReadiness;
  projects: readonly DesktopProjectStatus[];
  activeWork: DoctorResponse["activeWork"];
  runtimePack: Pick<RuntimePackManifest, "runtimePackId" | "architecture">;
  agentIntegration: "ready" | "needs-update";
  provider: "ready" | "not-configured" | "unavailable" | "unknown";
  deliveryAvailable: boolean;
  deliveryBlocker: Readonly<{ code: string; message: string }> | null;
}>;

export type DesktopSettingsPort = Readonly<{
  get: () => Promise<DesktopSettingsSnapshot>;
  save: (value: DesktopSettingsSaveRequest) => Promise<DesktopSettingsSnapshot>;
}>;

export class DesktopSettingsEngineRestartError extends Error {
  constructor(options?: ErrorOptions) {
    super("desktop-settings-engine-restart-failed", options);
    this.name = "DesktopSettingsEngineRestartError";
  }
}

export type DesktopWorkspacePort = Readonly<{
  loadSelectedRoot: () => Promise<string | null>;
  chooseInitialRoot: (defaultRoot: string) => Promise<string | null>;
  initializeInitialRoot: (workspaceRoot: string) => Promise<string>;
  chooseMigrationTarget: (workspaceRoot: string) => Promise<string | null>;
  migrateRoot: (
    sourceWorkspaceRoot: string,
    targetWorkspaceRoot: string,
  ) => Promise<
    Readonly<{
      workspaceRoot: string;
      complete: () => Promise<void>;
      rollback: () => Promise<void>;
    }>
  >;
  showInFileManager: (workspaceRoot: string) => Promise<void>;
}>;

export type DesktopEnginePort = Readonly<{
  start: (workspaceRoot: string) => Promise<DesktopEngineSnapshot>;
  refreshPreviewCatalog: () => Promise<DesktopEngineSnapshot>;
  buildDelivery: (storyId: string) => Promise<DesktopEngineSnapshot>;
  subscribe: (
    listener: (snapshot: DesktopEngineSnapshot) => void,
  ) => () => void;
  stop: () => Promise<void>;
}>;

export type DesktopMediaPort = Readonly<{
  selectWorkspace: (workspaceRoot: string) => Promise<void>;
  replaceCatalog: (catalog: PreviewCatalog) => Promise<void>;
  close: () => Promise<void>;
}>;

export class DesktopShellController {
  readonly #defaultWorkspaceRoot: string;
  readonly #workspace: DesktopWorkspacePort;
  readonly #engine: DesktopEnginePort;
  readonly #media: DesktopMediaPort;
  readonly #settings: DesktopSettingsPort;
  readonly #unsubscribeEngine: () => void;
  #operation: Promise<void> = Promise.resolve();
  #state: DesktopAppState;

  constructor({
    defaultWorkspaceRoot,
    workspace,
    engine,
    media,
    settings,
  }: Readonly<{
    defaultWorkspaceRoot: string;
    workspace: DesktopWorkspacePort;
    engine: DesktopEnginePort;
    media: DesktopMediaPort;
    settings: DesktopSettingsPort;
  }>) {
    this.#defaultWorkspaceRoot = defaultWorkspaceRoot;
    this.#workspace = workspace;
    this.#engine = engine;
    this.#media = media;
    this.#settings = settings;
    this.#state = DesktopAppStateSchema.parse({
      phase: "B",
      status: "workspace-selection-required",
      workspaceRoot: null,
      initialWorkspaceRoot: defaultWorkspaceRoot,
      adapterMode: "workspace",
      runtimePackMode: "embedded",
      productionAvailable: false,
      deliveryAvailable: false,
      deliveryBlocker: null,
      distributionReady: false,
      runtimePackAvailable: false,
      runtimePack: null,
      health: {
        runtime: "checking",
        agentIntegration: "ready",
        provider: "unknown",
      },
      previewCatalog: notLoadedCatalog(),
      catalog: emptyPlayerCatalog(),
      projects: [],
      selectedStoryId: null,
      activeWork: null,
      error: null,
    });
    this.#unsubscribeEngine = engine.subscribe((snapshot) => {
      if (this.#state.workspaceRoot === null) return;
      // Active work guards close/quit and configuration changes, so publish it
      // synchronously instead of waiting for media ticket refresh to finish.
      this.#state = DesktopAppStateSchema.parse({
        ...this.#state,
        activeWork: snapshot.activeWork,
      });
      void this.#enqueue(() =>
        this.#applySnapshot(snapshot, this.#state.selectedStoryId),
      ).catch(() => undefined);
    });
  }

  getState = (): DesktopAppState => structuredClone(this.#state);

  bootstrap = async () => {
    if (this.#state.status !== "workspace-selection-required") {
      return this.getState();
    }
    const selectedRoot = await this.#workspace.loadSelectedRoot();
    if (selectedRoot === null) return this.getState();
    return this.#start(selectedRoot);
  };

  chooseInitialWorkspace = async () => {
    if (
      this.#state.workspaceRoot !== null ||
      this.#state.status !== "workspace-selection-required"
    ) {
      return this.getState();
    }
    const selectedRoot = await this.#workspace.chooseInitialRoot(
      this.#defaultWorkspaceRoot,
    );
    if (selectedRoot === null) return this.getState();
    return this.#start(selectedRoot, true);
  };

  showWorkspaceInFinder = async () => {
    const workspaceRoot = this.#state.workspaceRoot;
    if (workspaceRoot === null) return;
    await this.#workspace.showInFileManager(workspaceRoot);
  };

  migrateWorkspace = async () => {
    const sourceWorkspaceRoot = this.#state.workspaceRoot;
    if (
      sourceWorkspaceRoot === null ||
      this.#state.status !== "ready" ||
      this.#state.activeWork !== null
    ) {
      throw new Error("desktop-workspace-migration-denied");
    }
    const targetWorkspaceRoot =
      await this.#workspace.chooseMigrationTarget(sourceWorkspaceRoot);
    if (targetWorkspaceRoot === null) return this.getState();
    await this.#enqueue(async () => {
      if (
        this.#state.status !== "ready" ||
        this.#state.activeWork !== null ||
        this.#state.workspaceRoot !== sourceWorkspaceRoot
      ) {
        throw new Error("desktop-workspace-migration-denied");
      }
      const preferredStoryId = this.#state.selectedStoryId;
      this.#state = DesktopAppStateSchema.parse({
        ...this.#state,
        status: "migrating-workspace",
        productionAvailable: false,
        deliveryAvailable: false,
        deliveryBlocker: null,
        error: null,
      });
      await this.#engine.stop();
      await this.#media.replaceCatalog(emptyCatalog());
      let migration:
        | Awaited<ReturnType<DesktopWorkspacePort["migrateRoot"]>>
        | undefined;
      try {
        migration = await this.#workspace.migrateRoot(
          sourceWorkspaceRoot,
          targetWorkspaceRoot,
        );
        await this.#media.selectWorkspace(migration.workspaceRoot);
        this.#state = DesktopAppStateSchema.parse({
          ...this.#state,
          workspaceRoot: migration.workspaceRoot,
          status: "loading-catalog",
        });
        const snapshot = await this.#engine.start(migration.workspaceRoot);
        await this.#applySnapshot(snapshot, preferredStoryId);
        try {
          await migration.complete();
        } catch {
          this.#state = DesktopAppStateSchema.parse({
            ...this.#state,
            error: "Workspace 已切换；恢复记录将在下次启动时完成清理。",
          });
        }
      } catch (error) {
        await this.#engine.stop().catch(() => undefined);
        if (error instanceof WorkspaceMigrationAuthorityError) {
          this.#state = DesktopAppStateSchema.parse({
            ...this.#state,
            status: "fatal",
            productionAvailable: false,
            deliveryAvailable: false,
            deliveryBlocker: null,
            runtimePackAvailable: false,
            runtimePack: null,
            health: { ...this.#state.health, runtime: "unavailable" },
            previewCatalog: failedCatalog(),
            catalog: emptyPlayerCatalog(),
            projects: [],
            selectedStoryId: null,
            activeWork: null,
            error: error.message,
          });
          return;
        }
        if (migration !== undefined) {
          try {
            await migration.rollback();
          } catch (rollbackError) {
            this.#state = DesktopAppStateSchema.parse({
              ...this.#state,
              status: "fatal",
              productionAvailable: false,
              deliveryAvailable: false,
              deliveryBlocker: null,
              runtimePackAvailable: false,
              runtimePack: null,
              health: { ...this.#state.health, runtime: "unavailable" },
              previewCatalog: failedCatalog(),
              catalog: emptyPlayerCatalog(),
              projects: [],
              selectedStoryId: null,
              activeWork: null,
              error:
                rollbackError instanceof Error
                  ? rollbackError.message
                  : "Workspace migration rollback failed.",
            });
            return;
          }
        }
        await this.#media.selectWorkspace(sourceWorkspaceRoot);
        this.#state = DesktopAppStateSchema.parse({
          ...this.#state,
          workspaceRoot: sourceWorkspaceRoot,
          status: "loading-catalog",
        });
        try {
          const snapshot = await this.#engine.start(sourceWorkspaceRoot);
          await this.#applySnapshot(snapshot, preferredStoryId);
          this.#state = DesktopAppStateSchema.parse({
            ...this.#state,
            error:
              error instanceof Error
                ? `Workspace 迁移已回滚：${error.message}`
                : "Workspace 迁移已回滚。",
          });
        } catch (restartError) {
          this.#state = DesktopAppStateSchema.parse({
            ...this.#state,
            status: "fatal",
            productionAvailable: false,
            deliveryAvailable: false,
            deliveryBlocker: null,
            runtimePackAvailable: false,
            runtimePack: null,
            health: { ...this.#state.health, runtime: "unavailable" },
            previewCatalog: failedCatalog(),
            catalog: emptyPlayerCatalog(),
            projects: [],
            selectedStoryId: null,
            activeWork: null,
            error:
              restartError instanceof Error
                ? restartError.message
                : "Workspace rollback Engine restart failed.",
          });
        }
      }
    });
    return this.getState();
  };

  getSettings = () => this.#settings.get();

  saveSettings = async (value: DesktopSettingsSaveRequest) => {
    let saved: DesktopSettingsSnapshot | undefined;
    await this.#enqueue(async () => {
      if (
        this.#state.activeWork !== null ||
        this.#state.status === "stopping"
      ) {
        throw new Error("desktop-settings-active-work");
      }
      saved = await this.#settings.save(value);
      const workspaceRoot = this.#state.workspaceRoot;
      if (workspaceRoot === null) return;
      await this.#engine.stop();
      await this.#media.replaceCatalog(emptyCatalog());
      this.#state = DesktopAppStateSchema.parse({
        ...this.#state,
        status: "initializing",
        productionAvailable: false,
        deliveryAvailable: false,
        deliveryBlocker: null,
        runtimePackAvailable: false,
        runtimePack: null,
        activeWork: null,
        error: null,
      });
      try {
        const snapshot = await this.#engine.start(workspaceRoot);
        await this.#applySnapshot(snapshot, this.#state.selectedStoryId);
      } catch (error) {
        this.#state = DesktopAppStateSchema.parse({
          ...this.#state,
          status: "fatal",
          health: { ...this.#state.health, runtime: "unavailable" },
          previewCatalog: failedCatalog(),
          catalog: emptyPlayerCatalog(),
          projects: [],
          selectedStoryId: null,
          error:
            error instanceof Error ? error.message : "Desktop Engine failed.",
        });
        throw new DesktopSettingsEngineRestartError({ cause: error });
      }
    });
    if (saved === undefined) {
      throw new Error("desktop-settings-save-result-missing");
    }
    return saved;
  };

  refreshPreviewCatalog = async () => {
    if (this.#state.status !== "ready") return this.getState();
    await this.#enqueue(async () => {
      this.#state = DesktopAppStateSchema.parse({
        ...this.#state,
        status: "loading-catalog",
        error: null,
      });
      try {
        const snapshot = await this.#engine.refreshPreviewCatalog();
        await this.#applySnapshot(snapshot, this.#state.selectedStoryId);
      } catch {
        await this.#media.replaceCatalog(emptyCatalog());
        this.#state = DesktopAppStateSchema.parse({
          ...this.#state,
          status: "ready",
          previewCatalog: failedCatalog(),
          catalog: emptyPlayerCatalog(),
          error: "Preview Catalog refresh failed.",
        });
      }
    });
    return this.getState();
  };

  selectPreview = async (storyId: string) => {
    const parsedStoryId = StoryIdSchema.parse(storyId);
    if (
      this.#state.status !== "ready" ||
      !this.#state.projects.some((project) => project.storyId === parsedStoryId)
    ) {
      throw new Error("desktop-project-selection-denied");
    }
    this.#state = DesktopAppStateSchema.parse({
      ...this.#state,
      selectedStoryId: parsedStoryId,
    });
    return this.getState();
  };

  buildDelivery = async (storyId: string) => {
    const parsedStoryId = StoryIdSchema.parse(storyId);
    const project = this.#state.projects.find(
      (candidate) => candidate.storyId === parsedStoryId,
    );
    if (
      this.#state.status !== "ready" ||
      this.#state.activeWork !== null ||
      !this.#state.deliveryAvailable ||
      project?.source !== "current" ||
      project.delivery === "current"
    ) {
      throw new Error("desktop-delivery-build-denied");
    }
    await this.#enqueue(async () => {
      const snapshot = await this.#engine.buildDelivery(parsedStoryId);
      await this.#applySnapshot(snapshot, parsedStoryId);
    });
    return this.getState();
  };

  retryEngine = async () => {
    const workspaceRoot = this.#state.workspaceRoot;
    if (workspaceRoot === null || this.#state.status !== "fatal") {
      return this.getState();
    }
    await this.#engine.stop();
    await this.#media.replaceCatalog(emptyCatalog());
    return this.#start(workspaceRoot);
  };

  shutdown = async () => {
    this.#state = DesktopAppStateSchema.parse({
      ...this.#state,
      status: "stopping",
    });
    this.#unsubscribeEngine();
    await this.#engine.stop();
    await this.#media.close();
  };

  #start = async (selectedRoot: string, initialize = false) => {
    await this.#enqueue(async () => {
      try {
        this.#state = DesktopAppStateSchema.parse({
          ...this.#state,
          status: "initializing",
          error: null,
        });
        const workspaceRoot = initialize
          ? await this.#workspace.initializeInitialRoot(selectedRoot)
          : selectedRoot;
        await this.#media.selectWorkspace(workspaceRoot);
        this.#state = DesktopAppStateSchema.parse({
          ...this.#state,
          workspaceRoot,
          status: "loading-catalog",
        });
        const snapshot = await this.#engine.start(workspaceRoot);
        await this.#applySnapshot(snapshot, null);
      } catch (error) {
        await this.#media.replaceCatalog(emptyCatalog()).catch(() => undefined);
        this.#state = DesktopAppStateSchema.parse({
          ...this.#state,
          status: "fatal",
          productionAvailable: false,
          deliveryAvailable: false,
          deliveryBlocker: null,
          runtimePackAvailable: false,
          runtimePack: null,
          health: { ...this.#state.health, runtime: "unavailable" },
          previewCatalog: failedCatalog(),
          catalog: emptyPlayerCatalog(),
          projects: [],
          selectedStoryId: null,
          activeWork: null,
          error:
            error instanceof Error ? error.message : "Desktop Engine failed.",
        });
      }
    });
    return this.getState();
  };

  #applySnapshot = async (
    snapshot: DesktopEngineSnapshot,
    preferredStoryId: string | null,
  ) => {
    const selectedStoryId = snapshot.projects.some(
      (entry) => entry.storyId === preferredStoryId,
    )
      ? preferredStoryId
      : (snapshot.projects[0]?.storyId ?? null);
    await this.#media.replaceCatalog(snapshot.catalog);
    this.#state = DesktopAppStateSchema.parse({
      ...this.#state,
      status: "ready",
      productionAvailable: true,
      deliveryAvailable: snapshot.deliveryAvailable,
      deliveryBlocker: snapshot.deliveryBlocker,
      runtimePackAvailable: true,
      runtimePack: snapshot.runtimePack,
      health: {
        runtime: "ready",
        agentIntegration: snapshot.agentIntegration,
        provider: snapshot.provider,
      },
      previewCatalog: snapshot.previewCatalog,
      catalog: projectPreviewCatalogForPlayer(snapshot.catalog),
      projects: snapshot.projects,
      selectedStoryId,
      activeWork: snapshot.activeWork,
      error: null,
    });
  };

  #enqueue = async (operation: () => Promise<void>) => {
    const next = this.#operation.then(operation, operation);
    this.#operation = next.catch(() => undefined);
    await next;
  };
}
