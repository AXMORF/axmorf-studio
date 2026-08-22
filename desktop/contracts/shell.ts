import { z } from "zod";

import { StoryIdSchema } from "../../src/contracts";
import {
  PreviewCatalogReadinessSchema,
  PreviewPlayerCatalogSchema,
} from "./preview";

export const DESKTOP_SHELL_IPC_CHANNELS = Object.freeze({
  getAppState: "desktop:get-app-state",
  chooseInitialWorkspace: "desktop:choose-initial-workspace",
  showWorkspaceInFinder: "desktop:show-workspace-in-finder",
  refreshPreviewCatalog: "desktop:refresh-preview-catalog",
  selectPreview: "desktop:select-preview",
  retryEngine: "desktop:retry-engine",
});

export const DESKTOP_PRELOAD_METHODS = [
  "getAppState",
  "chooseInitialWorkspace",
  "showWorkspaceInFinder",
  "refreshPreviewCatalog",
  "selectPreview",
  "retryEngine",
] as const;

export const DesktopAppStateSchema = z
  .strictObject({
    phase: z.literal("A"),
    status: z.enum([
      "workspace-selection-required",
      "initializing",
      "loading-catalog",
      "ready",
      "fatal",
      "stopping",
    ]),
    workspaceRoot: z.string().min(1).nullable(),
    initialWorkspaceRoot: z.string().min(1),
    adapterMode: z.literal("repository"),
    repositoryMode: z.literal("build-time-checkout"),
    runtimePackMode: z.literal("host-node-prototype"),
    productionAvailable: z.literal(false),
    deliveryAvailable: z.literal(false),
    distributionReady: z.literal(false),
    runtimePackAvailable: z.literal(false),
    previewCatalog: PreviewCatalogReadinessSchema,
    catalog: PreviewPlayerCatalogSchema,
    selectedStoryId: StoryIdSchema.nullable(),
    activeWork: z.literal(false),
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
      !state.catalog.entries.some(
        ({ storyId }) => storyId === state.selectedStoryId,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Selected preview must exist in the playable Catalog.",
        path: ["selectedStoryId"],
      });
    }
  });

export type DesktopAppState = z.infer<typeof DesktopAppStateSchema>;

export type DesktopShellApi = Readonly<{
  getAppState: () => Promise<DesktopAppState>;
  chooseInitialWorkspace: () => Promise<DesktopAppState>;
  showWorkspaceInFinder: () => Promise<void>;
  refreshPreviewCatalog: () => Promise<DesktopAppState>;
  selectPreview: (storyId: string) => Promise<DesktopAppState>;
  retryEngine: () => Promise<DesktopAppState>;
}>;
