import { useEffect, useMemo, useState, type ReactNode } from "react";

import { buildStudioUrl, isLanAccessHostname } from "./network";

type TabId = "general" | "safe-area" | "collections" | "tts";
type VoiceProfile =
  | {
      id: string;
      name: string;
      mode: "controllable-clone";
      referenceAudioPath: string;
      controlInstruction: string;
    }
  | {
      id: string;
      name: string;
      mode: "high-fidelity-clone";
      promptAudioPath: string;
      promptTextPath: string;
      promptTranscriptConfirmed: true;
    };
type VoxcpmProviderConfig = {
  id: string;
  kind: "voxcpm";
  name: string;
  connection: { baseUrl: string; token?: string; timeoutMs: number };
  modelId: string;
  routes: {
    controllableClone: "/clone";
    highFidelityClone: "/clone_with_prompt";
  };
  parameters: {
    cfgValue: number;
    inferenceTimesteps: number;
    minLen: number;
    maxLen: number;
    normalize: boolean;
    denoise: boolean;
    retryBadcase: boolean;
    retryBadcaseMaxTimes: number;
    retryBadcaseRatioThreshold: number;
  };
  voiceProfiles: VoiceProfile[];
};
type EditableConfig = {
  schemaVersion: 1;
  contractVersion: "producer-config-v1";
  renderDefaults: {
    width: number;
    height: number;
    fps: number;
    locale: string;
  };
  readability: { edgeInsetPx: number };
  publishingCollections: Array<{
    id: string;
    name: string;
    description: string;
  }>;
  tts: {
    defaultProviderId: string;
    defaultVoiceProfileId: string;
    speech: { rate: number; targetLoudnessLufs: number };
    providers: VoxcpmProviderConfig[];
  };
  configFingerprint?: string;
};

const tabs: ReadonlyArray<
  Readonly<{ id: TabId; label: string; index: string }>
> = [
  { id: "general", label: "通用", index: "01" },
  { id: "safe-area", label: "画面安全区", index: "02" },
  { id: "collections", label: "合集", index: "03" },
  { id: "tts", label: "TTS", index: "04" },
];

const numberValue = (value: string) => Number(value);

const Field = ({
  label,
  hint,
  children,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly children: ReactNode;
}) => (
  <label className="field">
    <span className="field-label">{label}</span>
    {children}
    {hint === undefined ? null : <span className="field-hint">{hint}</span>}
  </label>
);

const Section = ({
  eyebrow,
  title,
  description,
  children,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}) => (
  <section className="config-section">
    <div className="section-heading">
      <span>{eyebrow}</span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
    {children}
  </section>
);

const FieldRow = ({ children }: { readonly children: ReactNode }) => (
  <div className="field-row">{children}</div>
);

const cloneConfig = (config: EditableConfig): EditableConfig =>
  structuredClone(config);

