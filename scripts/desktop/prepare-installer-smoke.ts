import { resolve } from "node:path";

import {
  persistInitialWorkspacePreference,
  resolveDesktopPreferencesPath,
} from "../../desktop/adapters/app-preferences";

const requiredOption = (name: string) => {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`desktop-installer-smoke-option-required:${name.slice(2)}`);
  }
  return resolve(value);
};

const workspaceRoot = requiredOption("--workspace");
const applicationSupportRoot = requiredOption("--application-support-root");

void persistInitialWorkspacePreference({
  preferencesPath: resolveDesktopPreferencesPath({ applicationSupportRoot }),
  workspaceRoot,
})
  .then(({ preferences }) => {
    process.stdout.write(
      `${JSON.stringify({
        contractVersion: "desktop-installer-smoke-preference-v1",
        workspaceSelected: preferences.workspaceRoot === workspaceRoot,
      })}\n`,
    );
  })
  .catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "desktop-installer-smoke-preparation-failed"}\n`,
    );
    process.exitCode = 1;
  });
