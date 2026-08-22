import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyWindowOpen,
  installNavigationPolicy,
  installSessionSecurityPolicy,
  isAllowedNavigation,
} from "../../desktop/main/navigation-policy";

test("navigation allows only the exact bundled shell document", () => {
  const shellUrl = "file:///Applications/AXMORF%20Studio.app/index.html";
  assert.equal(isAllowedNavigation(shellUrl, shellUrl), true);
  assert.equal(isAllowedNavigation("file:///tmp/escape.html", shellUrl), false);
  assert.equal(
    isAllowedNavigation("http://127.0.0.1:5173/", "http://127.0.0.1:5173/"),
    true,
  );
  assert.equal(
    isAllowedNavigation(
      "http://127.0.0.1:5173/other",
      "http://127.0.0.1:5173/",
    ),
    false,
  );
  for (const url of [
    "http://127.0.0.1:3100/",
    "http://127.0.0.1:3101/",
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "https://www.remotion.dev/docs/studio",
    "file://user:pass@/Applications/AXMORF%20Studio.app/index.html",
  ]) {
    assert.equal(isAllowedNavigation(url, shellUrl), false);
  }
});

test("popups stay denied and only trusted help opens externally", () => {
  assert.equal(
    classifyWindowOpen("https://www.remotion.dev/docs/studio"),
    "open-external",
  );
  assert.equal(
    classifyWindowOpen("https://www.electronjs.org/docs"),
    "open-external",
  );
  assert.equal(
    classifyWindowOpen("https://www.remotion.dev.evil.test/"),
    "deny",
  );
  assert.equal(classifyWindowOpen("mailto:test@example.com"), "deny");
  assert.equal(
    classifyWindowOpen("axmorf-media://delivery/x/y/video.mp4"),
    "deny",
  );
});

test("installed guards block navigation, downloads, and all permissions", () => {
  let navigateListener:
    | ((event: { preventDefault: () => void; url?: string }) => void)
    | null = null;
  let openHandler: ((details: { url: string }) => { action: "deny" }) | null =
    null;
  const external: string[] = [];
  installNavigationPolicy({
    webContents: {
      id: 1,
      on: (_event, listener) => {
        navigateListener = listener;
      },
      setWindowOpenHandler: (handler) => {
        openHandler = handler;
      },
    },
    shellDocumentUrl: "file:///app/index.html",
    openExternal: (url) => external.push(url),
  });

  let prevented = false;
  assert.ok(navigateListener !== null);
  const navigate = navigateListener as (event: {
    preventDefault: () => void;
    url?: string;
  }) => void;
  navigate({
    url: "https://evil.test/",
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.ok(openHandler !== null);
  const open = openHandler as (details: { url: string }) => { action: "deny" };
  assert.deepEqual(open({ url: "https://www.electronjs.org/docs" }), {
    action: "deny",
  });
  assert.deepEqual(external, ["https://www.electronjs.org/docs"]);

  let downloadListener:
    | ((event: { preventDefault: () => void }) => void)
    | null = null;
  let permissionCheck: ((...args: readonly unknown[]) => boolean) | null = null;
  let permissionRequest:
    | ((
        contents: unknown,
        permission: string,
        callback: (granted: boolean) => void,
        details: unknown,
      ) => void)
    | null = null;
  installSessionSecurityPolicy({
    on: (_event, listener) => {
      downloadListener = listener;
    },
    setPermissionCheckHandler: (handler) => {
      permissionCheck = handler;
    },
    setPermissionRequestHandler: (handler) => {
      permissionRequest = handler;
    },
  });
  let downloadPrevented = false;
  (
    downloadListener as unknown as (event: {
      preventDefault: () => void;
    }) => void
  )({
    preventDefault: () => {
      downloadPrevented = true;
    },
  });
  assert.equal(downloadPrevented, true);
  assert.equal((permissionCheck as unknown as () => boolean)(), false);
  let permissionGranted = true;
  (
    permissionRequest as unknown as (
      contents: unknown,
      permission: string,
      callback: (granted: boolean) => void,
      details: unknown,
    ) => void
  )(null, "media", (granted) => (permissionGranted = granted), null);
  assert.equal(permissionGranted, false);
});
