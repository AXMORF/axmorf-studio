import { z } from "zod";

import {
  DesktopDarwinArchitectureSchema,
  getDesktopDarwinTarget,
  type DesktopDarwinArchitecture,
  type DesktopDarwinTarget,
} from "./darwin-target";

export const DesktopNativePlatformSchema = z.enum(["darwin", "linux"]);
export const DesktopNativeArchitectureSchema = DesktopDarwinArchitectureSchema;

export type DesktopNativePlatform = z.infer<typeof DesktopNativePlatformSchema>;
export type DesktopNativeArchitecture = DesktopDarwinArchitecture;

export type DesktopLinuxTarget = Readonly<{
  platform: "linux";
  architecture: "x64";
  libc: "glibc";
  compositorPackageName: "@remotion/compositor-linux-x64-gnu";
  compositorPackageJson: "@remotion/compositor-linux-x64-gnu/package.json";
  forgeOutputDirectory: "AXMORF Studio-linux-x64";
}>;

export type DesktopNativeTarget = DesktopDarwinTarget | DesktopLinuxTarget;

const LINUX_X64_TARGET: DesktopLinuxTarget = Object.freeze({
  platform: "linux",
  architecture: "x64",
  libc: "glibc",
  compositorPackageName: "@remotion/compositor-linux-x64-gnu",
  compositorPackageJson: "@remotion/compositor-linux-x64-gnu/package.json",
  forgeOutputDirectory: "AXMORF Studio-linux-x64",
});

export const DESKTOP_NATIVE_TARGETS: readonly DesktopNativeTarget[] = [
  getDesktopDarwinTarget("arm64"),
  getDesktopDarwinTarget("x64"),
  LINUX_X64_TARGET,
];

export const getDesktopNativeTarget = ({
  platform: rawPlatform,
  architecture: rawArchitecture,
}: {
  readonly platform: unknown;
  readonly architecture: unknown;
}): DesktopNativeTarget => {
  const platform = DesktopNativePlatformSchema.parse(rawPlatform);
  const architecture = DesktopNativeArchitectureSchema.parse(rawArchitecture);
  if (platform === "darwin") return getDesktopDarwinTarget(architecture);
  if (architecture === "x64") return LINUX_X64_TARGET;
  throw new Error("desktop-linux-architecture-unsupported");
};

export const assertDesktopNativeHost = ({
  expectedPlatform,
  expectedArchitecture,
  platform = process.platform,
  architecture = process.arch,
}: {
  readonly expectedPlatform: DesktopNativePlatform;
  readonly expectedArchitecture: DesktopNativeArchitecture;
  readonly platform?: NodeJS.Platform;
  readonly architecture?: string;
}) => {
  const target = getDesktopNativeTarget({
    platform: expectedPlatform,
    architecture: expectedArchitecture,
  });
  if (platform !== target.platform || architecture !== target.architecture) {
    throw new Error("desktop-native-host-required");
  }
  return target;
};
