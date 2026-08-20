import { runMediaProcess } from "../../shared/media-process";
import type { ProcessRunner } from "../../shared/process";
import { resolveRemotionCommand } from "../../shared/remotion-command";

export type RemotionBrowserPreflightResult = Readonly<{ status: "pass"; domain: "remotion-browser" }> | Readonly<{ status: "failed"; domain: "remotion-browser"; summary: string; remediation: string }>;
export const preflightRemotionBrowser = async ({ rootDir, runProcess = runMediaProcess }: { readonly rootDir: string; readonly requirementsFingerprint: string; readonly runProcess?: ProcessRunner }): Promise<RemotionBrowserPreflightResult> => {
  try {
    const result = await runProcess(resolveRemotionCommand(rootDir), ["compositions", "src/remotion/preflight/index.tsx"]);
    if (result.status === 0) return { status: "pass", domain: "remotion-browser" };
    const output = `${result.stderr}\n${result.stdout}`.slice(0, 32768);
    if (/sandbox_host_linux\.cc|Failed to move to new namespace|Operation not permitted|EACCES|permission denied/iu.test(output)) return { status: "failed", domain: "remotion-browser", summary: "Remotion 宿主浏览器权限不可用。", remediation: "恢复宿主浏览器权限且不要降低 sandbox。" };
    return { status: "failed", domain: "remotion-browser", summary: "Remotion 固定 preflight 失败。", remediation: "检查固定 Remotion 命令与 Composition。" };
  } catch { return { status: "failed", domain: "remotion-browser", summary: "Remotion 浏览器不可用。", remediation: "恢复宿主 Remotion 浏览器环境。" }; }
};
