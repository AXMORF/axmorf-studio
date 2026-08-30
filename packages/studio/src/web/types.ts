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

export type CurrentDelivery = Readonly<{
  storyId: string;
  revisionId: string;
  deliveryBuildId: string;
  artifacts: Readonly<{
    video: Readonly<{ sizeBytes: number }>;
    cover4x3: Readonly<{ sizeBytes: number }>;
    cover3x4: Readonly<{ sizeBytes: number }>;
  }>;
}>;

export type StartWebControlCenterInput = Readonly<{
  rootDir: string;
  assetsDir: string;
  port?: number;
  studioUrl?: string;
  api: (request: WebApiRequest) => Promise<WebApiResponse>;
  inspectCurrentDelivery: (input: {
    readonly rootDir: string;
    readonly storyId: string;
  }) => Promise<CurrentDelivery | null>;
  readCurrentRevision: (input: {
    readonly rootDir: string;
    readonly projectId: string;
  }) => Promise<Readonly<{ revisionId: string }>>;
}>;

export type RunningWebControlCenter = Readonly<{
  url: string;
  port: number;
  close: () => Promise<void>;
}>;
