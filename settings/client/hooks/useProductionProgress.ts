import { useCallback, useEffect, useRef, useState } from "react";

import type { ProductionProgressResponse } from "../../contracts/api";
import { loadProductionProgress, requestProjectDeletion } from "../api";
import { projectDeletionErrorMessage } from "../model";

export const beginProductionProgressRequest = ({
  deleting,
  request,
}: {
  readonly deleting: boolean;
  readonly request: AbortController | null;
}) => (deleting || request !== null ? null : new AbortController());

export const useProductionProgress = () => {
  const [progress, setProgress] = useState<ProductionProgressResponse | null>(
    null,
  );
  const [status, setStatus] = useState("正在读取 Project 生产与交付…");
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const deletionInProgress = useRef(false);

  const refresh = useCallback(async () => {
    const controller = beginProductionProgressRequest({
      deleting: deletionInProgress.current,
      request: request.current,
    });
    if (controller === null) return;
    request.current = controller;
    try {
      const result = await loadProductionProgress(controller.signal);
      if (controller.signal.aborted) return;
      setProgress(result);
      setError(null);
      setStatus(
        result.projects.length === 0 ? "暂无 Project" : "Project 状态已更新",
      );
    } catch (caught) {
      if (controller.signal.aborted) return;
      const message =
        caught instanceof Error ? caught.message : "Project 状态读取失败";
      setProgress(null);
      setError(message);
      setStatus(message);
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, []);

  const deleteProject = useCallback(
    async (projectId: string, confirmation: string) => {
      let failure: unknown = null;
      deletionInProgress.current = true;
      request.current?.abort();
      setStatus(`正在删除 ${projectId}…`);
      try {
        await requestProjectDeletion(projectId, confirmation);
        setStatus(`${projectId} 已删除`);
      } catch (caught) {
        failure = caught;
        setStatus(projectDeletionErrorMessage(caught));
      } finally {
        deletionInProgress.current = false;
      }
      await refresh();
      if (failure !== null) {
        setStatus(projectDeletionErrorMessage(failure));
        throw failure;
      }
    },
    [refresh],
  );

  useEffect(() => {
    let interval: number | null = null;
    const stopPolling = () => {
      if (interval !== null) {
        window.clearInterval(interval);
        interval = null;
      }
    };
    const startPolling = () => {
      stopPolling();
      if (document.visibilityState === "hidden") return;
      void refresh();
      interval = window.setInterval(() => void refresh(), 3_000);
    };
    const visibilityChanged = () => {
      if (document.visibilityState === "hidden") {
        stopPolling();
        request.current?.abort();
        return;
      }
      startPolling();
    };
    document.addEventListener("visibilitychange", visibilityChanged);
    startPolling();
    return () => {
      document.removeEventListener("visibilitychange", visibilityChanged);
      stopPolling();
      request.current?.abort();
    };
  }, [refresh]);

  return { deleteProject, error, progress, refresh, status } as const;
};
