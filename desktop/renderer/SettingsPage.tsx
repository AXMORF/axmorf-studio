import { useCallback, useEffect, useMemo, useState } from "react";

import { ProducerConfigInputSchema } from "../../src/contracts";
import { Field, Section } from "../../settings/client/components/Form";
import { ExecutionSettings } from "../../settings/client/features/config/ExecutionSettings";
import {
  General,
  SafeArea,
} from "../../settings/client/features/config/GeneralSettings";
import {
  Collections,
  SceneDefaults,
} from "../../settings/client/features/config/PublishingSettings";
import { Tts } from "../../settings/client/features/config/TtsSettings";
import {
  getConfigConsistencyError,
  type EditableTtsConfig,
} from "../../settings/client/model";
import type { EditableConfig } from "../../settings/contracts/api";
import type { ExecutionPreferences } from "../../settings/contracts/execution-preferences";
import type { DesktopAppState } from "../contracts/shell";
import type {
  DesktopProducerConfigDraft,
  DesktopSecretState,
  DesktopSettingsError,
  DesktopSettingsSnapshot,
} from "../contracts/settings";

type SettingsSection =
  | "general"
  | "scenes"
  | "publishing"
  | "execution"
  | "tts";

const SETTINGS_SECTIONS: readonly Readonly<{
  id: SettingsSection;
  label: string;
  detail: string;
}>[] = [
  { id: "general", label: "通用", detail: "Render 与 BGM" },
  { id: "scenes", label: "Scene", detail: "安全区与边界模板" },
  { id: "publishing", label: "发布", detail: "合集与 Delivery" },
  { id: "execution", label: "Agent", detail: "任务执行策略" },
  { id: "tts", label: "Provider 与声线", detail: "本地和云端 TTS" },
];

const secretIdentity = (
  providerId: string,
  field: DesktopSecretState["field"],
) => `${providerId}:${field}`;

const cloneConfig = (config: DesktopProducerConfigDraft) =>
  structuredClone(config) as EditableConfig;

const validationCandidate = ({
  config,
  secrets,
  clearedSecrets,
}: {
  readonly config: EditableConfig;
  readonly secrets: readonly DesktopSecretState[];
  readonly clearedSecrets: ReadonlySet<string>;
}) => {
  const candidate = structuredClone(config);
  for (const provider of candidate.tts.providers) {
    if (provider.kind !== "speech-sdk" || provider.connection.apiKey !== "") {
      continue;
    }
    const identity = secretIdentity(provider.id, "apiKey");
    if (
      !clearedSecrets.has(identity) &&
      secrets.some(
        (secret) =>
          secret.providerId === provider.id &&
          secret.field === "apiKey" &&
          secret.configured,
      )
    ) {
      provider.connection.apiKey = "desktop-write-only-secret";
    }
  }
  return candidate;
};

const localValidationIssues = ({
  config,
  secrets,
  clearedSecrets,
}: {
  readonly config: EditableConfig;
  readonly secrets: readonly DesktopSecretState[];
  readonly clearedSecrets: ReadonlySet<string>;
}) => {
  const candidate = validationCandidate({ config, secrets, clearedSecrets });
  const consistency = getConfigConsistencyError(
    candidate as EditableTtsConfig & {
      publishingCollections: readonly Readonly<{ id: string }>[];
    },
  );
  if (consistency !== null) return [consistency];
  const parsed = ProducerConfigInputSchema.safeParse(candidate);
  return parsed.success
    ? []
    : parsed.error.issues.slice(0, 12).map((issue) => {
        const path = issue.path.reduce<string>(
          (result, segment) =>
            typeof segment === "number"
              ? `${result}[${segment}]`
              : `${result}.${String(segment)}`,
          "$",
        );
        return `${path} · ${issue.message}`;
      });
};

