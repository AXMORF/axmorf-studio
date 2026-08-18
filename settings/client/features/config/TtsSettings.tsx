import type {
  EdgeTtsProviderConfig,
  SpeechSdkProviderConfig,
  TtsProviderConfig,
  VoxcpmProviderConfig,
} from "../../../contracts/api";
import {
  EDGE_TTS_VOICE_DEFINITIONS,
  SPEECH_SDK_VENDORS,
  getEdgeTtsVoiceDefinition,
  getSpeechSdkModelMaxInputChars,
  getSpeechSdkVendorDefinition,
  type SpeechSdkVendor,
} from "../../../../src/contracts/tts-provider-registry";
import { Field, FieldRow, Section } from "../../components/Form";
import {
  nextUniqueId,
  removeProvider,
  removeVoiceProfile,
  selectProviderAndVoice,
} from "../../model";
import type { EditorProps } from "./types";

const numberValue = (value: string) => Number(value);

const newVoxcpmProvider = (id: string): VoxcpmProviderConfig => ({
  id,
  kind: "voxcpm",
  name: "本地 VoxCPM",
  connection: {
    baseUrl: "http://127.0.0.1:9880",
    timeoutMs: 120_000,
  },
  modelId: "voxcpm-1.5",
  routes: {
    controllableClone: "/clone",
    highFidelityClone: "/clone_with_prompt",
  },
  parameters: {
    cfgValue: 2,
    inferenceTimesteps: 10,
    minLen: 2,
    maxLen: 4096,
    normalize: true,
    denoise: false,
    retryBadcase: false,
    retryBadcaseMaxTimes: 0,
    retryBadcaseRatioThreshold: 6,
  },
  voiceProfiles: [
    {
      id: "voice-1",
      name: "本地声线",
      mode: "controllable-clone",
      referenceAudioPath: "voxcpm/voice_profile/reference.wav",
      controlInstruction: "自然、清晰。",
    },
  ],
});

const newSpeechSdkProvider = (id: string): SpeechSdkProviderConfig => ({
  id,
  kind: "speech-sdk",
  vendor: "openai",
  name: "SpeechSDK · OpenAI 直连",
  connection: { apiKey: "", timeoutMs: 60_000 },
  modelId: "gpt-4o-mini-tts",
  voiceProfiles: [
    {
      id: "voice-1",
      name: "云端声线",
      voiceId: "alloy",
      source: "catalog",
    },
  ],
});

const newEdgeTtsProvider = (id: string): EdgeTtsProviderConfig => ({
  id,
  kind: "edge-tts",
  service: "microsoft-edge-read-aloud",
  name: "Edge 免费在线 TTS",
  connection: { timeoutMs: 60_000 },
  modelId: "edge-read-aloud",
  voiceProfiles: [
    {
      id: "voice-1",
      name: "晓晓",
      voiceId: "zh-CN-XiaoxiaoNeural",
      locale: "zh-CN",
    },
  ],
});

const ProviderShell = ({
  provider,
  canDelete,
  onDelete,
  onKindChange,
  children,
}: Readonly<{
  provider: TtsProviderConfig;
  canDelete: boolean;
  onDelete: () => void;
  onKindChange: (kind: TtsProviderConfig["kind"]) => void;
  children: React.ReactNode;
}>) => (
  <Section
    eyebrow={
      provider.kind === "voxcpm"
        ? "ADAPTER / LOCAL VOXCPM"
        : provider.kind === "speech-sdk"
          ? "ADAPTER / SPEECHSDK DIRECT"
          : "ADAPTER / EDGE READ ALOUD"
    }
    title={provider.name}
    description={
      provider.kind === "voxcpm"
        ? "仓库专用 multipart adapter；保留可控克隆与高品质克隆合同。"
        : provider.kind === "speech-sdk"
          ? "BYOK 直连云厂商，不经过 Speechbase Gateway；不做跨厂商 fallback。"
          : "无需 Key 的 Edge Read Aloud 在线端点；非 Microsoft 公共 SLA API。"
    }
  >
    <FieldRow>
      <Field label="Provider 类型">
        <select
          value={provider.kind}
          onChange={(event) =>
            onKindChange(event.target.value as TtsProviderConfig["kind"])
          }
        >
          <option value="voxcpm">本地 VoxCPM</option>
          <option value="speech-sdk">SpeechSDK 直连云厂商</option>
          <option value="edge-tts">Edge 免费在线 TTS</option>
        </select>
      </Field>
      <button
        className="secondary-button"
        disabled={!canDelete}
        onClick={onDelete}
        aria-label={`删除 Provider ${provider.name}`}
      >
        删除 Provider
      </button>
    </FieldRow>
    {children}
  </Section>
);

