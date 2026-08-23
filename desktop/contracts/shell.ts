import { z } from "zod";

import { StoryIdSchema } from "../../src/contracts";
import {
  DesktopProjectStatusSchema,
  PreviewCatalogReadinessSchema,
  PreviewPlayerCatalogSchema,
} from "./preview";
import { ActiveWorkSummarySchema } from "./protocol";

export const DESKTOP_SHELL_IPC_CHANNELS = Object.freeze({
  getAppState: "desktop:get-app-state",
  chooseInitialWorkspace: "desktop:choose-initial-workspace",
  showWorkspaceInFinder: "desktop:show-workspace-in-finder",
  migrateWorkspace: "desktop:migrate-workspace",
  refreshPreviewCatalog: "desktop:refresh-preview-catalog",
  selectPreview: "desktop:select-preview",
  buildDelivery: "desktop:build-delivery",
  getProviderSettings: "desktop:get-provider-settings",
  saveProviderSettings: "desktop:save-provider-settings",
  retryEngine: "desktop:retry-engine",
});

export const DESKTOP_PRELOAD_METHODS = [
  "getAppState",
  "chooseInitialWorkspace",
  "showWorkspaceInFinder",
  "migrateWorkspace",
  "refreshPreviewCatalog",
  "selectPreview",
  "buildDelivery",
  "getProviderSettings",
  "saveProviderSettings",
  "retryEngine",
] as const;

export const DesktopProviderSettingsSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    status: z.enum(["ready", "not-configured", "unavailable"]),
    defaultProviderId: z.string().min(1).nullable(),
    providers: z
      .array(
        z
          .strictObject({
            id: z.string().min(1),
            name: z.string().min(1),
            kind: z.enum(["voxcpm", "edge-tts", "speech-sdk"]),
          })
          .readonly(),
      )
      .readonly(),
  })
  .readonly();

export type DesktopProviderSettings = z.infer<
  typeof DesktopProviderSettingsSchema
>;

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
        architecture: z.literal("arm64"),
      })
      .nullable(),
    health: DesktopHealthSchema,
    previewCatalog: PreviewCatalogReadinessSchema,
    catalog: PreviewPlayerCatalogSchema,
    projects: z.array(DesktopProjectStatusSchema).readonly(),
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
  selectPreview: (storyId: string) => Promise<DesktopAppState>;
  buildDelivery: (storyId: string) => Promise<DesktopAppState>;
  getProviderSettings: () => Promise<DesktopProviderSettings>;
  saveProviderSettings: (value: unknown) => Promise<DesktopAppState>;
  retryEngine: () => Promise<DesktopAppState>;
}>;
