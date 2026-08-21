import { useCallback, useEffect, useState } from "react";

import {
  ExecutionPreferencesSchema,
  type ExecutionPreferences,
} from "../../contracts/api";
import {
  loadExecutionPreferences,
  saveExecutionPreferences,
} from "../api";

const serialize = (preferences: ExecutionPreferences) =>
  JSON.stringify(preferences);

export const useExecutionPreferences = () => {
  const [preferences, setPreferences] =
    useState<ExecutionPreferences | null>(null);
  const [savedValue, setSavedValue] = useState<string | null>(null);
  const [status, setStatus] = useState("正在读取 Agent 执行配置…");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    loadExecutionPreferences()
      .then((loaded) => {
        if (!active) return;
        setPreferences(loaded);
        setSavedValue(serialize(loaded));
        setStatus("Agent 执行配置已加载");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setStatus(error instanceof Error ? error.message : "执行配置读取失败");
      });
    return () => {
      active = false;
    };
  }, []);

  const consistencyError =
    preferences === null
      ? "执行配置尚未加载。"
      : ExecutionPreferencesSchema.safeParse(preferences).success
        ? null
        : "执行配置不符合严格合同。";

  const update = useCallback((next: ExecutionPreferences) => {
    setPreferences(next);
    setStatus("有未保存修改");
  }, []);

  const save = useCallback(async () => {
    if (preferences === null || consistencyError !== null) {
      setStatus(consistencyError ?? "执行配置尚未加载。");
      return;
    }
    setIsSaving(true);
    setStatus("正在校验并保存…");
    try {
      const saved = await saveExecutionPreferences(preferences);
      setPreferences(saved);
      setSavedValue(serialize(saved));
      setStatus("已保存到 private/execution-preferences.json");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "执行配置保存失败");
    } finally {
      setIsSaving(false);
    }
  }, [consistencyError, preferences]);

  return {
    config: preferences,
    consistencyError,
    dirty:
      preferences !== null && serialize(preferences) !== savedValue,
    isSaving,
    save,
    status,
    update,
  } as const;
};
