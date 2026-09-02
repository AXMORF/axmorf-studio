import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";

export const RUNTIME_PACKAGE_NAME = "@axmorf/studio";

const APPLICATION_DEPENDENCIES = Object.freeze({
  "@react-three/fiber": "9.6.1",
  "@remotion/cli": "4.0.489",
  "@remotion/effects": "4.0.489",
  "@remotion/gif": "4.0.489",
  "@remotion/google-fonts": "4.0.489",
  "@remotion/layout-utils": "4.0.489",
  "@remotion/light-leaks": "4.0.489",
  "@remotion/lottie": "4.0.489",
  "@remotion/media": "4.0.489",
  "@remotion/motion-blur": "4.0.489",
  "@remotion/paths": "4.0.489",
  "@remotion/renderer": "4.0.489",
  "@remotion/shapes": "4.0.489",
  "@remotion/tailwind-v4": "4.0.489",
  "@remotion/three": "4.0.489",
  "@remotion/transitions": "4.0.489",
  "@speech-sdk/core": "0.27.0",
  "lottie-web": "5.13.0",
  "node-edge-tts": "1.2.10",
  ogl: "1.0.11",
  react: "19.2.3",
  "react-dom": "19.2.3",
  remotion: "4.0.489",
  three: "0.185.0",
  zod: "4.3.6",
});

const APPLICATION_DEV_DEPENDENCIES = Object.freeze({
  "@types/node": "20.19.19",
  "@types/react": "19.2.7",
  "@types/react-dom": "19.2.3",
  tailwindcss: "4.2.0",
  typescript: "5.9.3",
});

const APPLICATION_OVERRIDES = Object.freeze({
  "fast-uri": "3.1.6",
  nanoid: "3.3.18",
});

const SCRIPTS = Object.freeze({
  bootstrap: "axmorf bootstrap",
  doctor: "axmorf doctor",
  web: "axmorf web",
  preview: "axmorf preview",
  dev: "axmorf dev",
  compositions: "remotion compositions src/index.ts",
  "project:create": "axmorf project create",
  "project:revise:context": "axmorf project revise context",
  "project:revise:validate": "axmorf project revise validate",
  "project:revise": "axmorf project revise create",
  "project:revision:promote": "axmorf project revision promote",
  "project:originality:freeze": "axmorf project originality freeze",
  "project:execution:resolve": "axmorf project execution resolve",
  "project:produce:inspect": "axmorf project produce inspect",
  "project:produce:prepare": "axmorf project produce prepare",
  "project:task:bind": "axmorf project task bind",
  "project:task:describe": "axmorf project task describe",
  "project:task:finalize": "axmorf project task finalize",
  "project:task:check": "axmorf project task check",
  "project:task:commit": "axmorf project task commit",
  "project:task:fail": "axmorf project task fail",
  "project:task:file-read": "axmorf project task file-read",
  "project:task:file-write": "axmorf project task file-write",
  "project:attempt:recover-inspect": "axmorf project attempt recover-inspect",
  "project:attempt:reissue": "axmorf project attempt reissue",
  "project:produce:continue": "axmorf project produce continue",
  "project:delete": "axmorf project delete",
  "project:asset:import": "axmorf project asset import",
  "project:check": "axmorf project check",
});

const canonicalJson = (value) => {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  throw new Error(`Cannot serialize ${typeof value} as canonical JSON.`);
};

const fingerprint = (namespace, version, value) =>
  `sha256:${createHash("sha256")
    .update(canonicalJson({ namespace, value, version }))
    .digest("hex")}`;

export const normalizeRuntimePackage = (value, cwd) => {
  if (value.trim() === "")
    throw new Error("Runtime package must not be empty.");
  if (value.startsWith("file:")) {
    const filePath = value.slice("file:".length);
    return `file:${isAbsolute(filePath) ? filePath : resolve(cwd, filePath)}`;
  }
  if (isAbsolute(value) || value.startsWith("./") || value.startsWith("../")) {
    return `file:${resolve(cwd, value)}`;
  }
  if (/^[~^*><=]/u.test(value) || value.includes(" || ")) {
    throw new Error(
      "Runtime package must be an exact version or a local package path.",
    );
  }
  return value;
};

export const createPackageJson = ({ name, runtimePackage }) => ({
  name,
  version: "0.1.0",
  private: true,
  license: "UNLICENSED",
  type: "module",
  scripts: SCRIPTS,
  dependencies: {
    ...APPLICATION_DEPENDENCIES,
    [RUNTIME_PACKAGE_NAME]: runtimePackage,
  },
  devDependencies: APPLICATION_DEV_DEPENDENCIES,
  overrides: APPLICATION_OVERRIDES,
  axmorf: {
    workspaceVersion: 1,
  },
});

export const createSafeProducerConfig = () => {
  const input = {
    schemaVersion: 4,
    contractVersion: "producer-config-v4",
    renderDefaults: {
      width: 1080,
      height: 1920,
      fps: 30,
      locale: "zh-CN",
    },
    readability: { edgeInsetPx: 90 },
    sceneDefaults: {
      introSceneTemplateId: "axmorf-brand-reveal-v1",
      outroSceneTemplateId: "axmorf-source-follow-v1",
    },
    audioDefaults: { globalBgm: null },
    publishingCollections: [
      {
        id: "default",
        name: "Default",
        description: "Default publishing collection for this workspace.",
      },
    ],
    tts: {
      defaultProviderId: "edge-tts",
      defaultVoiceProfileId: "xiaoxiao",
      speech: { rate: 1, targetLoudnessLufs: -16 },
      providers: [
        {
          id: "edge-tts",
          kind: "edge-tts",
          service: "microsoft-edge-read-aloud",
          name: "Edge Read Aloud",
          connection: { timeoutMs: 60_000 },
          modelId: "edge-read-aloud",
          voiceProfiles: [
            {
              id: "xiaoxiao",
              name: "晓晓",
              voiceId: "zh-CN-XiaoxiaoNeural",
              locale: "zh-CN",
            },
          ],
        },
      ],
    },
  };
  return {
    ...input,
    configFingerprint: fingerprint("producer-config", 4, input),
  };
};

export const createEmptyResourceCatalog = () => {
  const input = {
    schemaVersion: 1,
    generatorId: "resource-catalog-generator-v1",
    entries: [],
  };
  return {
    ...input,
    catalogFingerprint: fingerprint("resource-catalog", 1, {
      generatorId: input.generatorId,
      orderedDescriptorFingerprints: [],
    }),
  };
};
