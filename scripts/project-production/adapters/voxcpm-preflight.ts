import { isIP } from "node:net";
import type { VoxcpmProfileMetadata } from "../../narration/adapters/private-config";

export const VOXCPM_HEALTH_ROUTE = "/health" as const; export const VOXCPM_READY_ROUTE = "/ready" as const; export const VOXCPM_INFO_ROUTE = "/info" as const;
export type VoxcpmProbe = (input: Readonly<{ baseUrl: string; route: typeof VOXCPM_HEALTH_ROUTE | typeof VOXCPM_READY_ROUTE | typeof VOXCPM_INFO_ROUTE; token?: string; timeoutMs: number }>) => Promise<Readonly<{ status: number; body: unknown }>>;
type Failure = Readonly<{ status: "failed"; domain: "voxcpm"; summary: string; remediation: string }>;
const failed = (summary: string, remediation: string): Failure => ({ status: "failed", domain: "voxcpm", summary, remediation });
const loopback = (raw: string) => { const url = new URL(raw); const family = isIP(url.hostname); return (family === 4 && url.hostname.startsWith("127.")) || (family === 6 && ["::1", "[::1]"].includes(url.hostname)); };
export const preflightVoxcpm = async ({ metadata, probe }: { readonly requirementsFingerprint: string; readonly metadata: VoxcpmProfileMetadata; readonly probe: VoxcpmProbe }) => {
  if (!loopback(metadata.baseUrl)) return failed("VoxCPM 不是 loopback 服务。", "配置本地语音服务地址。");
  let health; try { health = await probe({ baseUrl: metadata.baseUrl, route: VOXCPM_HEALTH_ROUTE, ...(metadata.token === undefined ? {} : { token: metadata.token }), timeoutMs: metadata.timeoutMs }); } catch { return failed("VoxCPM liveness 不可达。", "恢复本地语音服务访问。"); }
  if (health.status !== 200 || health.body === null || typeof health.body !== "object" || (health.body as { status?: unknown }).status !== "ok") return failed("VoxCPM liveness 响应不兼容。", "恢复支持的服务合同。");
  let ready; try { ready = await probe({ baseUrl: metadata.baseUrl, route: VOXCPM_READY_ROUTE, ...(metadata.token === undefined ? {} : { token: metadata.token }), timeoutMs: metadata.timeoutMs }); } catch { return failed("VoxCPM readiness 不可达。", "恢复本地语音服务访问。"); }
  const detail = ready.body !== null && typeof ready.body === "object" ? (ready.body as { detail?: unknown }).detail : null;
  const record = detail !== null && typeof detail === "object" ? detail as Record<string, unknown> : {};
  const resident = ready.status === 200 && ready.body !== null && typeof ready.body === "object" && (ready.body as { ready?: unknown }).ready === true;
  const loading = ready.status === 503 && record.status === "loading"; const offloaded = ready.status === 503 && record.status === "offloaded";
  if (!resident && !loading && !offloaded) return failed("VoxCPM readiness 响应不兼容。", "恢复支持的服务合同。");
  if (metadata.denoise && resident && (ready.body as { denoiser_ready?: unknown }).denoiser_ready === false) return failed("VoxCPM denoiser 不可用。", "加载受支持的 denoiser。");
  return { status: "pass" as const, domain: "voxcpm" as const, serviceState: resident ? "resident-ready" as const : loading ? "loading" as const : "offloaded-auto-reload-on-first-generation" as const, profileMode: metadata.mode };
};
