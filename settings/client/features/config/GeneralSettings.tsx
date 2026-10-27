import { DEFAULT_RENDER_TIMEOUT_MINUTES } from "@axmorf/studio/contracts";

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
  return (
    <>
      <Section
        eyebrow="01 / OUTPUT"
        title="通用输出"
        description="film:new 把这些值写入新作品的 film.json；用户为单个作品指定的尺寸与帧率不改这里。"
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
          <Field
            label="渲染超时（分钟）"
            hint="单次渲染最长时间，15–120；长片或高分辨率调到 45–60，而不是降低画质或帧率"
          >
            <input
              type="number"
              min={15}
              max={120}
              value={
                config.renderDefaults.renderTimeoutMinutes ??
                DEFAULT_RENDER_TIMEOUT_MINUTES
              }
              onChange={(event) =>
                update((draft) => {
                  draft.renderDefaults.renderTimeoutMinutes = numberValue(
                    event.target.value,
                  );
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
    </>
  );
};
