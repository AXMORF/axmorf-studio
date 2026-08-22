export const DESKTOP_EXTERNAL_HELP_ORIGINS = Object.freeze([
  "https://www.electronjs.org",
  "https://www.remotion.dev",
] as const);

export type WindowOpenDecision = "deny" | "open-external";

const parseUrl = (value: string) => {
  try {
    const url = new URL(value);
    if (url.username !== "" || url.password !== "") return null;
    return url;
  } catch {
    return null;
  }
};

export const isAllowedNavigation = (
  targetUrl: string,
  shellDocumentUrl: string,
) => {
  const target = parseUrl(targetUrl);
  const shellDocument = parseUrl(shellDocumentUrl);
  if (
    target === null ||
    shellDocument === null ||
    target.protocol !== shellDocument.protocol
  ) {
    return false;
  }
  return target.href === shellDocument.href;
};

export const classifyWindowOpen = (targetUrl: string): WindowOpenDecision => {
  const target = parseUrl(targetUrl);
  if (
    target !== null &&
    target.protocol === "https:" &&
    DESKTOP_EXTERNAL_HELP_ORIGINS.includes(
      target.origin as (typeof DESKTOP_EXTERNAL_HELP_ORIGINS)[number],
    )
  ) {
    return "open-external";
  }
  return "deny";
};

type PreventableEvent = Readonly<{ preventDefault: () => void; url?: string }>;

export type GuardedWebContents = Readonly<{
  id: number;
  on: (
    event: "will-navigate",
    listener: (event: PreventableEvent, legacyUrl?: string) => void,
  ) => void;
  setWindowOpenHandler: (
    handler: (
      details: Readonly<{ url: string }>,
    ) => Readonly<{ action: "deny" }>,
  ) => void;
}>;

export const installNavigationPolicy = ({
  webContents,
  shellDocumentUrl,
  openExternal,
}: Readonly<{
  webContents: GuardedWebContents;
  shellDocumentUrl: string;
  openExternal: (url: string) => void;
}>) => {
  webContents.on("will-navigate", (event, legacyUrl) => {
    const targetUrl = event.url ?? legacyUrl ?? "";
    if (!isAllowedNavigation(targetUrl, shellDocumentUrl)) {
      event.preventDefault();
    }
  });
  webContents.setWindowOpenHandler(({ url }) => {
    if (classifyWindowOpen(url) === "open-external") openExternal(url);
    return { action: "deny" };
  });
};

export type GuardedSession = Readonly<{
  on: (
    event: "will-download",
    listener: (event: PreventableEvent) => void,
  ) => void;
  setPermissionCheckHandler: (
    handler: (...args: readonly unknown[]) => boolean,
  ) => void;
  setPermissionRequestHandler: (
    handler: (
      webContents: unknown,
      permission: string,
      callback: (granted: boolean) => void,
      details: unknown,
    ) => void,
  ) => void;
}>;

export const installSessionSecurityPolicy = (session: GuardedSession) => {
  session.on("will-download", (event) => event.preventDefault());
  session.setPermissionCheckHandler(() => false);
  session.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
};
