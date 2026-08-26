import { z } from "zod";

import { StoryIdSchema } from "../../src/contracts";
import { DesktopDarwinArchitectureSchema } from "../configuration/darwin-target";
import {
  DesktopProjectStatusSchema,
  PreviewCatalogReadinessSchema,
  PreviewPlayerCatalogSchema,
} from "./preview";
import { DesktopProductionProgressSchema } from "./production-progress";
import { ActiveWorkSummarySchema } from "./protocol";
import type {
  DesktopSettingsSaveRequest,
  DesktopSettingsSaveResult,
  DesktopSettingsSnapshot,
} from "./settings";

export const DESKTOP_SHELL_IPC_CHANNELS = Object.freeze({
  getAppState: "desktop:get-app-state",
  chooseInitialWorkspace: "desktop:choose-initial-workspace",
  showWorkspaceInFinder: "desktop:show-workspace-in-finder",
  migrateWorkspace: "desktop:migrate-workspace",
  refreshPreviewCatalog: "desktop:refresh-preview-catalog",
  recoverPreviewPlayback: "desktop:recover-preview-playback",
  selectPreview: "desktop:select-preview",
  buildDelivery: "desktop:build-delivery",
  deleteProject: "desktop:delete-project",
  getSettings: "desktop:get-settings",
  saveSettings: "desktop:save-settings",
  retryEngine: "desktop:retry-engine",
});

export const DESKTOP_PRELOAD_METHODS = [
  "getAppState",
  "chooseInitialWorkspace",
  "showWorkspaceInFinder",
  "migrateWorkspace",
  "refreshPreviewCatalog",
  "recoverPreviewPlayback",
  "selectPreview",
  "buildDelivery",
  "deleteProject",
  "getSettings",
  "saveSettings",
  "retryEngine",
] as const;

const DesktopHealthSchema = z
  .strictObject({
    runtime: z.enum(["checking", "ready", "unavailable"]),
    agentIntegration: z.enum(["ready", "needs-update"]),
    provider: z.enum(["ready", "not-configured", "unavailable", "unknown"]),
  })
  .readonly();

export const DesktopAppStateSchema = z
  .strictObject({
    phase: z.literal("B"),
    status: z.enum([
      "workspace-selection-required",
      "initializing",
      "loading-catalog",
      "migrating-workspace",
      "ready",
      "fatal",
      "stopping",
    ]),
    workspaceRoot: z.string().min(1).nullable(),
    initialWorkspaceRoot: z.string().min(1),
    adapterMode: z.literal("workspace"),
    runtimePackMode: z.literal("embedded"),
    productionAvailable: z.boolean(),
    deliveryAvailable: z.boolean(),
    deliveryBlocker: z
      .strictObject({
        code: z.string().min(1).max(96),
        message: z.string().min(1).max(500),
      })
      .readonly()
      .nullable(),
    distributionReady: z.literal(false),
    runtimePackAvailable: z.boolean(),
    runtimePack: z
      .strictObject({
        runtimePackId: z.string().regex(/^runtime-pack-[a-f0-9]{64}$/u),
        architecture: DesktopDarwinArchitectureSchema,
      })
      .nullable(),
    health: DesktopHealthSchema,
    previewCatalog: PreviewCatalogReadinessSchema,
    catalog: PreviewPlayerCatalogSchema,
    projects: z.array(DesktopProjectStatusSchema).readonly(),
    productionProgress: z.array(DesktopProductionProgressSchema).readonly(),
    selectedStoryId: StoryIdSchema.nullable(),
    activeWork: ActiveWorkSummarySchema.nullable(),
    error: z.string().min(1).nullable(),
  })
  .superRefine((state, context) => {
    if (
      state.previewCatalog.state === "ready" &&
      (state.previewCatalog.entryCount !== state.catalog.entries.length ||
        state.previewCatalog.unavailableCount !==
          state.catalog.unavailable.length)
    ) {
      context.addIssue({
        code: "custom",
        message: "Preview Catalog readiness counts are stale.",
        path: ["previewCatalog"],
      });
    }
    if (
      state.selectedStoryId !== null &&
      !state.projects.some(({ storyId }) => storyId === state.selectedStoryId)
    ) {
      context.addIssue({
        code: "custom",
        message: "Selected Project must exist in Workspace state.",
        path: ["selectedStoryId"],
      });
    }
    const progressStoryIds = state.productionProgress.map(
      ({ storyId }) => storyId,
    );
    if (
      new Set(progressStoryIds).size !== progressStoryIds.length ||
      progressStoryIds.some(
        (storyId) =>
          !state.projects.some((project) => project.storyId === storyId),
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Production progress must be unique and bound to Workspace Projects.",
        path: ["productionProgress"],
      });
    }
    if (state.runtimePackAvailable !== (state.runtimePack !== null)) {
      context.addIssue({
        code: "custom",
        message: "Runtime Pack availability is inconsistent.",
        path: ["runtimePack"],
      });
    }
    if (
      state.status === "ready" &&
      (!state.productionAvailable ||
        !state.runtimePackAvailable ||
        state.health.runtime !== "ready")
    ) {
      context.addIssue({
        code: "custom",
        message:
          "A ready Phase B shell requires verified runtime capabilities.",
        path: ["status"],
      });
    }
    if (
      state.status === "ready" &&
      state.deliveryAvailable !== (state.deliveryBlocker === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "Delivery capability and blocker are inconsistent.",
        path: ["deliveryAvailable"],
      });
    }
  });

export type DesktopAppState = z.infer<typeof DesktopAppStateSchema>;

export type DesktopShellApi = Readonly<{
  getAppState: () => Promise<DesktopAppState>;
  chooseInitialWorkspace: () => Promise<DesktopAppState>;
  showWorkspaceInFinder: () => Promise<void>;
  migrateWorkspace: () => Promise<DesktopAppState>;
  refreshPreviewCatalog: () => Promise<DesktopAppState>;
  recoverPreviewPlayback: (storyId: string) => Promise<DesktopAppState>;
  selectPreview: (storyId: string) => Promise<DesktopAppState>;
  buildDelivery: (storyId: string) => Promise<DesktopAppState>;
  deleteProject: (storyId: string) => Promise<DesktopAppState>;
  getSettings: () => Promise<DesktopSettingsSnapshot>;
  saveSettings: (
    value: DesktopSettingsSaveRequest,
  ) => Promise<DesktopSettingsSaveResult>;
  retryEngine: () => Promise<DesktopAppState>;
}>;