export const App = () => {
  const [activeTab, setActiveTab] = useState<TabId>("tts");
  const [config, setConfig] = useState<EditableConfig | null>(null);
  const [savedFingerprint, setSavedFingerprint] = useState<string | null>(null);
  const [status, setStatus] = useState("正在读取本地配置…");
  const [isSaving, setIsSaving] = useState(false);
  const studioUrl = useMemo(() => buildStudioUrl(window.location.href), []);
  const lanAccess = isLanAccessHostname(window.location.hostname);

  useEffect(() => {
    let active = true;
    fetch("/api/settings", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error);
        return (await response.json()) as EditableConfig;
      })
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

  const provider = config?.tts.providers.find(
    ({ id }) => id === config.tts.defaultProviderId,
  );
  const dirty =
    config !== null && config.configFingerprint !== savedFingerprint;
  const validation = useMemo(
    () => [
      {
        label: "配置结构",
        value: config === null ? "等待数据" : "已载入 v1",
        state: config === null ? "waiting" : "pass",
      },
      {
        label: "合集目录",
        value: `${config?.publishingCollections.length ?? 0} 个可选合集`,
        state:
          (config?.publishingCollections.length ?? 0) > 0 ? "pass" : "fail",
      },
      {
        label: "默认 TTS",
        value: provider?.name ?? "未找到",
        state: provider === undefined ? "fail" : "pass",
      },
      {
        label: "私密字段",
        value:
          provider?.connection.token === undefined
            ? "未配置 token"
            : "token 可见并可编辑",
        state: "notice",
      },
    ],
    [config, provider],
  );

  const update = (mutate: (draft: EditableConfig) => void) => {
    if (config === null) return;
    const draft = cloneConfig(config);
    mutate(draft);
    delete draft.configFingerprint;
    setConfig(draft);
    setStatus("有未保存修改");
  };

  const save = async () => {
    if (config === null) return;
    setIsSaving(true);
    setStatus("正在校验并保存…");
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(config),
      });
      const body = (await response.json()) as
        | EditableConfig
        | { error: string };
      if (!response.ok || "error" in body) {
        throw new Error("error" in body ? body.error : "配置保存失败");
      }
      setConfig(body);
      setSavedFingerprint(body.configFingerprint ?? null);
      setStatus("已校验并保存到 private/producer.config.json");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "配置保存失败");
    } finally {
      setIsSaving(false);
    }
  };

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
        <div className={`save-state ${dirty ? "dirty" : ""}`}>
          <span />
          {status}
        </div>
        <button
          className="save-button"
          disabled={config === null || isSaving}
          onClick={save}
        >
          {isSaving ? "保存中" : "保存配置"}
        </button>
      </header>

      <aside className="sidebar">
        <div className="sidebar-label">CONFIG / V1</div>
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
        {config === null ? (
          <div className="empty-state">
            <strong>配置尚未就绪</strong>
            <p>{status}</p>
          </div>
        ) : (
          <>
            {activeTab === "general" ? (
              <General config={config} update={update} />
            ) : null}
            {activeTab === "safe-area" ? (
              <SafeArea config={config} update={update} />
            ) : null}
            {activeTab === "collections" ? (
              <Collections config={config} update={update} />
            ) : null}
            {activeTab === "tts" && provider !== undefined ? (
              <Tts config={config} provider={provider} update={update} />
            ) : null}
          </>
        )}
      </main>

      <aside className="validation-rail">
        <div className="rail-title">
          <span>LIVE CHECK</span>
          <strong>配置状态</strong>
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

type EditorProps = Readonly<{
  config: EditableConfig;
  update: (mutate: (draft: EditableConfig) => void) => void;
}>;

const General = ({ config, update }: EditorProps) => (
  <Section
    eyebrow="01 / OUTPUT"
    title="通用输出"
    description="这些值是新作品的默认渲染参数；作品创建后由 RenderSpec 冻结。"
  >
    <FieldRow>
      <Field label="画面宽度" hint="H.264 要求偶数">
        <input
          type="number"
          value={config.renderDefaults.width}
          onChange={(event) =>
            update((draft) => {
              draft.renderDefaults.width = numberValue(event.target.value);
            })
          }
        />
      </Field>
      <Field label="画面高度" hint="H.264 要求偶数">
        <input
          type="number"
          value={config.renderDefaults.height}
          onChange={(event) =>
            update((draft) => {
              draft.renderDefaults.height = numberValue(event.target.value);
            })
          }
        />
      </Field>
      <Field label="帧率">
        <input
          type="number"
          value={config.renderDefaults.fps}
          onChange={(event) =>
            update((draft) => {
              draft.renderDefaults.fps = numberValue(event.target.value);
            })
          }
        />
      </Field>
      <Field label="语言">
        <input
          value={config.renderDefaults.locale}
          onChange={(event) =>
            update((draft) => {
              draft.renderDefaults.locale = event.target.value;
            })
          }
        />
      </Field>
    </FieldRow>
    <div className="spec-strip">
      <span>输出规格</span>
      <strong>
        {config.renderDefaults.width} × {config.renderDefaults.height}
      </strong>
      <strong>{config.renderDefaults.fps} FPS</strong>
      <strong>{config.renderDefaults.locale}</strong>
    </div>
  </Section>
);