const SettingsErrorPanel = ({ error }: { readonly error: DesktopSettingsError }) => (
  <div className="settings-error" role="alert">
    <div>
      <strong>{error.message}</strong>
      <code>{error.code}</code>
    </div>
    <p>{error.action}</p>
    {error.issues.length === 0 ? null : (
      <ul>
        {error.issues.map((issue, index) => (
          <li key={`${issue.path}-${issue.code}-${index}`}>
            <code>{issue.path}</code>
            <span>{issue.message}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

const DeliverySettings = ({
  policy,
  update,
}: {
  readonly policy: "manual" | "automatic";
  readonly update: (policy: "manual" | "automatic") => void;
}) => (
  <Section
    eyebrow="DELIVERY / DEFAULT"
    title="默认 Delivery 策略"
    description="只决定 source-current 后是否继续构建成片；不进入 ProductionRevision、Task 或 artifact identity。"
  >
    <Field
      label="默认策略"
      hint="当前 Agent 命令的显式选择仍可覆盖此默认值"
    >
      <select
        value={policy}
        onChange={(event) =>
          update(event.target.value as "manual" | "automatic")
        }
      >
        <option value="manual">手动 · source-current 后按需构建</option>
        <option value="automatic">自动 · 同一 continuation 构建 Delivery</option>
      </select>
    </Field>
  </Section>
);

export const SettingsPage = ({
  appState,
  onAppState,
}: {
  readonly appState: DesktopAppState | null;
  readonly onAppState: (state: DesktopAppState) => void;
}) => {
  const [section, setSection] = useState<SettingsSection>("general");
  const [snapshot, setSnapshot] = useState<DesktopSettingsSnapshot | null>(
    null,
  );
  const [config, setConfig] = useState<EditableConfig | null>(null);
  const [execution, setExecution] = useState<ExecutionPreferences | null>(null);
  const [deliveryPolicy, setDeliveryPolicy] = useState<
    "manual" | "automatic"
  >("manual");
  const [clearedSecrets, setClearedSecrets] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<DesktopSettingsError | null>(null);
  const [saved, setSaved] = useState(false);

  const applySnapshot = useCallback((next: DesktopSettingsSnapshot) => {
    setSnapshot(next);
    setConfig(cloneConfig(next.config));
    setExecution(structuredClone(next.executionPreferences));
    setDeliveryPolicy(next.deliveryPolicy);
    setClearedSecrets(new Set());
    setDirty(false);
  }, []);

  useEffect(() => {
    let active = true;
    setLoadError(null);
    void window.axmorfStudio
      .getSettings()
      .then((next) => {
        if (active) applySnapshot(next);
      })
      .catch(() => {
        if (active) {
          setLoadError(
            "无法读取加密配置。请确认当前系统登录会话已解锁，然后重新打开 App。",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [applySnapshot]);

  const updateConfig = useCallback(
    (mutate: (draft: EditableConfig) => void) => {
      setConfig((current) => {
        if (current === null) return current;
        const next = structuredClone(current);
        mutate(next);
        return next;
      });
      setDirty(true);
      setSaved(false);
      setSaveError(null);
    },
    [],
  );

  const validationIssues = useMemo(
    () =>
      config === null || snapshot === null
        ? []
        : localValidationIssues({
            config,
            secrets: snapshot.secrets,
            clearedSecrets,
          }),
    [clearedSecrets, config, snapshot],
  );

  const isSecretConfigured = useCallback(
    (providerId: string, field: DesktopSecretState["field"]) => {
      const identity = secretIdentity(providerId, field);
      if (clearedSecrets.has(identity)) return false;
      return (
        snapshot?.secrets.some(
          (secret) =>
            secret.providerId === providerId &&
            secret.field === field &&
            secret.configured,
        ) ?? false
      );
    },
    [clearedSecrets, snapshot],
  );

  const save = async () => {
    if (
      config === null ||
      execution === null ||
      snapshot === null ||
      validationIssues.length > 0
    ) {
      return;
    }
    setBusy(true);
    setSaveError(null);
    setSaved(false);
    try {
      const result = await window.axmorfStudio.saveSettings({
        schemaVersion: 1,
        config,
        executionPreferences: execution,
        deliveryPolicy,
        clearedSecrets: [...clearedSecrets].map((identity) => {
          const separator = identity.lastIndexOf(":");
          return {
            providerId: identity.slice(0, separator),
            field: identity.slice(
              separator + 1,
            ) as DesktopSecretState["field"],
          };
        }),
      });
      if (result.ok) {
        applySnapshot(result.settings);
        setSaved(true);
      } else {
        setSaveError(result.error);
        if (result.error.code === "desktop-settings-engine-restart-failed") {
          try {
            applySnapshot(await window.axmorfStudio.getSettings());
          } catch {
            // The structured restart failure remains the safe user-facing authority.
          }
        }
      }
    } catch {
      setSaveError({
        code: "desktop-settings-ipc-unavailable",
        message: "配置请求未到达 Desktop 主进程。",
        action: "重新打开 AXMORF Studio 后再试；当前表单不会写入其他存储。",
        issues: [],
      });
    } finally {
      try {
        onAppState(await window.axmorfStudio.getAppState());
      } catch {
        // State polling will refresh after a transient shell transport failure.
      }
      setBusy(false);
    }
  };

  if (config === null || execution === null || snapshot === null) {
    return (
      <section className="settings-loading">
        <span className="section-kicker">Private configuration</span>
        <h1>配置中心</h1>
        <p role={loadError === null ? "status" : "alert"}>
          {loadError ?? "正在从系统安全存储读取配置…"}
        </p>
      </section>
    );
  }

  return (
    <section className="desktop-settings">
      <aside className="settings-navigation" aria-label="配置分类">
        <div>
          <span className="section-kicker">Private configuration</span>
          <h1>配置中心</h1>
          <p>单一加密配置，不启动 Settings 服务。</p>
        </div>
        <nav>
          {SETTINGS_SECTIONS.map((item, index) => (
            <button
              aria-current={section === item.id ? "page" : undefined}
              key={item.id}
              onClick={() => setSection(item.id)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </button>
          ))}
        </nav>
        <div className="settings-authority">
          <span>Storage</span>
          <strong>system encrypted private config</strong>
          <span>Secrets</span>
          <strong>write-only · never echoed</strong>
        </div>
      </aside>

      <div className="settings-workspace">
        <header className="settings-header">
          <div>
            <span className="section-kicker">AXMORF Studio Desktop</span>
            <h2>{SETTINGS_SECTIONS.find(({ id }) => id === section)?.label}</h2>
          </div>
          <div className="settings-save-cluster">
            <span data-state={dirty ? "dirty" : "saved"}>
              {saved
                ? appState?.workspaceRoot === null
                  ? "配置已安全保存"
                  : "已保存并重启 Engine"
                : dirty
                  ? "有未保存修改"
                  : "配置已同步"}
            </span>
            <button
              disabled={
                busy ||
                !dirty ||
                (appState !== null && appState.activeWork !== null) ||
                validationIssues.length > 0
              }
              onClick={() => void save()}
            >
              {busy
                ? "保存中…"
                : appState?.workspaceRoot === null
                  ? "保存配置"
                  : "保存并重启 Engine"}
            </button>
          </div>
        </header>

        <div className="settings-scroll">
          {appState !== null && appState.activeWork !== null ? (
            <div className="settings-notice" role="status">
              当前 {appState.activeWork.phase} 正在运行。为保持 attempt
              authority，结束前不能保存配置。
            </div>
          ) : null}
          {snapshot.status === "unavailable" ? (
            <div className="settings-notice danger" role="alert">
              系统安全存储当前不可用；表单可以查看，但保存会保持 fail closed。
            </div>
          ) : null}
          {saveError === null ? null : <SettingsErrorPanel error={saveError} />}
          {validationIssues.length === 0 ? null : (
            <div className="settings-validation" role="alert">
              <strong>请先修正以下字段</strong>
              <ul>
                {validationIssues.map((issue, index) => (
                  <li key={`${issue}-${index}`}>{issue}</li>
                ))}
              </ul>
            </div>
          )}

          {section === "general" ? (
            <General config={config} update={updateConfig} />
          ) : null}
          {section === "scenes" ? (
            <>
              <SafeArea config={config} update={updateConfig} />
              <SceneDefaults config={config} update={updateConfig} />
            </>
          ) : null}
          {section === "publishing" ? (
            <>
              <Collections config={config} update={updateConfig} />
              <DeliverySettings
                policy={deliveryPolicy}
                update={(next) => {
                  setDeliveryPolicy(next);
                  setDirty(true);
                  setSaved(false);
                  setSaveError(null);
                }}
              />
            </>
          ) : null}
          {section === "execution" ? (
            <ExecutionSettings
              config={execution}
              update={(next) => {
                setExecution(next);
                setDirty(true);
                setSaved(false);
                setSaveError(null);
              }}
            />
          ) : null}
          {section === "tts" ? (
            <Tts
              config={config}
              update={updateConfig}
              secretConfigured={isSecretConfigured}
              onSecretChange={(providerId, field, value) => {
                if (value !== "") {
                  setClearedSecrets((current) => {
                    const next = new Set(current);
                    next.delete(secretIdentity(providerId, field));
                    return next;
                  });
                }
              }}
              onSecretClear={(providerId, field) => {
                setClearedSecrets((current) =>
                  new Set([...current, secretIdentity(providerId, field)]),
                );
                setDirty(true);
                setSaved(false);
                setSaveError(null);
              }}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
};
