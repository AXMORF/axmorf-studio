import { useCallback, useEffect, useRef, useState } from "react";

import type { FilmListResponse } from "../../contracts/api";
import { loadFilms, requestFilmDeletion } from "../api";
import { filmDeletionErrorMessage } from "../model";

export const beginFilmListRequest = ({
  deleting,
  request,
}: {
  readonly deleting: boolean;
  readonly request: AbortController | null;
}) => (deleting || request !== null ? null : new AbortController());

export const useFilms = () => {
  const [list, setList] = useState<FilmListResponse | null>(null);
  const [status, setStatus] = useState("正在读取作品…");
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const deletionInProgress = useRef(false);

  const refresh = useCallback(async () => {
    const controller = beginFilmListRequest({
      deleting: deletionInProgress.current,
      request: request.current,
    });
    if (controller === null) return;
    request.current = controller;
    try {
      const result = await loadFilms(controller.signal);
      if (controller.signal.aborted) return;
      setList(result);
      setError(null);
      setStatus(result.films.length === 0 ? "暂无作品" : "作品列表已更新");
    } catch (caught) {
      if (controller.signal.aborted) return;
      const message = caught instanceof Error ? caught.message : "作品读取失败";
      setList(null);
      setError(message);
      setStatus(message);
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, []);

  const deleteFilm = useCallback(
    async (filmId: string, confirmation: string) => {
      let failure: unknown = null;
      deletionInProgress.current = true;
      request.current?.abort();
      setStatus(`正在删除 ${filmId}…`);
      try {
        await requestFilmDeletion(filmId, confirmation);
        setStatus(`${filmId} 已删除`);
      } catch (caught) {
        failure = caught;
        setStatus(filmDeletionErrorMessage(caught));
      } finally {
        deletionInProgress.current = false;
      }
      await refresh();
      if (failure !== null) {
        setStatus(filmDeletionErrorMessage(failure));
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

  return { deleteFilm, error, list, refresh, status } as const;
};