const SafeArea = ({ config, update }: EditorProps) => {
  const baseEdge = config.readability.edgeInsetPx;
  const scale = Math.max(
    1080,
    Math.min(config.renderDefaults.width, config.renderDefaults.height),
  );
  const scaled = (value: number) => Math.round((value * scale) / 1080);
  const edge = scaled(baseEdge);
  const captionBottom = edge * 2;
  const captionFontSize = scaled(40);
  const captionPadding = scaled(38);
  const captionGap = scaled(30);
  const captionBoxHeight =
    Math.ceil((2 * captionFontSize * 135) / 100) + captionPadding;
  const sceneBottom =
    Math.ceil((captionBottom + captionBoxHeight + captionGap) / 10) * 10;
  return (
    <Section
      eyebrow="02 / READABILITY"
      title="画面安全区"
      description="只配置一个基准边缘留白；字幕与 Scene 底边由固定算法自适应推导。"
    >
      <FieldRow>
        <Field
          label="基准边缘留白"
          hint="以 1080 短边为基准，其他分辨率按比例缩放"
        >
          <input
            type="number"
            value={baseEdge}
            onChange={(event) =>
              update((draft) => {
                draft.readability.edgeInsetPx = numberValue(event.target.value);
              })
            }
          />
        </Field>
      </FieldRow>
      <div className="formula-board">
        <div>
          <span>字幕底边</span>
          <strong>{captionBottom}px</strong>
          <code>{edge}px × 2</code>
        </div>
        <div>
          <span>字幕盒高度</span>
          <strong>{captionBoxHeight}px</strong>
          <code>2 行 × {captionFontSize}px + padding</code>
        </div>
        <div>
          <span>Scene 底边</span>
          <strong>{sceneBottom}px</strong>
          <code>向上取整到 10px</code>
        </div>
      </div>
    </Section>
  );
};

