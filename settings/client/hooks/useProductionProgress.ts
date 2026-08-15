import { useCallback, useEffect, useRef, useState } from "react";

import type { ProductionProgressResponse } from "../../contracts/api";
import { loadProductionProgress, requestProjectDeletion } from "../api";
import { projectDeletionErrorMessage } from "../model";

export const useProductionProgress = () => {
  const [progress, setProgress] = useState<ProductionProgressResponse | null>(
    null,
  );
  const [status, setStatus] = useState("正在读取最新生产流程…");
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const deletionInProgress = useRef(false);

  const refresh = useCallback(async () => {
    if (deletionInProgress.current) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const result = await loadProductionProgress(controller.signal);
      if (controller.signal.aborted) return;
      setProgress(result);
      setError(null);
      setStatus(
        result.projects.length === 0 ? "暂无 Project" : "Project 进度已更新",
      );
    } catch (caught) {
      if (controller.signal.aborted) return;
      const message =
        caught instanceof Error ? caught.message : "生产进度读取失败";
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
    void refresh();
    const interval = window.setInterval(() => void refresh(), 3_000);
    return () => {
      window.clearInterval(interval);
      request.current?.abort();
    };
  }, [refresh]);

  return { deleteProject, error, progress, refresh, status } as const;
};
