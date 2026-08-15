import { Field, FieldRow, Section } from "../../components/Form";
import {
  COMMON_RENDER_SIZES,
  parseRenderSize,
  renderSizeValue,
} from "../../model";
import type { EditorProps } from "./types";

const numberValue = (value: string) => Number(value);

export const General = ({ config, update }: EditorProps) => {
  const selectedSize = renderSizeValue(config.renderDefaults);
  const isCommonSize = COMMON_RENDER_SIZES.some(
    (size) => renderSizeValue(size) === selectedSize,
  );
  const bgm = config.audioDefaults?.globalBgm ?? null;
  return (
    <>
      <Section
        eyebrow="01 / OUTPUT"
        title="通用输出"
        description="这些值是新作品的默认渲染参数；作品创建后由 RenderSpec 冻结。"
      >
        <FieldRow>
          <Field label="画面尺寸" hint="宽 × 高，选择常用输出规格">
            <select
              value={selectedSize}
              onChange={(event) => {
                const size = parseRenderSize(event.target.value);
                update((draft) => {
                  draft.renderDefaults.width = size.width;
                  draft.renderDefaults.height = size.height;
                });
              }}
            >
              {isCommonSize ? null : (
                <option value={selectedSize}>
                  当前自定义 · {config.renderDefaults.width} ×{" "}
                  {config.renderDefaults.height}
                </option>
              )}
              {COMMON_RENDER_SIZES.map((size) => (
                <option
                  key={renderSizeValue(size)}
                  value={renderSizeValue(size)}
                >
                  {size.label}
                </option>
              ))}
            </select>
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
      <Section
        eyebrow="AUDIO / DEFAULT"
        title="全局 BGM"
        description="保存本地 BGM 默认值；文件位置以仓库根目录为起点，不接受绝对路径。"
      >
        <FieldRow>
          <Field
            label="BGM 文件"
            hint="例如 public/audio/default-bgm.mp3；留空表示不配置"
          >
            <input
              value={bgm?.sourcePath ?? ""}
              placeholder="public/audio/default-bgm.mp3"
              onChange={(event) =>
                update((draft) => {
                  const sourcePath = event.target.value;
                  draft.audioDefaults = {
                    globalBgm:
                      sourcePath === ""
                        ? null
                        : {
                            sourcePath,
                            volume:
                              draft.audioDefaults?.globalBgm?.volume ?? 0.15,
                          },
                  };
                })
              }
            />
          </Field>
          <Field label="BGM 音量" hint="线性音量，0 为静音，1 为原始音量">
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              disabled={bgm === null}
              value={bgm?.volume ?? 0.15}
              onChange={(event) =>
                update((draft) => {
                  if (
                    draft.audioDefaults?.globalBgm === null ||
                    draft.audioDefaults === undefined
                  ) {
                    return;
                  }
                  draft.audioDefaults.globalBgm.volume = numberValue(
                    event.target.value,
                  );
                })
              }
            />
          </Field>
        </FieldRow>
      </Section>
    </>
  );
};
export const SafeArea = ({ config, update }: EditorProps) => {
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
