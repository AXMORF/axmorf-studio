import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { z } from "zod";

/** Identifies the process holding the Workspace operation lock. */
export const ProcessOwnershipSchema = z
  .object({
    hostname: z.string().min(1),
    pid: z.number().int().positive(),
    instanceId: z.string().uuid(),
  })
  .strict();
export type ProcessOwnership = z.infer<typeof ProcessOwnershipSchema>;
const ownership: ProcessOwnership = {
  hostname: hostname(),
  pid: process.pid,
  instanceId: randomUUID(),
};
export const getProcessOwnership = (): ProcessOwnership => ({ ...ownership });
export const inspectProcessOwnership = (
  owner: ProcessOwnership,
): "active" | "exited" | "unknown" => {
  if (owner.hostname !== hostname()) return "unknown";
  try {
    process.kill(owner.pid, 0);
    return "active";
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH"
      ? "exited"
      : "unknown";
  }
};
