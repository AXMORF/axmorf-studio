export const buildStudioUrl = (currentUrl: string) => {
  const url = new URL(currentUrl);
  url.port = "3101";
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString();
};

export const isLanAccessHostname = (hostname: string) =>
  !["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname);
