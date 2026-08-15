import { useCallback, useEffect, useState } from "react";

import type { EditableConfig } from "../../contracts/api";
import { loadSettings, saveSettings } from "../api";
import { getConfigConsistencyError } from "../model";

export const useSettingsConfig = () => {
  const [config, setConfig] = useState<EditableConfig | null>(null);
  const [savedFingerprint, setSavedFingerprint] = useState<string | null>(null);
  const [status, setStatus] = useState("正在读取本地配置…");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    loadSettings()
      .then((loaded) => {
        if (!active) return;
        setConfig(loaded);
        setSavedFingerprint(loaded.configFingerprint ?? null);
        setStatus("配置已加载");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setStatus(error instanceof Error ? error.message : "配置读取失败");
      });
    return () => {
      active = false;
    };
  }, []);

  const consistencyError =
    config === null ? "配置尚未加载。" : getConfigConsistencyError(config);

  const update = useCallback((mutate: (draft: EditableConfig) => void) => {
    setConfig((current) => {
      if (current === null) return current;
      const draft = structuredClone(current);
      mutate(draft);
      delete draft.configFingerprint;
      return draft;
    });
    setStatus("有未保存修改");
  }, []);

  const save = useCallback(async () => {
    if (config === null || consistencyError !== null) {
      setStatus(consistencyError ?? "配置尚未加载。");
      return;
    }
    setIsSaving(true);
    setStatus("正在校验并保存…");
    try {
      const saved = await saveSettings(config);
      setConfig(saved);
      setSavedFingerprint(saved.configFingerprint ?? null);
      setStatus("已校验并保存到 private/producer.config.json");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "配置保存失败");
    } finally {
      setIsSaving(false);
    }
  }, [config, consistencyError]);

  return {
    config,
    consistencyError,
    dirty: config !== null && config.configFingerprint !== savedFingerprint,
    isSaving,
    save,
    status,
    update,
  } as const;
};