const Collections = ({ config, update }: EditorProps) => {
  const addCollection = () =>
    update((draft) => {
      draft.publishingCollections = [
        ...draft.publishingCollections,
        {
          id: `collection-${draft.publishingCollections.length + 1}`,
          name: "新合集",
          description: "说明这个合集最适合什么主题。",
        },
      ];
    });
  return (
    <Section
      eyebrow="03 / PUBLISHING"
      title="发布合集"
      description="Agent 必须根据描述，从此数组中选择且只选择一个最合适的合集。"
    >
      <div className="collection-list">
        {config.publishingCollections.map((collection, index) => (
          <div className="collection-row" key={`${collection.id}-${index}`}>
            <span className="row-index">
              {String(index + 1).padStart(2, "0")}
            </span>
            <Field label="ID">
              <input
                value={collection.id}
                onChange={(event) =>
                  update((draft) => {
                    draft.publishingCollections[index] = {
                      ...draft.publishingCollections[index]!,
                      id: event.target.value,
                    };
                  })
                }
              />
            </Field>
            <Field label="名称">
              <input
                value={collection.name}
                onChange={(event) =>
                  update((draft) => {
                    draft.publishingCollections[index] = {
                      ...draft.publishingCollections[index]!,
                      name: event.target.value,
                    };
                  })
                }
              />
            </Field>
            <Field label="适用描述">
              <textarea
                value={collection.description}
                onChange={(event) =>
                  update((draft) => {
                    draft.publishingCollections[index] = {
                      ...draft.publishingCollections[index]!,
                      description: event.target.value,
                    };
                  })
                }
              />
            </Field>
            <button
              className="icon-button"
              aria-label={`删除 ${collection.name}`}
              disabled={config.publishingCollections.length === 1}
              onClick={() =>
                update((draft) => {
                  draft.publishingCollections =
                    draft.publishingCollections.filter(
                      (_, itemIndex) => itemIndex !== index,
                    );
                })
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button className="secondary-button" onClick={addCollection}>
        ＋ 添加合集
      </button>
    </Section>
  );
};

const Tts = ({
  config,
  provider,
  update,
}: EditorProps & { readonly provider: VoxcpmProviderConfig }) => {
  const replaceProvider = (next: VoxcpmProviderConfig) =>
    update((draft) => {
      draft.tts.providers = draft.tts.providers.map((item) =>
        item.id === provider.id ? next : item,
      );
    });
  const patchProvider = (patch: Partial<VoxcpmProviderConfig>) =>
    replaceProvider({ ...provider, ...patch });
  const addProfile = () =>
    patchProvider({
      voiceProfiles: [
        ...provider.voiceProfiles,
        {
          id: `voice-${provider.voiceProfiles.length + 1}`,
          name: "新声线",
          mode: "controllable-clone",
          referenceAudioPath: "/absolute/path/to/reference.wav",
          controlInstruction: "自然、清晰。",
        },
      ],
    });
  return (
    <>
      <Section
        eyebrow="04 / SPEECH"
        title="TTS 默认策略"
        description="上层只认识 provider、声线、语速与目标响度；VoxCPM 是当前一个具体适配器。"
      >
        <FieldRow>
          <Field label="默认服务">
            <select
              value={config.tts.defaultProviderId}
              onChange={(event) =>
                update((draft) => {
                  draft.tts.defaultProviderId = event.target.value;
                })
              }
            >
              {config.tts.providers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="默认声线">
            <select
              value={config.tts.defaultVoiceProfileId}
              onChange={(event) =>
                update((draft) => {
                  draft.tts.defaultVoiceProfileId = event.target.value;
                })
              }
            >
              {provider.voiceProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="语速" hint="0.5–2.0，服务返回后统一处理">
            <input
              type="number"
              min="0.5"
              max="2"
              step="0.05"
              value={config.tts.speech.rate}
              onChange={(event) =>
                update((draft) => {
                  draft.tts.speech.rate = numberValue(event.target.value);
                })
              }
            />
          </Field>
          <Field label="音量 / 目标响度" hint="LUFS，默认 -16">
            <input
              type="number"
              min="-30"
              max="-8"
              step="0.5"
              value={config.tts.speech.targetLoudnessLufs}
              onChange={(event) =>
                update((draft) => {
                  draft.tts.speech.targetLoudnessLufs = numberValue(
                    event.target.value,
                  );
                })
              }
            />
          </Field>
        </FieldRow>
      </Section>
      <Section
        eyebrow="ADAPTER / VOXCPM"
        title={provider.name}
        description="连接与模型参数属于适配器；克隆方式决定接口路由，不会把 mode 字段发给服务。"
      >
        <FieldRow>
          <Field label="服务地址">
            <input
              value={provider.connection.baseUrl}
              onChange={(event) =>
                patchProvider({
                  connection: {
                    ...provider.connection,
                    baseUrl: event.target.value,
                  },
                })
              }
            />
          </Field>
          <Field label="Token" hint="完整显示、可直接修改">
            <input
              value={provider.connection.token ?? ""}
              onChange={(event) =>
                patchProvider({
                  connection: {
                    ...provider.connection,
                    ...(event.target.value === ""
                      ? { token: undefined }
                      : { token: event.target.value }),
                  },
                })
              }
            />
          </Field>
          <Field label="超时 / ms">
            <input
              type="number"
              value={provider.connection.timeoutMs}
              onChange={(event) =>
                patchProvider({
                  connection: {
                    ...provider.connection,
                    timeoutMs: numberValue(event.target.value),
                  },
                })
              }
            />
          </Field>
          <Field label="模型 ID">
            <input
              value={provider.modelId}
              onChange={(event) =>
                patchProvider({ modelId: event.target.value })
              }
            />
          </Field>
        </FieldRow>
        <div className="route-table">
          <div>
            <span>可控克隆</span>
            <code>POST {provider.routes.controllableClone}</code>
          </div>
          <div>
            <span>高品质克隆</span>
            <code>POST {provider.routes.highFidelityClone}</code>
          </div>
        </div>
        <details>
          <summary>生成参数</summary>
          <FieldRow>
            <Field label="CFG">
              <input
                type="number"
                step="0.1"
                value={provider.parameters.cfgValue}
                onChange={(event) =>
                  patchProvider({
                    parameters: {
                      ...provider.parameters,
                      cfgValue: numberValue(event.target.value),
                    },
                  })
                }
              />
            </Field>
            <Field label="推理步数">
              <input
                type="number"
                value={provider.parameters.inferenceTimesteps}
                onChange={(event) =>
                  patchProvider({
                    parameters: {
                      ...provider.parameters,
                      inferenceTimesteps: numberValue(event.target.value),
                    },
                  })
                }
              />
            </Field>
            <Field label="最短文本">
              <input
                type="number"
                value={provider.parameters.minLen}
                onChange={(event) =>
                  patchProvider({
                    parameters: {
                      ...provider.parameters,
                      minLen: numberValue(event.target.value),
                    },
                  })
                }
              />
            </Field>
            <Field label="最长文本">
              <input
                type="number"
                value={provider.parameters.maxLen}
                onChange={(event) =>
                  patchProvider({
                    parameters: {
                      ...provider.parameters,
                      maxLen: numberValue(event.target.value),
                    },
                  })
                }
              />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="文本规范化">
              <select
                value={String(provider.parameters.normalize)}
                onChange={(event) =>
                  patchProvider({
                    parameters: {
                      ...provider.parameters,
                      normalize: event.target.value === "true",
                    },
                  })
                }
              >
                <option value="true">开启</option>
                <option value="false">关闭</option>
              </select>
            </Field>
            <Field label="参考音频降噪">
              <select
                value={String(provider.parameters.denoise)}
                onChange={(event) =>
                  patchProvider({
                    parameters: {
                      ...provider.parameters,
                      denoise: event.target.value === "true",
                    },
                  })
                }
              >
                <option value="true">开启</option>
                <option value="false">关闭</option>
              </select>
            </Field>
            <Field label="坏例重试">
              <select
                value={String(provider.parameters.retryBadcase)}
                onChange={(event) =>
                  patchProvider({
                    parameters: {
                      ...provider.parameters,
                      retryBadcase: event.target.value === "true",
                    },
                  })
                }
              >
                <option value="true">开启</option>
                <option value="false">关闭</option>
              </select>
            </Field>
            <Field label="坏例最多重试次数">
              <input
                type="number"
                value={provider.parameters.retryBadcaseMaxTimes}
                onChange={(event) =>
                  patchProvider({
                    parameters: {
                      ...provider.parameters,
                      retryBadcaseMaxTimes: numberValue(event.target.value),
                    },
                  })
                }
              />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="坏例比率阈值">
              <input
                type="number"
                step="0.1"
                value={provider.parameters.retryBadcaseRatioThreshold}
                onChange={(event) =>
                  patchProvider({
                    parameters: {
                      ...provider.parameters,
                      retryBadcaseRatioThreshold: numberValue(
                        event.target.value,
                      ),
                    },
                  })
                }
              />
            </Field>
          </FieldRow>
        </details>
      </Section>
      <Section
        eyebrow="VOICE PROFILES"
        title="声线配置"
        description="两种克隆共享服务适配器，但使用不同接口和不同必填输入。"
      >
        <div className="profile-list">
          {provider.voiceProfiles.map((profile, index) => (
            <div className="profile-row" key={`${profile.id}-${index}`}>
              <span className="row-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <Field label="声线 ID">
                <input
                  value={profile.id}
                  onChange={(event) =>
                    replaceProvider({
                      ...provider,
                      voiceProfiles: provider.voiceProfiles.map(
                        (item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, id: event.target.value }
                            : item,
                      ),
                    })
                  }
                />
              </Field>
              <Field label="显示名称">
                <input
                  value={profile.name}
                  onChange={(event) =>
                    replaceProvider({
                      ...provider,
                      voiceProfiles: provider.voiceProfiles.map(
                        (item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, name: event.target.value }
                            : item,
                      ),
                    })
                  }
                />
              </Field>
              <Field label="克隆方式">
                <select
                  value={profile.mode}
                  onChange={(event) =>
                    replaceProvider({
                      ...provider,
                      voiceProfiles: provider.voiceProfiles.map(
                        (item, itemIndex) =>
                          itemIndex !== index
                            ? item
                            : event.target.value === "high-fidelity-clone"
                              ? {
                                  id: item.id,
                                  name: item.name,
                                  mode: "high-fidelity-clone",
                                  promptAudioPath:
                                    "/absolute/path/to/prompt.wav",
                                  promptTextPath:
                                    "/absolute/path/to/prompt.txt",
                                  promptTranscriptConfirmed: true,
                                }
                              : {
                                  id: item.id,
                                  name: item.name,
                                  mode: "controllable-clone",
                                  referenceAudioPath:
                                    "/absolute/path/to/reference.wav",
                                  controlInstruction: "自然、清晰。",
                                },
                      ),
                    })
                  }
                >
                  <option value="controllable-clone">可控克隆</option>
                  <option value="high-fidelity-clone">高品质克隆</option>
                </select>
              </Field>
              <Field
                label={
                  profile.mode === "controllable-clone"
                    ? "参考音频"
                    : "Prompt 音频"
                }
              >
                <input
                  value={
                    profile.mode === "controllable-clone"
                      ? profile.referenceAudioPath
                      : profile.promptAudioPath
                  }
                  onChange={(event) =>
                    replaceProvider({
                      ...provider,
                      voiceProfiles: provider.voiceProfiles.map(
                        (item, itemIndex) =>
                          itemIndex !== index
                            ? item
                            : item.mode === "controllable-clone"
                              ? {
                                  ...item,
                                  referenceAudioPath: event.target.value,
                                }
                              : {
                                  ...item,
                                  promptAudioPath: event.target.value,
                                },
                      ),
                    })
                  }
                />
              </Field>
              <button
                className="icon-button"
                aria-label={`删除 ${profile.name}`}
                disabled={provider.voiceProfiles.length === 1}
                onClick={() =>
                  patchProvider({
                    voiceProfiles: provider.voiceProfiles.filter(
                      (_, itemIndex) => itemIndex !== index,
                    ),
                  })
                }
              >
                ×
              </button>
              {profile.mode === "controllable-clone" ? (
                <Field label="控制提示">
                  <textarea
                    value={profile.controlInstruction}
                    onChange={(event) =>
                      replaceProvider({
                        ...provider,
                        voiceProfiles: provider.voiceProfiles.map(
                          (item, itemIndex) =>
                            itemIndex === index &&
                            item.mode === "controllable-clone"
                              ? {
                                  ...item,
                                  controlInstruction: event.target.value,
                                }
                              : item,
                        ),
                      })
                    }
                  />
                </Field>
              ) : (
                <Field label="Prompt 文本文件">
                  <input
                    value={profile.promptTextPath}
                    onChange={(event) =>
                      replaceProvider({
                        ...provider,
                        voiceProfiles: provider.voiceProfiles.map(
                          (item, itemIndex) =>
                            itemIndex === index &&
                            item.mode === "high-fidelity-clone"
                              ? { ...item, promptTextPath: event.target.value }
                              : item,
                        ),
                      })
                    }
                  />
                </Field>
              )}
            </div>
          ))}
        </div>
        <button className="secondary-button" onClick={addProfile}>
          ＋ 添加声线
        </button>
      </Section>
    </>
  );
};
