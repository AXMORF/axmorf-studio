import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  loadAppPreferences,
  persistInitialWorkspacePreference,
  resolveDesktopPreferencesPath,
} from "../../desktop/adapters/app-preferences";
import {
  resolveDefaultWorkspaceRoot,
  resolveWorkspaceSelection,
} from "../../desktop/application/resolve-workspace-selection";

const createFixture = async () => {
  const root = await mkdtemp(join(tmpdir(), "axmorf-workspace-selection-"));
  const homeDirectory = join(root, "home");
  const applicationSupportRoot = join(
    homeDirectory,
    "Library/Application Support/com.axmorf.studio",
  );
  await mkdir(join(homeDirectory, "Movies"), { recursive: true });
  return {
    root,
    homeDirectory,
    applicationSupportRoot,
    preferencesPath: resolveDesktopPreferencesPath({ applicationSupportRoot }),
  };
};

test("initial selection uses the default or one custom Workspace before persistence", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));

  const defaultRoot = resolveDefaultWorkspaceRoot({
    homeDirectory: fixture.homeDirectory,
  });
  const initial = await resolveWorkspaceSelection({
    homeDirectory: fixture.homeDirectory,
    preferencesPath: fixture.preferencesPath,
  });
  assert.deepEqual(initial, {
    workspaceRoot: defaultRoot,
    source: "builtin-default",
    initialized: false,
    canChooseInitialWorkspace: true,
  });

  const customRoot = join(fixture.homeDirectory, "Movies", "Custom Studio");
  const custom = await resolveWorkspaceSelection({
    homeDirectory: fixture.homeDirectory,
    preferencesPath: fixture.preferencesPath,
    requestedWorkspaceRoot: customRoot,
  });
  assert.equal(custom.workspaceRoot, customRoot);
  assert.equal(custom.source, "custom-initial");
  assert.equal(custom.canChooseInitialWorkspace, true);
});

test("preferences are atomic, strict, owner-only, and reject a second authority", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const workspaceRoot = join(fixture.homeDirectory, "Movies", "AXMORF Studio");

  const first = await persistInitialWorkspacePreference({
    preferencesPath: fixture.preferencesPath,
    workspaceRoot,
  });
  assert.equal(first.written, true);
  assert.equal((await stat(fixture.preferencesPath)).mode & 0o777, 0o600);
  assert.equal(
    (await stat(fixture.applicationSupportRoot)).mode & 0o777,
    0o700,
  );
  assert.deepEqual(
    await loadAppPreferences({ preferencesPath: fixture.preferencesPath }),
    {
      schemaVersion: 1,
      contractVersion: "desktop-preferences-v1",
      workspaceRoot,
    },
  );
  assert.deepEqual((await readdir(fixture.applicationSupportRoot)).sort(), [
    "preferences.json",
  ]);
  assert.match(
    await readFile(fixture.preferencesPath, "utf8"),
    /desktop-preferences-v1/u,
  );

  const repeated = await persistInitialWorkspacePreference({
    preferencesPath: fixture.preferencesPath,
    workspaceRoot,
  });
  assert.equal(repeated.written, false);
  await assert.rejects(
    persistInitialWorkspacePreference({
      preferencesPath: fixture.preferencesPath,
      workspaceRoot: join(fixture.homeDirectory, "Movies", "Second Authority"),
    }),
    /switching is unavailable/iu,
  );
  await assert.rejects(
    resolveWorkspaceSelection({
      homeDirectory: fixture.homeDirectory,
      preferencesPath: fixture.preferencesPath,
      requestedWorkspaceRoot: join(
        fixture.homeDirectory,
        "Movies",
        "Second Authority",
      ),
    }),
    /saved Workspace remains authoritative/iu,
  );
});

test("preferences reject symlink parents and non-normalized escape paths", async (context) => {
  const fixture = await createFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const outside = join(fixture.root, "outside");
  const symlinkParent = join(fixture.root, "support-link");
  await mkdir(outside);
  await symlink(outside, symlinkParent);
  await assert.rejects(
    persistInitialWorkspacePreference({
      preferencesPath: join(symlinkParent, "preferences.json"),
      workspaceRoot: join(fixture.homeDirectory, "Movies", "AXMORF Studio"),
    }),
    /unsafe parent/iu,
  );
  assert.deepEqual(await readdir(outside), []);
  await assert.rejects(
    persistInitialWorkspacePreference({
      preferencesPath: `${fixture.applicationSupportRoot}/../preferences.json`,
      workspaceRoot: join(fixture.homeDirectory, "Movies", "AXMORF Studio"),
    }),
    /normalized and absolute/iu,
  );
});
