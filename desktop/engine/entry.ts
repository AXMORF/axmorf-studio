export const DESKTOP_ENGINE_ENTRY_ID = "desktop-engine-phase-a-v1" as const;

if (process.parentPort !== undefined) {
  process.parentPort.postMessage({
    type: "bootstrap",
    entryId: DESKTOP_ENGINE_ENTRY_ID,
  });
}
