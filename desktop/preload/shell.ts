import { contextBridge } from "electron";

export const DESKTOP_PRELOAD_ENTRY_ID = "desktop-preload-phase-a-v1" as const;

contextBridge.exposeInMainWorld(
  "axmorfStudio",
  Object.freeze({
    phase: "A",
    adapterMode: "repository",
  }),
);