const VoxcpmEditor = ({
  provider,
  replace,
  removeProfile,
}: Readonly<{
  provider: VoxcpmProviderConfig;
  replace: (next: VoxcpmProviderConfig) => void;
  removeProfile: (profileId: string) => void;
}>) => {
  const patch = (value: Partial<VoxcpmProviderConfig>) =>
    replace({ ...provider, ...value });
  const parameters = provider.parameters;
  return (
    <>
      <FieldRow>
        <Field label="Provider ID">
          <input
            value={provider.id}
            onChange={(event) => patch({ id: event.target.value })}
          />
        </Field>
        <Field label="显示名称">
          <input
            value={provider.name}
            onChange={(event) => patch({ name: event.target.value })}
          />
        </Field>
        <Field label="服务地址">
          <input
            value={provider.connection.baseUrl}
            onChange={(event) =>
              patch({
                connection: {
                  ...provider.connection,
                  baseUrl: event.target.value,
                },
              })
            }
          />
        </Field>
        <Field label="Token" hint="仅保存在 private 配置；不写浏览器存储或日志">
          <input
            type="password"
            autoComplete="off"
            value={provider.connection.token ?? ""}
            onChange={(event) =>
              patch({
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
      </FieldRow>
      <FieldRow>
        <Field label="模型 ID">
          <input
            value={provider.modelId}
            onChange={(event) => patch({ modelId: event.target.value })}
          />
        </Field>
        <Field label="超时 / ms">
          <input
            type="number"
            value={provider.connection.timeoutMs}
            onChange={(event) =>
              patch({
                connection: {
                  ...provider.connection,
                  timeoutMs: numberValue(event.target.value),
                },
              })
            }
          />
        </Field>
        <Field label="CFG">
          <input
            type="number"
            step="0.1"
            value={parameters.cfgValue}
            onChange={(event) =>
              patch({
                parameters: {
                  ...parameters,
                  cfgValue: numberValue(event.target.value),
                },
              })
            }
          />
        </Field>
        <Field label="推理步数">
          <input
            type="number"
            value={parameters.inferenceTimesteps}
            onChange={(event) =>
              patch({
                parameters: {
                  ...parameters,
                  inferenceTimesteps: numberValue(event.target.value),
                },
              })
            }
          />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="最短文本">
          <input
            type="number"
            value={parameters.minLen}
            onChange={(event) =>
              patch({
                parameters: {
                  ...parameters,
                  minLen: numberValue(event.target.value),
                },
              })
            }
          />
        </Field>
        <Field label="最长文本">
          <input
            type="number"
            value={parameters.maxLen}
            onChange={(event) =>
              patch({
                parameters: {
                  ...parameters,
                  maxLen: numberValue(event.target.value),
                },
              })
            }
          />
        </Field>
        <Field label="文本规范化">
          <select
            value={String(parameters.normalize)}
            onChange={(event) =>
              patch({
                parameters: {
                  ...parameters,
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
            value={String(parameters.denoise)}
            onChange={(event) =>
              patch({
                parameters: {
                  ...parameters,
                  denoise: event.target.value === "true",
                },
              })
            }
          >
            <option value="true">开启</option>
            <option value="false">关闭</option>
          </select>
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="坏例重试">
          <select
            value={String(parameters.retryBadcase)}
            onChange={(event) =>
              patch({
                parameters: {
                  ...parameters,
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
            value={parameters.retryBadcaseMaxTimes}
            onChange={(event) =>
              patch({
                parameters: {
                  ...parameters,
                  retryBadcaseMaxTimes: numberValue(event.target.value),
                },
              })
            }
          />
        </Field>
        <Field label="坏例比率阈值">
          <input
            type="number"
            step="0.1"
            value={parameters.retryBadcaseRatioThreshold}
            onChange={(event) =>
              patch({
                parameters: {
                  ...parameters,
                  retryBadcaseRatioThreshold: numberValue(event.target.value),
                },
              })
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
      <div className="profile-list">
        {provider.voiceProfiles.map((profile, index) => (
          <div className="profile-row" key={index}>
            <span className="row-index">
              {String(index + 1).padStart(2, "0")}
            </span>
            <Field label="声线 ID">
              <input
                value={profile.id}
                onChange={(event) =>
                  replace({
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
                  replace({
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
                  replace({
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
                                  "voxcpm/voice_profile/prompt.wav",
                                promptTextPath:
                                  "voxcpm/voice_profile/prompt.txt",
                                promptTranscriptConfirmed: true,
                              }
                            : {
                                id: item.id,
                                name: item.name,
                                mode: "controllable-clone",
                                referenceAudioPath:
                                  "voxcpm/voice_profile/reference.wav",
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
              hint="仓库相对路径"
            >
              <input
                value={
                  profile.mode === "controllable-clone"
                    ? profile.referenceAudioPath
                    : profile.promptAudioPath
                }
                onChange={(event) =>
                  replace({
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
                            : { ...item, promptAudioPath: event.target.value },
                    ),
                  })
                }
              />
            </Field>
            <button
              className="icon-button"
              aria-label={`删除 ${profile.name}`}
              disabled={provider.voiceProfiles.length === 1}
              onClick={() => removeProfile(profile.id)}
            >
              ×
            </button>
            {profile.mode === "controllable-clone" ? (
              <Field label="控制提示">
                <textarea
                  value={profile.controlInstruction}
                  onChange={(event) =>
                    replace({
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
              <Field label="Prompt 文本文件" hint="仓库相对路径">
                <input
                  value={profile.promptTextPath}
                  onChange={(event) =>
                    replace({
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
      <button
        className="secondary-button"
        onClick={() =>
          patch({
            voiceProfiles: [
              ...provider.voiceProfiles,
              {
                id: nextUniqueId(
                  "voice",
                  provider.voiceProfiles.map(({ id }) => id),
                ),
                name: "新声线",
                mode: "controllable-clone",
                referenceAudioPath: "voxcpm/voice_profile/reference.wav",
                controlInstruction: "自然、清晰。",
              },
            ],
          })
        }
      >
        ＋ 添加 VoxCPM 声线
      </button>
    </>
  );
};

const SpeechSdkEditor = ({
  provider,
  replace,
  removeProfile,
}: Readonly<{
  provider: SpeechSdkProviderConfig;
  replace: (next: SpeechSdkProviderConfig) => void;
  removeProfile: (profileId: string) => void;
}>) => {
  const patch = (value: Partial<SpeechSdkProviderConfig>) =>
    replace({ ...provider, ...value });
  const definition = getSpeechSdkVendorDefinition(provider.vendor);
  return (
    <>
      <FieldRow>
        <Field label="Provider ID">
          <input
            value={provider.id}
            onChange={(event) => patch({ id: event.target.value })}
          />
        </Field>
        <Field label="显示名称">
          <input
            value={provider.name}
            onChange={(event) => patch({ name: event.target.value })}
          />
        </Field>
        <Field label="云厂商">
          <select
            value={provider.vendor}
            onChange={(event) => {
              const vendor = event.target.value as SpeechSdkVendor;
              const next = getSpeechSdkVendorDefinition(vendor);
              patch({
                vendor,
                name: `SpeechSDK · ${next.label} 直连`,
                modelId: next.defaultModel,
                connection: {
                  apiKey: provider.connection.apiKey,
                  timeoutMs: provider.connection.timeoutMs,
                },
                voiceProfiles: provider.voiceProfiles.map((profile) => ({
                  ...profile,
                  source: "catalog",
                })),
              });
            }}
          >
            {SPEECH_SDK_VENDORS.map((vendor) => (
              <option key={vendor} value={vendor}>
                {getSpeechSdkVendorDefinition(vendor).label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="模型">
          <select
            value={provider.modelId}
            onChange={(event) => patch({ modelId: event.target.value })}
          >
            {definition.models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </Field>
      </FieldRow>
      <FieldRow>
        <Field
          label="API Key"
          hint="BYOK，仅保存在 private 配置；不写浏览器存储或日志"
        >
          <input
            type="password"
            autoComplete="off"
            value={provider.connection.apiKey}
            onChange={(event) =>
              patch({
                connection: {
                  ...provider.connection,
                  apiKey: event.target.value,
                },
              })
            }
          />
        </Field>
        <Field label="Base URL" hint="可空；传给所选 direct factory">
          <input
            value={provider.connection.baseUrl ?? ""}
            placeholder="https://api.openai.com/v1"
            onChange={(event) =>
              patch({
                connection: {
                  ...provider.connection,
                  ...(event.target.value === ""
                    ? { baseUrl: undefined }
                    : { baseUrl: event.target.value }),
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
              patch({
                connection: {
                  ...provider.connection,
                  timeoutMs: numberValue(event.target.value),
                },
              })
            }
          />
        </Field>
        {provider.vendor === "minimax" ? (
          <Field label="Group ID" hint="MiniMax 中国大陆端点按需填写">
            <input
              value={provider.connection.groupId ?? ""}
              onChange={(event) =>
                patch({
                  connection: {
                    ...provider.connection,
                    ...(event.target.value === ""
                      ? { groupId: undefined }
                      : { groupId: event.target.value }),
                  },
                })
              }
            />
          </Field>
        ) : null}
      </FieldRow>
      <p className="inline-note">
        单 authored ttsChunk 最多 {getSpeechSdkModelMaxInputChars(provider.vendor, provider.modelId)} 字符；maxRetries=0，
        不启用 SDK timestamp、响度处理、自动拆分或跨厂商 fallback。没有 Key
        的厂商仅完成源码与 mock 验证，不标记为线上实测。
      </p>
      <div className="profile-list">
        {provider.voiceProfiles.map((profile, index) => (
          <div className="profile-row" key={index}>
            <span className="row-index">
              {String(index + 1).padStart(2, "0")}
            </span>
            <Field label="仓库声线 ID">
              <input
                value={profile.id}
                onChange={(event) =>
                  replace({
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
                  replace({
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
            <Field label={`${definition.label} Voice ID`}>
              <input
                value={profile.voiceId}
                onChange={(event) =>
                  replace({
                    ...provider,
                    voiceProfiles: provider.voiceProfiles.map(
                      (item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, voiceId: event.target.value }
                          : item,
                    ),
                  })
                }
              />
            </Field>
            <Field label="声线来源">
              <select
                value={profile.source}
                onChange={(event) =>
                  replace({
                    ...provider,
                    voiceProfiles: provider.voiceProfiles.map(
                      (item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...item,
                              source: event.target.value as typeof item.source,
                            }
                          : item,
                    ),
                  })
                }
              >
                {definition.voiceCapabilities.map((source) => (
                  <option key={source} value={source}>
                    {source === "catalog"
                      ? "厂商预置"
                      : source === "remote-clone"
                        ? "云端克隆 ID"
                        : "云端设计 ID"}
                  </option>
                ))}
              </select>
            </Field>
            <button
              className="icon-button"
              aria-label={`删除 ${profile.name}`}
              disabled={provider.voiceProfiles.length === 1}
              onClick={() => removeProfile(profile.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        className="secondary-button"
        onClick={() =>
          patch({
            voiceProfiles: [
              ...provider.voiceProfiles,
              {
                id: nextUniqueId(
                  "voice",
                  provider.voiceProfiles.map(({ id }) => id),
                ),
                name: "新云端声线",
                voiceId: "alloy",
                source: "catalog",
              },
            ],
          })
        }
      >
        ＋ 添加云端声线
      </button>
    </>
  );
};

const EdgeTtsEditor = ({
  provider,
  replace,
  removeProfile,
}: Readonly<{
  provider: EdgeTtsProviderConfig;
  replace: (next: EdgeTtsProviderConfig) => void;
  removeProfile: (profileId: string) => void;
}>) => {
  const patch = (value: Partial<EdgeTtsProviderConfig>) =>
    replace({ ...provider, ...value });
  return (
    <>
      <FieldRow>
        <Field label="Provider ID">
          <input
            value={provider.id}
            onChange={(event) => patch({ id: event.target.value })}
          />
        </Field>
        <Field label="显示名称">
          <input
            value={provider.name}
            onChange={(event) => patch({ name: event.target.value })}
          />
        </Field>
        <Field label="服务">
          <input value="Microsoft Edge Read Aloud" disabled />
        </Field>
        <Field label="超时 / ms">
          <input
            type="number"
            value={provider.connection.timeoutMs}
            onChange={(event) =>
              patch({
                connection: { timeoutMs: numberValue(event.target.value) },
              })
            }
          />
        </Field>
      </FieldRow>
      <p className="inline-note">
        无需 API Key，但仍依赖互联网。该端点来自 Edge Read Aloud
        客户端协议，并非 Microsoft 对外承诺 SLA 的公共 TTS API；单 chunk
        转义后最多 4096 UTF-8 字节，不自动拆分或重试。
      </p>
      <div className="profile-list">
        {provider.voiceProfiles.map((profile, index) => (
          <div className="profile-row" key={index}>
            <span className="row-index">
              {String(index + 1).padStart(2, "0")}
            </span>
            <Field label="仓库声线 ID">
              <input
                value={profile.id}
                onChange={(event) =>
                  replace({
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
                  replace({
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
            <Field label="Edge Voice ID">
              <select
                value={profile.voiceId}
                onChange={(event) =>
                  replace({
                    ...provider,
                    voiceProfiles: provider.voiceProfiles.map(
                      (item, itemIndex) => {
                        if (itemIndex !== index) return item;
                        const definition = getEdgeTtsVoiceDefinition(
                          event.target.value,
                        );
                        if (definition === undefined) return item;
                        return {
                          ...item,
                          voiceId: definition.id,
                          locale: definition.locale,
                        };
                      },
                    ),
                  })
                }
              >
                {EDGE_TTS_VOICE_DEFINITIONS.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.label} · {voice.locale}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Locale">
              <input value={profile.locale} readOnly aria-readonly="true" />
            </Field>
            <button
              className="icon-button"
              aria-label={`删除 ${profile.name}`}
              disabled={provider.voiceProfiles.length === 1}
              onClick={() => removeProfile(profile.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        className="secondary-button"
        onClick={() =>
          patch({
            voiceProfiles: [
              ...provider.voiceProfiles,
              {
                id: nextUniqueId(
                  "voice",
                  provider.voiceProfiles.map(({ id }) => id),
                ),
                name: "新 Edge 声线",
                voiceId: "zh-CN-XiaoxiaoNeural",
                locale: "zh-CN",
              },
            ],
          })
        }
      >
        ＋ 添加 Edge 声线
      </button>
    </>
  );
};

export const Tts = ({ config, update }: EditorProps) => {
  const defaultProvider = config.tts.providers.find(
    ({ id }) => id === config.tts.defaultProviderId,
  );
  const addProvider = (kind: TtsProviderConfig["kind"]) =>
    update((draft) => {
      const id = nextUniqueId(
        kind === "voxcpm"
          ? "local-voxcpm"
          : kind === "speech-sdk"
            ? "speech-sdk-direct"
            : "edge-tts",
        draft.tts.providers.map(({ id: current }) => current),
      );
      draft.tts.providers.push(
        kind === "voxcpm"
          ? newVoxcpmProvider(id)
          : kind === "speech-sdk"
            ? newSpeechSdkProvider(id)
            : newEdgeTtsProvider(id),
      );
    });
  const replaceAt = (
    index: number,
    previousId: string,
    next: TtsProviderConfig,
  ) =>
    update((draft) => {
      draft.tts.providers[index] = next;
      if (draft.tts.defaultProviderId === previousId) {
        draft.tts.defaultProviderId = next.id;
        if (
          !next.voiceProfiles.some(
            ({ id }) => id === draft.tts.defaultVoiceProfileId,
          )
        ) {
          draft.tts.defaultVoiceProfileId = next.voiceProfiles[0]!.id;
        }
      }
    });
  return (
    <>
      <Section
        eyebrow="04 / SPEECH"
        title="TTS 默认策略"
        description="Project 只绑定稳定 provider/profile ID；连接凭证只留在 private ProducerConfig。"
      >
        <FieldRow>
          <Field label="默认服务">
            <select
              value={config.tts.defaultProviderId}
              onChange={(event) =>
                update((draft) =>
                  selectProviderAndVoice(draft, event.target.value),
                )
              }
            >
              {config.tts.providers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.kind}
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
              {defaultProvider?.voiceProfiles.map((profile) => (
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
          <Field label="目标响度 / LUFS">
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
        <div className="provider-actions">
          <button
            className="secondary-button"
            onClick={() => addProvider("voxcpm")}
          >
            ＋ 本地 VoxCPM
          </button>
          <button
            className="secondary-button"
            onClick={() => addProvider("speech-sdk")}
          >
            ＋ SpeechSDK 云厂商直连
          </button>
          <button
            className="secondary-button"
            onClick={() => addProvider("edge-tts")}
          >
            ＋ Edge 免费在线 TTS
          </button>
        </div>
      </Section>
      {config.tts.providers.map((provider, index) => {
        const replace = (next: TtsProviderConfig) =>
          replaceAt(index, provider.id, next);
        const removeProfile = (profileId: string) =>
          update((draft) => removeVoiceProfile(draft, provider.id, profileId));
        return (
          <ProviderShell
            key={index}
            provider={provider}
            canDelete={config.tts.providers.length > 1}
            onDelete={() =>
              update((draft) => removeProvider(draft, provider.id))
            }
            onKindChange={(kind) =>
              replace(
                kind === "voxcpm"
                  ? newVoxcpmProvider(provider.id)
                  : kind === "speech-sdk"
                    ? newSpeechSdkProvider(provider.id)
                    : newEdgeTtsProvider(provider.id),
              )
            }
          >
            {provider.kind === "voxcpm" ? (
              <VoxcpmEditor
                provider={provider}
                replace={replace}
                removeProfile={removeProfile}
              />
            ) : provider.kind === "speech-sdk" ? (
              <SpeechSdkEditor
                provider={provider}
                replace={replace}
                removeProfile={removeProfile}
              />
            ) : (
              <EdgeTtsEditor
                provider={provider}
                replace={replace}
                removeProfile={removeProfile}
              />
            )}
          </ProviderShell>
        );
      })}
    </>
  );
};
