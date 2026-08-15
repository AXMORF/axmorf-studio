import { useCallback, useEffect, useRef, useState } from "react";

import type { EnvironmentDiagnostics } from "../../contracts/api";
import { loadEnvironmentDiagnostics } from "../api";

export const useEnvironmentDiagnostics = () => {
  const [diagnostics, setDiagnostics] = useState<EnvironmentDiagnostics | null>(
    null,
  );
  const [status, setStatus] = useState("等待环境诊断…");
  const requestRef = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setStatus("正在运行只读 preflight…");
    loadEnvironmentDiagnostics(controller.signal)
      .then((result) => {
        setDiagnostics(result);
        setStatus(result.status === "pass" ? "环境诊断通过" : "环境需要处理");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setDiagnostics(null);
        setStatus(error instanceof Error ? error.message : "环境诊断失败");
      });
  }, []);

  useEffect(() => {
    refresh();
    return () => requestRef.current?.abort();
  }, [refresh]);

  return { diagnostics, refresh, status } as const;
};
