import type { VoxcpmProviderConfig } from "../../../contracts/api";
import { Field, FieldRow, Section } from "../../components/Form";
import {
  nextUniqueId,
  removeVoiceProfile,
  selectProviderAndVoice,
} from "../../model";
import type { EditorProps } from "./types";

const numberValue = (value: string) => Number(value);

export const Tts = ({
  config,
  provider,
  update,
}: EditorProps & { readonly provider: VoxcpmProviderConfig }) => {
  const replaceProvider = (next: VoxcpmProviderConfig) =>
    update((draft) => {
      draft.tts.providers = draft.tts.providers.map((item) =>
        item.id === provider.id ? next : item,
      );
      if (
        draft.tts.defaultProviderId === next.id &&
        !next.voiceProfiles.some(
          ({ id }) => id === draft.tts.defaultVoiceProfileId,
        )
      ) {
        const first = next.voiceProfiles[0];
        if (first === undefined) {
          throw new Error("Provider 必须至少保留一个声线。");
        }
        draft.tts.defaultVoiceProfileId = first.id;
      }
    });
  const patchProvider = (patch: Partial<VoxcpmProviderConfig>) =>
    replaceProvider({ ...provider, ...patch });
  const addProfile = () =>
    patchProvider({
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
                  selectProviderAndVoice(draft, event.target.value);
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
                hint="仓库根目录相对路径"
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
                  update((draft) => {
                    removeVoiceProfile(draft, provider.id, profile.id);
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
                <Field label="Prompt 文本文件" hint="仓库根目录相对路径">
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
