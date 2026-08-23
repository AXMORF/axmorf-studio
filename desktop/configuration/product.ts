import { z } from "zod";

import {
  DesktopDarwinArchitectureSchema,
  type DesktopDarwinArchitecture,
} from "./darwin-target";

export const DESKTOP_PRODUCT_NAME = "AXMORF Studio" as const;
export const DESKTOP_PRODUCT_FILE_STEM = "AXMORF-Studio" as const;
export const DESKTOP_BUNDLE_ID = "com.axmorf.studio" as const;
export const DESKTOP_MINIMUM_MACOS_VERSION = "13.0" as const;

export const DesktopAppVersionSchema = z
  .string()
  .regex(/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u);

export const createDesktopUnsignedDmgFileName = ({
  appVersion: rawAppVersion,
  architecture: rawArchitecture,
}: {
  readonly appVersion: string;
  readonly architecture: DesktopDarwinArchitecture | string;
}) => {
  const appVersion = DesktopAppVersionSchema.parse(rawAppVersion);
  const architecture = DesktopDarwinArchitectureSchema.parse(rawArchitecture);
  return `${DESKTOP_PRODUCT_FILE_STEM}-${appVersion}-mac-${architecture}-full-unsigned.dmg`;
};

export const createDesktopUnsignedDmgVolumeName = (
  rawArchitecture: DesktopDarwinArchitecture | string,
) => {
  const architecture = DesktopDarwinArchitectureSchema.parse(rawArchitecture);
  return `${DESKTOP_PRODUCT_NAME} ${architecture}`;
};
