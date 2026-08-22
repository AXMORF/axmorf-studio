import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DESKTOP_PHASE_A_REPOSITORY_ROOT = realpathSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "../.."),
);
