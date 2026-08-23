import type { WorkspaceDeliveryLifecyclePort } from "../../scripts/project-production/adapters/workspace-remotion-renderer";

export const createWorkspaceDeliveryLifecycle =
  (): WorkspaceDeliveryLifecyclePort =>
    Object.freeze({
      onListenerReady: async () => "continue" as const,
      onListenerClosed: async () => undefined,
    });
