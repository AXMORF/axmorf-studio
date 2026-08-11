import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { NarrationSpecSchema } from "../src/contracts/narration";
import {
  readProducerConfig,
  resolveDefaultTtsProvider,
  resolveProducerConfigPathFromEnvironment,
  toVoxcpmPrivateConfig,
} from "../scripts/config/producer-config";
import { resolveVoxcpmProfileMetadata } from "../scripts/narration/adapters/private-config";
import { preflightRemotionBrowser } from "../scripts/production/adapters/remotion-process";
import {
  preflightVoxcpm,
  type VoxcpmProbe,
} from "../scripts/production/adapters/voxcpm-preflight";
import type { SafeEnvironmentDiagnostics } from "./api";

const probe: VoxcpmProbe = async ({ baseUrl, route, token, timeoutMs }) => {
  const response = await fetch(new URL(route, `${baseUrl}/`), {
    method: "GET",
    redirect: "manual",
    ...(token === undefined
      ? {}
      : { headers: { Authorization: `Bearer ${token}` } }),
    signal: AbortSignal.timeout(Math.min(timeoutMs, 5_000)),
  });
  let body: unknown;
  try {
    body = JSON.parse(await response.text());
  } catch {
    body = undefined;
  }
  return { status: response.status, body };
};

type Check = SafeEnvironmentDiagnostics["checks"][number];

export const runProducerEnvironmentDiagnostics = async ({
  rootDir,
  env,
  voxcpmProbe = probe,
  browserPreflight = preflightRemotionBrowser,
}: {
  readonly rootDir: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly voxcpmProbe?: VoxcpmProbe;
  readonly browserPreflight?: typeof preflightRemotionBrowser;
}): Promise<SafeEnvironmentDiagnostics> => {
  let config;
  try {
    config = await readProducerConfig({
      configPath: await resolveProducerConfigPathFromEnvironment({
        rootDir,
        env,
      }),
    });
  } catch {
    return {
      schemaVersion: 1,
      status: "attention",
      checks: [
        {
          id: "producer-config",
          status: "fail",
          summary: "制作配置不可用。",
          remediation: "修复配置路径或严格校验错误后重新诊断。",
        },
      ],
    };
  }
  const checks: Check[] = [
    {
      id: "producer-config",
      status: "pass",
      summary: "制作配置结构与 fingerprint 有效。",
      remediation: null,
    },
  ];
  const bgm = config.audioDefaults?.globalBgm;
  if (bgm === null || bgm === undefined) {
    checks.push({
      id: "global-bgm",
      status: "pass",
      summary: "未配置全局 BGM 预设。",
      remediation: null,
    });
  } else {
    try {
      const unresolvedSourcePath = resolve(rootDir, bgm.sourcePath);
      const [repositoryPath, sourcePath, source] = await Promise.all([
        realpath(rootDir),
        realpath(unresolvedSourcePath),
        lstat(unresolvedSourcePath),
      ]);
      const sourcePathFromRepository = relative(repositoryPath, sourcePath);
      if (
        sourcePathFromRepository === "" ||
        sourcePathFromRepository.startsWith("..") ||
        isAbsolute(sourcePathFromRepository) ||
        !source.isFile() ||
        source.isSymbolicLink()
      ) {
        throw new Error("BGM source is not a regular file.");
      }
      checks.push({
        id: "global-bgm",
        status: "pass",
        summary: "全局 BGM 预设文件可访问。",
        remediation: null,
      });
    } catch {
      checks.push({
        id: "global-bgm",
        status: "fail",
        summary: "全局 BGM 预设文件不可访问。",
        remediation: "修复仓库相对文件位置或权限后重新诊断。",
      });
    }
  }
  let metadata;
  try {
    const provider = resolveDefaultTtsProvider(config);
    metadata = await resolveVoxcpmProfileMetadata({
      config: toVoxcpmPrivateConfig(provider, rootDir),
      narration: NarrationSpecSchema.parse({
        schemaVersion: 2,
        voiceProfileId: config.tts.defaultVoiceProfileId,
        mode: "voice-clone",
      }),
      rootDir,
    });
    checks.push({
      id: "voice-profile",
      status: "pass",
      summary: "默认声线来源可访问。",
      remediation: null,
    });
  } catch {
    checks.push({
      id: "voice-profile",
      status: "fail",
      summary: "默认声线来源不可访问或受保护。",
      remediation: "修复默认声线选择与本地来源权限后重新诊断。",
    });
  }
  if (metadata !== undefined) {
    const result = await preflightVoxcpm({
      requirementsFingerprint: config.configFingerprint,
      metadata,
      probe: voxcpmProbe,
    });
    checks.push(
      result.status === "pass"
        ? {
            id: "voxcpm",
            status: "pass",
            summary: `VoxCPM 状态可用于生产：${result.serviceState}。`,
            remediation: null,
          }
        : {
            id: "voxcpm",
            status: "fail",
            summary: result.summary,
            remediation: result.remediation,
          },
    );
  }
  const browser = await browserPreflight({
    rootDir,
    requirementsFingerprint: config.configFingerprint,
  });
  checks.push(
    browser.status === "pass"
      ? {
          id: "remotion-browser",
          status: "pass",
          summary: "Remotion 宿主浏览器 preflight 通过。",
          remediation: null,
        }
      : {
          id: "remotion-browser",
          status: "fail",
          summary: browser.summary,
          remediation: browser.remediation,
        },
  );
  return {
    schemaVersion: 1,
    status: checks.every(({ status }) => status === "pass")
      ? "pass"
      : "attention",
    checks,
  };
};
