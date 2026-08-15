import { useState } from "react";

import { General, SafeArea } from "./features/config/GeneralSettings";
import {
  Collections,
  SceneDefaults,
} from "./features/config/PublishingSettings";
import { Tts } from "./features/config/TtsSettings";
import { ProductionProgressPanel } from "./features/progress/ProductionProgressPanel";
import { useEnvironmentDiagnostics } from "./hooks/useEnvironmentDiagnostics";
import { useProductionProgress } from "./hooks/useProductionProgress";
import { useSettingsConfig } from "./hooks/useSettingsConfig";
import { buildStudioUrl, isLanAccessHostname } from "./network";

type TabId =
  | "progress"
  | "general"
  | "scenes"
  | "safe-area"
  | "collections"
  | "tts";

const tabs: ReadonlyArray<
  Readonly<{ id: TabId; label: string; index: string }>
> = [
  { id: "progress", label: "制作进度", index: "01" },
  { id: "general", label: "通用", index: "02" },
  { id: "scenes", label: "默认 Scene", index: "03" },
  { id: "safe-area", label: "画面安全区", index: "04" },
  { id: "collections", label: "合集", index: "05" },
  { id: "tts", label: "TTS", index: "06" },
];

export const App = () => {
  const [activeTab, setActiveTab] = useState<TabId>("progress");
  const settings = useSettingsConfig();
  const environment = useEnvironmentDiagnostics();
  const production = useProductionProgress();
  const provider = settings.config?.tts.providers.find(
    ({ id }) => id === settings.config?.tts.defaultProviderId,
  );
  const studioUrl = buildStudioUrl(window.location.href);
  const lanAccess = isLanAccessHostname(window.location.hostname);
  const validation = [
    {
      label: "表单一致性",
      value: settings.consistencyError ?? "默认 Provider、声线与 ID 一致。",
      state: settings.consistencyError === null ? "pass" : "fail",
    },
    ...(environment.diagnostics?.checks.map((check) => ({
      label: check.id,
      value:
        check.remediation === null
          ? check.summary
          : `${check.summary} ${check.remediation}`,
      state: check.status,
    })) ?? [
      {
        label: "宿主环境",
        value: environment.status,
        state: "waiting",
      },
    ]),
  ];

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand-mark">RSP</div>
        <div className="title-block">
          <span>REMOTION STORY PRODUCER</span>
          <h1>制作配置</h1>
        </div>
        <div className="frame-ruler" aria-label="30fps 帧标尺">
          {[0, 30, 60, 90].map((frame) => (
            <span key={frame}>{frame}</span>
          ))}
        </div>
        <div className={`save-state ${settings.dirty ? "dirty" : ""}`}>
          <span />
          {settings.status}
        </div>
        <button
          className="save-button"
          disabled={
            settings.config === null ||
            settings.isSaving ||
            settings.consistencyError !== null
          }
          onClick={() => void settings.save()}
        >
          {settings.isSaving ? "保存中" : "保存配置"}
        </button>
      </header>

      <aside className="sidebar">
        <div className="sidebar-label">CONFIG / V2</div>
        <nav>
          {tabs.map((tab) => (
            <button
              className={activeTab === tab.id ? "active" : ""}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.index}</span>
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="studio-link">
          <span>PREVIEW</span>
          <a href={studioUrl} target="_blank" rel="noreferrer">
            打开 Remotion Studio ↗
          </a>
        </div>
      </aside>

      <main className="workspace">
        {activeTab === "progress" ? (
          <ProductionProgressPanel
            progress={production.progress}
            status={production.status}
            error={production.error}
            refresh={production.refresh}
            deleteProject={production.deleteProject}
          />
        ) : settings.config === null ? (
          <div className="empty-state">
            <strong>配置尚未就绪</strong>
            <p>{settings.status}</p>
          </div>
        ) : (
          <>
            {activeTab === "general" ? (
              <General config={settings.config} update={settings.update} />
            ) : null}
            {activeTab === "scenes" ? (
              <SceneDefaults
                config={settings.config}
                update={settings.update}
              />
            ) : null}
            {activeTab === "safe-area" ? (
              <SafeArea config={settings.config} update={settings.update} />
            ) : null}
            {activeTab === "collections" ? (
              <Collections config={settings.config} update={settings.update} />
            ) : null}
            {activeTab === "tts" && provider !== undefined ? (
              <Tts
                config={settings.config}
                provider={provider}
                update={settings.update}
              />
            ) : null}
          </>
        )}
      </main>

      <aside className="validation-rail">
        <div className="rail-title">
          <span>ENVIRONMENT</span>
          <strong>只读环境诊断</strong>
          <button className="diagnostics-button" onClick={environment.refresh}>
            重新诊断
          </button>
        </div>
        {validation.map((item) => (
          <div className="check-row" key={item.label}>
            <i className={item.state} />
            <div>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          </div>
        ))}
        <div className="security-note">
          <span>{lanAccess ? "TRUSTED LAN" : "LOCAL ONLY"}</span>
          <p>
            {lanAccess
              ? "当前通过局域网地址访问。token 会原样回传，仅应在可信网络使用。"
              : "服务只监听 127.0.0.1。token 会原样回传到此页面。"}
            token 不写日志，也不进入浏览器存储。
          </p>
        </div>
      </aside>
    </div>
  );
};
