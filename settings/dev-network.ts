export const isLanDevEnabled = (
  env: Readonly<Record<string, string | undefined>>,
) => env.RSP_DEV_LAN === "1";

export const isSameOriginSettingsWrite = ({
  origin,
  host,
}: {
  readonly origin: string | undefined;
  readonly host: string | undefined;
}) => origin !== undefined && host !== undefined && origin === `http://${host}`;
