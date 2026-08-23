export type { NativeSmokeOptions } from "./native-smoke";

export const resolveNativeSmokeOptions = () => null;

export const ensureNativeSmokeProducerConfig = async () => {
  throw new Error("desktop-native-smoke-not-in-build");
};

export const runPackagedNativeSmoke = async () => {
  throw new Error("desktop-native-smoke-not-in-build");
};
