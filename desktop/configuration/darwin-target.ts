import { z } from "zod";

export const DESKTOP_DARWIN_ARCHITECTURES = ["arm64", "x64"] as const;

export const DesktopDarwinArchitectureSchema = z.enum(
  DESKTOP_DARWIN_ARCHITECTURES,
);

export type DesktopDarwinArchitecture = z.infer<
  typeof DesktopDarwinArchitectureSchema
>;

export type DesktopDarwinTarget = Readonly<{
  platform: "darwin";
  architecture: DesktopDarwinArchitecture;
  unameArchitecture: "arm64" | "x86_64";
  machoArchitecture: "arm64" | "x86_64";
  compositorPackageName:
    | "@remotion/compositor-darwin-arm64"
    | "@remotion/compositor-darwin-x64";
  compositorPackageJson:
    | "@remotion/compositor-darwin-arm64/package.json"
    | "@remotion/compositor-darwin-x64/package.json";
  forgeOutputDirectory: string;
}>;

const DARWIN_TARGETS = Object.freeze({
  arm64: {
    platform: "darwin",
    architecture: "arm64",
    unameArchitecture: "arm64",
    machoArchitecture: "arm64",
    compositorPackageName: "@remotion/compositor-darwin-arm64",
    compositorPackageJson: "@remotion/compositor-darwin-arm64/package.json",
    forgeOutputDirectory: "AXMORF Studio-darwin-arm64",
  },
  x64: {
    platform: "darwin",
    architecture: "x64",
    unameArchitecture: "x86_64",
    machoArchitecture: "x86_64",
    compositorPackageName: "@remotion/compositor-darwin-x64",
    compositorPackageJson: "@remotion/compositor-darwin-x64/package.json",
    forgeOutputDirectory: "AXMORF Studio-darwin-x64",
  },
} satisfies Readonly<Record<DesktopDarwinArchitecture, DesktopDarwinTarget>>);

export const getDesktopDarwinTarget = (
  architecture: unknown,
): DesktopDarwinTarget =>
  DARWIN_TARGETS[DesktopDarwinArchitectureSchema.parse(architecture)];

export const assertDesktopDarwinNativeHost = ({
  expectedArchitecture,
  platform = process.platform,
  architecture = process.arch,
}: {
  readonly expectedArchitecture: DesktopDarwinArchitecture;
  readonly platform?: NodeJS.Platform;
  readonly architecture?: string;
}) => {
  const expected = getDesktopDarwinTarget(expectedArchitecture);
  if (
    platform !== expected.platform ||
    architecture !== expected.architecture
  ) {
    throw new Error("desktop-darwin-native-host-required");
  }
  return expected;
};
