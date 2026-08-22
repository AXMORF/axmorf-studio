import { StoryIdSchema } from "../../src/contracts";
import type {
  PreviewCatalog,
  PreviewCatalogReadiness,
} from "../contracts/preview";
import { projectPreviewCatalogForPlayer } from "../contracts/preview";
import {
  DesktopAppStateSchema,
  type DesktopAppState,
} from "../contracts/shell";

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
  activeWork: false;
}>;

export type DesktopWorkspacePort = Readonly<{
  loadSelectedRoot: () => Promise<string | null>;
  chooseInitialRoot: (defaultRoot: string) => Promise<string | null>;
  initializeInitialRoot: (workspaceRoot: string) => Promise<string>;
  showInFileManager: (workspaceRoot: string) => Promise<void>;
}>;

export type DesktopEnginePort = Readonly<{
  start: (workspaceRoot: string) => Promise<DesktopEngineSnapshot>;
  refreshPreviewCatalog: () => Promise<DesktopEngineSnapshot>;
  stop: () => Promise<void>;
}>;

export type DesktopMediaPort = Readonly<{
  replaceCatalog: (catalog: PreviewCatalog) => Promise<void>;
  close: () => Promise<void>;
}>;

export class DesktopShellController {
  readonly #defaultWorkspaceRoot: string;
  readonly #workspace: DesktopWorkspacePort;
  readonly #engine: DesktopEnginePort;
  readonly #media: DesktopMediaPort;
  #operation: Promise<void> = Promise.resolve();
  #state: DesktopAppState;

  constructor({
    defaultWorkspaceRoot,
    workspace,
    engine,
    media,
  }: Readonly<{
    defaultWorkspaceRoot: string;
    workspace: DesktopWorkspacePort;
    engine: DesktopEnginePort;
    media: DesktopMediaPort;
  }>) {
    this.#defaultWorkspaceRoot = defaultWorkspaceRoot;
    this.#workspace = workspace;
    this.#engine = engine;
    this.#media = media;
    this.#state = DesktopAppStateSchema.parse({
      phase: "A",
      status: "workspace-selection-required",
      workspaceRoot: null,
      initialWorkspaceRoot: defaultWorkspaceRoot,
      adapterMode: "repository",
      repositoryMode: "build-time-checkout",
      runtimePackMode: "host-node-prototype",
      productionAvailable: false,
      deliveryAvailable: false,
      distributionReady: false,
      runtimePackAvailable: false,
      previewCatalog: notLoadedCatalog(),
      catalog: emptyPlayerCatalog(),
      selectedStoryId: null,
      activeWork: false,
      error: null,
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
          selectedStoryId: null,
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
      !this.#state.catalog.entries.some(
        (entry) => entry.storyId === parsedStoryId,
      )
    ) {
      throw new Error("desktop-preview-selection-denied");
    }
    this.#state = DesktopAppStateSchema.parse({
      ...this.#state,
      selectedStoryId: parsedStoryId,
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
          previewCatalog: failedCatalog(),
          catalog: emptyPlayerCatalog(),
          selectedStoryId: null,
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
    const selectedStoryId = snapshot.catalog.entries.some(
      (entry) => entry.storyId === preferredStoryId,
    )
      ? preferredStoryId
      : (snapshot.catalog.entries[0]?.storyId ?? null);
    await this.#media.replaceCatalog(snapshot.catalog);
    this.#state = DesktopAppStateSchema.parse({
      ...this.#state,
      status: "ready",
      previewCatalog: snapshot.previewCatalog,
      catalog: projectPreviewCatalogForPlayer(snapshot.catalog),
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
