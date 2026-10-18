export type WebApiRequest = Readonly<{
  method: string | undefined;
  url: string | undefined;
  headers: Readonly<Record<string, string | undefined>>;
  body?: string;
}>;

export type WebApiResponse = Readonly<{
  statusCode: number;
  body: unknown;
}>;

export type StartWebControlCenterInput = Readonly<{
  rootDir: string;
  assetsDir: string;
  port?: number;
  studioUrl?: string;
  api: (request: WebApiRequest) => Promise<WebApiResponse>;
}>;

export type RunningWebControlCenter = Readonly<{
  url: string;
  port: number;
  close: () => Promise<void>;
}>;
